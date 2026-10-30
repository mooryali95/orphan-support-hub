import { createFileRoute } from "@tanstack/react-router";

import { digest } from "@/lib/integrations/auth";
import {
  apiError,
  apiOk,
  authFailureResponse,
  authenticateClient,
  guardApiRate,
  hasScope,
  readBodyCapped,
} from "@/lib/integrations/client";

/**
 * بوّابة التكامل — `/api/integrations/orphans`.
 *
 * `GET`  — بطاقات المستفيدين كما يراها الزائر، مع الفلترة نفسها.
 * `POST` — استيراد دفعةٍ من منصّةٍ شريكة.
 *
 * وقاعدتان تحكمان البوّابة:
 *
 *   **المفتاح لا يلتفّ على حاجب الأطفال.** القراءة تُعيد البطاقة لا
 *   الملفّ: لا قصّة ولا صورة ولا مدينة ولا تاريخ ميلاد. ومفتاحُ شريكٍ
 *   ليس إذناً برؤية ملفّ طفل؛ الإذن يُطلَب ويُمنح لشخصٍ بعينه.
 *
 *   **المستورَد لا يُنشَر.** يقف عند `under_review` مهما قالت الحمولة،
 *   والحارس في القاعدة لا هنا — فالاستيراد يمرّ بـ`service_role` التي
 *   تتجاوز RLS.
 */

const MAX_BATCH = 100;

export const Route = createFileRoute("/api/integrations/orphans")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = await guardApiRate(request);
        if (limited) return limited;
        const auth = await authenticateClient(request);
        if (!auth.ok) return authFailureResponse(auth.failure);
        if (!hasScope(auth.client, "orphans:read")) {
          return apiError(
            "scope_denied",
            403,
            "المفتاح لا يحمل النطاق orphans:read.",
            "The key lacks the orphans:read scope.",
          );
        }

        const url = new URL(request.url);
        const num = (name: string, fallback: number) => {
          const raw = url.searchParams.get(name);
          const n = raw === null ? NaN : Number(raw);
          return Number.isFinite(n) ? n : fallback;
        };

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { withIntegration } = await import("@/integrations/supabase/types.extra");
        const db = withIntegration(supabaseAdmin);
        const { data, error } = await db.rpc("api_orphan_cards", {
          _client: auth.client.id,
          _country: url.searchParams.get("country"),
          _region: url.searchParams.get("region"),
          _age_band: url.searchParams.get("age_band"),
          _gender: url.searchParams.get("gender"),
          _funding: url.searchParams.get("funding"),
          _limit: num("limit", 50),
          _offset: num("offset", 0),
        });

        if (error) {
          return apiError("read_failed", 500, "تعذّرت القراءة.", "Read failed.");
        }
        const payload = (data ?? {}) as { ok?: boolean; rows?: unknown[]; total?: number };
        if (payload.ok !== true) {
          return apiError(
            "client_not_permitted",
            403,
            "المفتاح غير مخوَّل بهذه العملية.",
            "The key is not permitted for this operation.",
          );
        }

        await db.rpc("touch_api_client", { _client: auth.client.id, _imported: false });

        return apiOk({ rows: payload.rows ?? [], total: payload.total ?? 0 });
      },

      POST: async ({ request }) => {
        const limited = await guardApiRate(request);
        if (limited) return limited;
        const auth = await authenticateClient(request);
        if (!auth.ok) return authFailureResponse(auth.failure);
        if (!hasScope(auth.client, "orphans:import")) {
          return apiError(
            "scope_denied",
            403,
            "المفتاح لا يحمل النطاق orphans:import.",
            "The key lacks the orphans:import scope.",
          );
        }

        const capped = await readBodyCapped(request);
        if (!capped.ok) {
          return apiError(
            "body_too_large",
            413,
            "الحمولة أكبر من ٢ ميغابايت.",
            "Body exceeds 2 MB.",
          );
        }
        const raw = capped.text;
        let body: { records?: unknown };
        try {
          body = JSON.parse(raw) as { records?: unknown };
        } catch {
          return apiError(
            "invalid_json",
            400,
            "الحمولة ليست JSON صالحاً.",
            "Body is not valid JSON.",
          );
        }

        const records = Array.isArray(body.records) ? body.records : null;
        if (!records || records.length === 0) {
          return apiError(
            "records_required",
            400,
            "الحمولة تحتاج مصفوفة records غير فارغة.",
            "Body requires a non-empty records array.",
          );
        }
        if (records.length > MAX_BATCH) {
          return apiError(
            "batch_too_large",
            413,
            `الدفعة أكبر من ${MAX_BATCH} سجلّاً.`,
            `Batch exceeds ${MAX_BATCH} records.`,
            { max_batch: MAX_BATCH },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { withIntegration } = await import("@/integrations/supabase/types.extra");
        const db = withIntegration(supabaseAdmin);

        /* مفتاح التكرار: الشبكة تُعيد الإرسال عند أي شكّ، فبلا هذا
           تُنشأ ملفّاتٌ مكرّرة لأطفالٍ حقيقيين. وغيابُه مقبول، لكنّ
           وجوده هو الفرق بين إعادةٍ آمنة وإعادةٍ مكلفة. */
        const idem = request.headers.get("idempotency-key");
        const requestDigest = digest(raw);

        if (idem) {
          const { data: prior } = await db
            .from("api_import_jobs")
            .select("id, request_digest, result")
            .eq("client_id", auth.client.id)
            .eq("idempotency_key", idem)
            .maybeSingle();
          const seen = prior as { request_digest?: string; result?: unknown } | null;
          if (seen) {
            if (seen.request_digest !== requestDigest) {
              return apiError(
                "idempotency_key_reused",
                409,
                "مفتاح التكرار نفسه استُعمل لحمولة مختلفة.",
                "The same idempotency key was used with a different body.",
              );
            }
            return apiOk({ replayed: true, ...(seen.result as Record<string, unknown>) });
          }
        }

        const results: Array<Record<string, unknown>> = [];
        let created = 0;
        let updated = 0;
        let rejected = 0;

        for (const record of records) {
          const { data, error } = await db.rpc("import_orphan_record", {
            _client: auth.client.id,
            _payload: record as Record<string, unknown>,
          });
          if (error) {
            rejected += 1;
            results.push({ ok: false, code: "import_failed", detail: error.message });
            continue;
          }
          const r = (data ?? {}) as Record<string, unknown>;
          if (r["ok"] === true) {
            if (r["action"] === "created") created += 1;
            else updated += 1;
          } else {
            rejected += 1;
          }
          results.push(r);
        }

        const summary = {
          received: records.length,
          created,
          updated,
          rejected,
          results,
          // يُقال صراحةً: لا شيء يُنشر بالاستيراد.
          note_ar: "كل سجلّ مستورَد يقف عند under_review حتى تعتمده الإدارة.",
          note_en: "Every imported record stays under_review until our admins approve it.",
        };

        await db.from("api_import_jobs").insert({
          client_id: auth.client.id,
          source: auth.client.client_key,
          idempotency_key: idem,
          request_digest: requestDigest,
          received_count: records.length,
          created_count: created,
          updated_count: updated,
          failed_count: rejected,
          result: summary,
        });

        await db.rpc("touch_api_client", { _client: auth.client.id, _imported: true });

        return apiOk(summary, rejected > 0 && created + updated === 0 ? 422 : 200);
      },
    },
  },
});
