import { createFileRoute } from "@tanstack/react-router";

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

import { untypedRpc } from "@/lib/rpc-call";

import { withoutIdempotencyKey } from "./-mirror-payload";

/**
 * بوّابة السجلّ الذهبي — `/api/integrations/records` (POST).
 *
 *   { "country": "AL",
 *     "records": [{ "external_ref": "W-1", "observed_at": ISO?,
 *                   "fields": { "display_name": "…", "education_stage": "…" } }] }
 *
 * مفتاح `records:primary` يكتب باسم الندوة (بلا منصّة)، ومفتاح `records:verify`
 * باسم منصّة المكتب المربوط بها، ولا يُقبل إلا والدولة في وضع shadow أو active.
 * القاعدة تقرّر كل شيء (golden_ingest): من يملك الحقل، وما يحتاج اعتماداً،
 * وما يقف في طابور الربط. التفصيل في docs/golden-record.ar.md.
 */

const MAX_BATCH = 2000;

export const Route = createFileRoute("/api/integrations/records")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await guardApiRate(request);
        if (limited) return limited;
        const auth = await authenticateClient(request);
        if (!auth.ok) return authFailureResponse(auth.failure);
        const clientLimited = await guardClientRate(auth.client);
        if (clientLimited) return clientLimited;
        if (!hasScope(auth.client, "records:primary") && !hasScope(auth.client, "records:verify")) {
          return apiError(
            "scope_denied",
            403,
            "المفتاح لا يحمل records:primary ولا records:verify.",
            "The key lacks records:primary or records:verify.",
          );
        }
        const raw = await readBodyCapped(request);
        if (!raw.ok) {
          return apiError(
            "body_too_large",
            413,
            "الحمولة أكبر من 2 ميغابايت.",
            "Body exceeds 2 MB.",
          );
        }
        const replay = await guardReplay(withoutIdempotencyKey(request), auth.client, raw.text);
        if (replay) return replay;
        let body: { country?: unknown; records?: unknown };
        try {
          body = JSON.parse(raw.text) as typeof body;
        } catch {
          return apiError(
            "invalid_json",
            400,
            "الحمولة ليست JSON صالحاً.",
            "Body is not valid JSON.",
          );
        }
        if (typeof body.country !== "string" || !/^[A-Z]{2}$/.test(body.country)) {
          return apiError(
            "country_required",
            400,
            "رمز الدولة مطلوب (حرفان).",
            "Country code required.",
          );
        }
        if (
          !Array.isArray(body.records) ||
          body.records.length === 0 ||
          body.records.length > MAX_BATCH
        ) {
          return apiError(
            "batch_invalid",
            413,
            `الدفعة فارغة أو أكبر من ${MAX_BATCH} سجلّاً.`,
            `Batch is empty or exceeds ${MAX_BATCH} records.`,
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = untypedRpc(supabaseAdmin);
        const { data, error } = await db.rpc("golden_ingest", {
          _client: auth.client.id,
          _country: body.country,
          _records: body.records,
        });
        if (error) return apiError("apply_failed", 500, "تعذّر تطبيق الدفعة.", "Batch failed.");
        const res = data as { ok?: boolean; code?: string };
        if (!res?.ok) {
          return apiError(res?.code ?? "rejected", 422, "رُفضت الدفعة.", "Batch rejected.");
        }
        return apiOk(res as Record<string, unknown>);
      },
    },
  },
});
