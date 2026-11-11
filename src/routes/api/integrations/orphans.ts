import { createFileRoute } from "@tanstack/react-router";

import { digest } from "@/lib/integrations/auth";
import {
  apiError,
  apiOk,
  authFailureResponse,
  authenticateClient,
  guardApiRate,
  guardClientRate,
  guardReplay,
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
        const clientLimited = await guardClientRate(auth.client);
        if (clientLimited) return clientLimited;
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
          _country: url.searchParams.get("country") as never,
          _region: url.searchParams.get("region") as never,
          _age_band: url.searchParams.get("age_band") as never,
          _gender: url.searchParams.get("gender") as never,
          _funding: url.searchParams.get("funding") as never,
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
        const clientLimited = await guardClientRate(auth.client);
        if (clientLimited) return clientLimited;
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
            "الحمولة أكبر من 2 ميغابايت.",
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

        const replay = await guardReplay(request, auth.client, raw);
        if (replay) return replay;

        /* مفتاح التكرار: الشبكة تُعيد الإرسال عند أي شكّ، فبلا هذا
           تُنشأ ملفّاتٌ مكرّرة لأطفالٍ حقيقيين. وغيابُه مقبول، لكنّ
           وجوده هو الفرق بين إعادةٍ آمنة وإعادةٍ مكلفة.
           APP-12: المفتاح يُحجز ذرّياً قبل المعالجة، فإعادتان متزامنتان لا
           تستوردان معاً — الثانية تأخذ «قيد المعالجة» أو النتيجة الأولى. */
        const idem = request.headers.get("idempotency-key");
        const requestDigest = digest(raw);
        const rpcAny = supabaseAdmin as unknown as {
          rpc: (
            fn: string,
            args: Record<string, unknown>,
          ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
        };
        let jobId: string | null = null;

        if (idem) {
          const { data: reservation, error: reserveError } = await rpcAny.rpc(
            "api_reserve_import",
            {
              _client: auth.client.id,
              _source: auth.client.client_key,
              _key: idem,
              _digest: requestDigest,
              _received: records.length,
            },
          );
          if (reserveError) {
            const { logServerError } = await import("@/lib/server-log");
            const ref = logServerError("integrations.import.reserve", reserveError);
            return apiError(
              "temporarily_unavailable",
              503,
              "تعذّر حجز مفتاح التكرار. أعد المحاولة بعد قليل.",
              "Could not reserve the idempotency key. Retry shortly.",
              { ref },
            );
          }
          const r = (reservation ?? {}) as {
            reserved?: boolean;
            id?: string;
            state?: string;
            result?: Record<string, unknown>;
          };
          if (!r.reserved) {
            if (r.state === "digest_mismatch") {
              return apiError(
                "idempotency_key_reused",
                409,
                "مفتاح التكرار نفسه استُعمل لحمولة مختلفة.",
                "The same idempotency key was used with a different body.",
              );
            }
            if (r.state === "processing") {
              return apiError(
                "idempotency_in_progress",
                409,
                "طلبٌ بالمفتاح نفسه قيد المعالجة. أعد المحاولة بعد قليل.",
                "A request with this idempotency key is still processing. Retry shortly.",
              );
            }
            return apiOk({ replayed: true, ...(r.result ?? {}) });
          }
          jobId = r.id ?? null;
        }

        const results: Array<Record<string, unknown>> = [];
        let created = 0;
        let updated = 0;
        let rejected = 0;

        for (const record of records) {
          const { data, error } = await db.rpc("import_orphan_record", {
            _client: auth.client.id,
            _payload: record as never,
          });
          if (error) {
            // APP-11: الرسالة الخام في السجلّ، والشريك يأخذ رمزاً ومرجعاً.
            const { classifyError, logServerError } = await import("@/lib/server-log");
            const ref = logServerError("integrations.import.record", error, {
              client: auth.client.id,
            });
            rejected += 1;
            results.push({ ok: false, code: "import_failed", reason: classifyError(error), ref });
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

        if (jobId) {
          await rpcAny.rpc("api_finish_import", {
            _job: jobId,
            _created: created,
            _updated: updated,
            _failed: rejected,
            _result: summary,
          });
        } else {
          await db.from("api_import_jobs").insert({
            client_id: auth.client.id,
            source: auth.client.client_key,
            idempotency_key: null,
            request_digest: requestDigest,
            received_count: records.length,
            created_count: created,
            updated_count: updated,
            failed_count: rejected,
            result: summary as never,
          });
        }

        await db.rpc("touch_api_client", { _client: auth.client.id, _imported: true });

        return apiOk(summary, rejected > 0 && created + updated === 0 ? 422 : 200);
      },
    },
  },
});
