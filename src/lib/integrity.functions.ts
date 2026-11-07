import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { importSigningKey, signGrant, type GrantPayload } from "@/lib/integrity/grant";

/**
 * سلامة الحقيقة — المصادر، والأقفال، وطلبات الفكّ، والاختلافات، والإذن
 * الموقّع. كل قرارٍ هنا يمرّ بدوالّ القاعدة التي تفرض الإدارة والموافقتين؛
 * هذه الطبقة تنقل ولا تحرس.
 */
type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
const rpc = (client: unknown) => client as RpcClient;

export type SourceChecklist = Record<
  "key_issued" | "first_sync" | "reconciled" | "org_linked" | "office_reviewed" | "regions_mapped",
  boolean
>;
export type SourceRow = {
  key: string;
  name: string;
  country: string;
  country_name: string;
  country_status: "planned" | "active" | "paused" | "emergency";
  emergency_note: string | null;
  status: "onboarding" | "trial" | "active" | "paused";
  base_url: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  last_reconcile_at: string | null;
  mirrored: number;
  locked: number;
  open_discrepancies: number;
  batches: number;
  checklist: SourceChecklist;
};
export type SourcesOverview = {
  sources: SourceRow[];
  pending_unlocks: number;
  open_discrepancies: number;
  locked_total: number;
};

export type UnlockOp = "edit" | "archive" | "unlock" | "rowad_update" | "rowad_delete";
export type UnlockRequest = {
  id: string;
  orphan_id: string;
  orphan: string;
  code: string;
  op: UnlockOp;
  patch: Record<string, unknown>;
  reason: string;
  document: string | null;
  status: "pending" | "approved" | "rejected" | "applied" | "granted" | "expired";
  approvals: number;
  quorum: number;
  mine: boolean;
  i_approved: boolean;
  expires_at: string | null;
  created_at: string;
};
export type Discrepancy = {
  id: string;
  orphan_id: string;
  orphan: string;
  code: string;
  source: string | null;
  changes: Record<string, { was: unknown; proposed: unknown }>;
  created_at: string;
};
export type IntegrityQueue = {
  requests: UnlockRequest[];
  discrepancies: Discrepancy[];
  recent: Array<{
    id: number;
    at: string;
    kind: string;
    orphan_id: string | null;
    source: string | null;
    hash: string;
  }>;
};

/** رسائل القاعدة ← جملٌ مفهومة. */
function explain(message: string): string {
  const m: Array<[RegExp, string]> = [
    [/requester_cannot_approve/, "لا يوافق مقدّم الطلب على طلبه."],
    [/already_approved/, "وافقتَ على هذا الطلب من قبل."],
    [/request_not_pending|request_not_open/, "الطلب لم يعد مفتوحاً."],
    [/request_not_approved/, "الطلب لم يكتمل اعتماده، أو انتهت نافذته."],
    [/request_already_pending/, "يوجد طلبٌ مفتوح من النوع نفسه لهذا الطفل."],
    [/patch_fields_not_allowed/, "حقلٌ لا يُفتح بطلب، أو لا تعديل محدّد."],
    [/orphan_not_locked/, "هذا الملفّ غير مقفول؛ يُعدَّل من مكانه."],
    [/orphan_not_linked/, "الملفّ غير مرتبطٍ بمنصّة تشغيل."],
    [/country_not_active/, "الدولة ليست مفعّلة."],
    [/note_required/, "اكتب سبب وضع الطوارئ."],
    [/admin_only/, "للإدارة وحدها."],
  ];
  return m.find(([re]) => re.test(message))?.[1] ?? "تعذّر التنفيذ.";
}

type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string };
async function call<T>(
  client: unknown,
  fn: string,
  args?: Record<string, unknown>,
): Promise<Result<T>> {
  const { data, error } = await rpc(client).rpc(fn, args);
  return error ? { ok: false, error: explain(error.message) } : { ok: true, data: data as T };
}

export const getSourcesOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const r = await call<SourcesOverview>(context.supabase, "admin_sources_overview");
    return JSON.stringify(r.ok ? r.data : null);
  });

export const getIntegrityQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const r = await call<IntegrityQueue>(context.supabase, "admin_integrity_queue");
    return JSON.stringify(r.ok ? r.data : null);
  });

export const verifyIntegrity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const r = await call<{ ok: boolean; checked: number; broken_at?: number }>(
      context.supabase,
      "integrity_verify",
    );
    return r.ok ? r.data : { ok: false, checked: 0 };
  });

