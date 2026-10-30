import { createFileRoute } from "@tanstack/react-router";

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
 * بوّابة المزامنة — `/api/integrations/mirror` (POST).
 *
 * منصّة التشغيل (الرواد) تدفع دفعاتٍ لكلّ كيان:
 *
 *   { "entity": "groups" | "students" | "trait_dimensions" | "traits" | "trait_scores",
 *     "records": [...], "deleted": ["ref", ...], "cursor": { "at": ISO, "ref": "..." } }
 *
 * أو تطلب مطابقةً بكلّ المعرّفات:
 *
 *   { "entity": "...", "reconcile": ["ref", ...] }
 *
 * المفتاح يحمل `mirror:write` ومرتبطٌ بمنصّةٍ واحدة. الطلاب يصلون «قيد
 * المراجعة» دائماً، والحذف علامةٌ لا مسح. التفصيل في docs/rowad-sync.ar.md.
 */

const ENTITIES = new Set(["groups", "students", "trait_dimensions", "traits", "trait_scores"]);
const MAX_BATCH = 500;
const MAX_RECONCILE = 20_000;

type Body = {
  entity?: string;
  records?: unknown[];
  deleted?: unknown[];
  cursor?: { at?: string; ref?: string };
  reconcile?: unknown[];
};

export const Route = createFileRoute("/api/integrations/mirror")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await guardApiRate(request);
        if (limited) return limited;
        const auth = await authenticateClient(request);
        if (!auth.ok) return authFailureResponse(auth.failure);
        if (!hasScope(auth.client, "mirror:write")) {
          return apiError(
            "scope_denied",
            403,
            "المفتاح لا يحمل النطاق mirror:write.",
            "The key lacks the mirror:write scope.",
          );
        }

        const raw = await readBodyCapped(request);
        if (!raw.ok) {
          return apiError(
            "body_too_large",
            413,
            "الحمولة أكبر من ٢ ميغابايت.",
            "Body exceeds 2 MB.",
          );
        }
        let body: Body;
        try {
          body = JSON.parse(raw.text) as Body;
        } catch {
          return apiError(
            "invalid_json",
            400,
            "الحمولة ليست JSON صالحاً.",
            "Body is not valid JSON.",
          );
        }
        if (!body.entity || !ENTITIES.has(body.entity)) {
          return apiError("unknown_entity", 400, "الكيان غير معروف.", "Unknown entity.", {
            entities: [...ENTITIES],
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as unknown as {
          rpc: (
            fn: string,
            args: Record<string, unknown>,
          ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
        };

        if (Array.isArray(body.reconcile)) {
          if (body.reconcile.length > MAX_RECONCILE) {
            return apiError(
              "batch_too_large",
              413,
              "قائمة المطابقة أكبر من الحدّ.",
              "Reconcile list too large.",
            );
          }
          const { data, error } = await db.rpc("mirror_reconcile", {
            _client: auth.client.id,
            _entity: body.entity,
            _refs: body.reconcile.map(String),
          });
          if (error)
            return apiError("reconcile_failed", 500, "تعذّرت المطابقة.", "Reconcile failed.");
          return apiOk(data as Record<string, unknown>);
        }

        const records = Array.isArray(body.records) ? body.records : [];
        const deleted = Array.isArray(body.deleted) ? body.deleted.map(String) : [];
        if (records.length > MAX_BATCH || deleted.length > MAX_BATCH) {
          return apiError(
            "batch_too_large",
            413,
            `الدفعة أكبر من ${MAX_BATCH} سجلّاً.`,
            `Batch exceeds ${MAX_BATCH} records.`,
          );
        }
        const { data, error } = await db.rpc("mirror_apply", {
          _client: auth.client.id,
          _entity: body.entity,
          _records: records,
          _deleted: deleted,
          _cursor_at: body.cursor?.at ?? null,
          _cursor_ref: body.cursor?.ref ?? null,
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