export const setSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        key: z.string().regex(/^[a-z0-9-]{2,40}$/),
        status: z.enum(["onboarding", "trial", "active", "paused"]).nullable(),
        officeReviewed: z.boolean().nullable(),
        regionsMapped: z.boolean().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const r = await call<{ ok: boolean; missing?: string[] }>(
      context.supabase,
      "admin_set_source",
      {
        _key: data.key,
        _status: data.status,
        _office_reviewed: data.officeReviewed,
        _regions_mapped: data.regionsMapped,
      },
    );
    if (!r.ok) return { ok: false as const, error: r.error };
    return r.data.ok
      ? { ok: true as const }
      : { ok: false as const, error: "قائمة التحقّق لم تكتمل.", missing: r.data.missing ?? [] };
  });

export const setCountryEmergency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        code: z.string().regex(/^[A-Z]{2}$/),
        on: z.boolean(),
        note: z.string().max(500).nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const r = await call(context.supabase, "admin_set_country_emergency", {
      _code: data.code,
      _on: data.on,
      _note: data.note,
    });
    return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
  });

export const requestUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        orphanId: z.string().uuid(),
        op: z.enum(["edit", "archive", "unlock", "rowad_update", "rowad_delete"]),
        patch: z.record(z.string(), z.unknown()).default({}),
        reason: z.string().trim().min(10).max(2000),
        document: z.string().trim().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const r = await call<string>(context.supabase, "admin_request_unlock", {
      _orphan: data.orphanId,
      _op: data.op,
      _patch: data.patch,
      _reason: data.reason,
      _document: data.document ?? null,
    });
    return r.ok ? { ok: true as const, id: r.data } : { ok: false as const, error: r.error };
  });

const byId = z.object({ id: z.string().uuid() });

export const approveUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => byId.parse(i))
  .handler(async ({ data, context }) => {
    const r = await call<{ approvals: number; quorum: number }>(
      context.supabase,
      "admin_approve_unlock",
      {
        _request: data.id,
      },
    );
    return r.ok ? { ok: true as const, ...r.data } : { ok: false as const, error: r.error };
  });

export const rejectUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => byId.extend({ note: z.string().max(1000).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const r = await call(context.supabase, "admin_reject_unlock", {
      _request: data.id,
      _note: data.note ?? null,
    });
    return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
  });

export const applyUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => byId.parse(i))
  .handler(async ({ data, context }) => {
    const r = await call<{ ok: boolean; code?: string }>(context.supabase, "admin_apply_unlock", {
      _request: data.id,
    });
    if (!r.ok) return { ok: false as const, error: r.error };
    return r.data.ok
      ? { ok: true as const }
      : { ok: false as const, error: "انتهت نافذة الطلب (15 دقيقة). اطلب من جديد." };
  });

/**
 * الإذن لمنصّة التشغيل. المفتاح يُفحص **قبل** إصدار الحمولة، لأن إصدارها
 * يُغلق الطلب: لا يُستهلك طلبٌ معتمد ثم يفشل التوقيع.
 */
export const issueGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => byId.parse(i))
  .handler(async ({ data, context }) => {
    const raw = process.env["GRANT_SIGNING_KEY"];
    if (!raw) {
      return {
        ok: false as const,
        error:
          "مفتاح التوقيع غير مضبوط (GRANT_SIGNING_KEY في إعدادات Lovable Cloud). الطلب ما زال معتمداً.",
      };
    }
    let key: CryptoKey;
    try {
      key = await importSigningKey(raw);
    } catch {
      return { ok: false as const, error: "مفتاح التوقيع غير صالح. الطلب ما زال معتمداً." };
    }
    const r = await call<GrantPayload>(context.supabase, "admin_grant_payload", {
      _request: data.id,
    });
    if (!r.ok) return { ok: false as const, error: r.error };
    return { ok: true as const, token: await signGrant(r.data, key), payload: r.data };
  });

export const resolveDiscrepancy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    byId.extend({ accept: z.boolean(), reason: z.string().trim().min(10).max(2000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const r = await call<string | null>(context.supabase, "admin_resolve_discrepancy", {
      _id: data.id,
      _accept: data.accept,
      _reason: data.reason,
    });
    return r.ok ? { ok: true as const, requestId: r.data } : { ok: false as const, error: r.error };
  });
