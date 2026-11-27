import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callRpc, type RpcFailure } from "@/lib/rpc-call";
import {
  MAX_BULK,
  MAX_GOLDEN_ROWS,
  QUEUE_PAGE,
  type BulkResult,
  type ChildFile,
  type Conflict,
  type CountryAccess,
  type CountryHealth,
  type DataAlert,
  type StaffMember,
  type IngestResult,
  type LinkItem,
} from "@/lib/golden-record";

/**
 * مصادر التحقق في الإدارة: صحة البيانات لكل دولة، ووضع المكتب، والرفع،
 * وصندوق التعارضات، وطابور الربط.
 *
 * الطبقة تنقل ولا تحرس: كل دالّةٍ في القاعدة تفحص `is_admin()` بنفسها. وما لم
 * تُطبَّق هجرته بعد يعود `missing: true` فتعرض الواجهة «تحتاج تحديث القاعدة».
 */

export type GoldenFailure = RpcFailure;

const code2 = z.string().regex(/^[A-Z]{2}$/);
const sourceKey = z.string().regex(/^[a-z0-9-]{2,40}$/);
const uuid = z.string().uuid();
/** مؤشّر الصفحة التالية كما يعيده البند الأخير (`cursor`)؛ تفسيره في القاعدة. */
export const queuePage = {
  after: z
    .object({ k: z.number().int(), at: z.string().max(40), id: z.string().max(40) })
    .nullable()
    .optional(),
  limit: z.number().int().min(1).max(200).optional(),
};

export const getDataHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => callRpc<CountryHealth[]>(context.supabase, "admin_data_health"));

export const setCountrySource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        country: code2,
        source: sourceKey.nullable(),
        mode: z.enum(["none", "shadow", "active"]),
        staleDays: z.number().int().min(30).max(730).optional(),
      })
      .parse(input),
  )
  .handler(({ data, context }) =>
    callRpc<{ ok: true; from: string; to: string; reevaluated: number }>(
      context.supabase,
      "admin_country_source_set",
      {
        _country: data.country,
        _source: data.source,
        _mode: data.mode,
        _stale_days: data.staleDays ?? null,
      },
    ),
  );

const record = z.object({
  external_ref: z.string().trim().min(1).max(120),
  observed_at: z.string().max(40).optional(),
  fields: z.record(
    z.string().regex(/^[a-z_]{2,40}$/),
    z.union([z.string().max(4000), z.boolean()]),
  ),
});

export const importGolden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        role: z.enum(["wamy", "office"]),
        country: code2,
        source: sourceKey.nullable(),
        records: z.array(record).min(1).max(MAX_GOLDEN_ROWS),
      })
      .parse(input),
  )
  .handler(({ data, context }) =>
    callRpc<IngestResult>(context.supabase, "admin_golden_import", {
      _role: data.role,
      _country: data.country,
      _source: data.role === "wamy" ? null : data.source,
      _records: data.records,
    }),
  );

export const listConflicts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ country: code2.nullable(), ...queuePage }).parse(input),
  )
  .handler(({ data, context }) =>
    callRpc<Conflict[]>(context.supabase, "admin_conflicts", {
      _country: data.country,
      _limit: data.limit ?? QUEUE_PAGE,
      _after: data.after ?? null,
    }),
  );

export const resolveConflict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid,
        choice: z.enum(["accept", "keep", "use_wamy", "use_office", "manual"]),
        value: z.string().trim().max(4000).optional(),
      })
      .parse(input),
  )
  .handler(({ data, context }) =>
    callRpc<{ ok: true }>(context.supabase, "admin_conflict_resolve", {
      _id: data.id,
      _choice: data.choice,
      _value: data.value === undefined ? null : data.value,
    }),
  );

/** حسمٌ جماعي للفروق غير الحرجة: القاعدة تمرّر كل بندٍ بباب الحسم الفردي وتعيد نتيجته. */
export const resolveConflictsBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ids: z.array(uuid).min(1).max(MAX_BULK),
        choice: z.enum(["use_wamy", "use_office", "keep"]),
      })
      .parse(input),
  )
  .handler(({ data, context }) =>
    callRpc<BulkResult>(context.supabase, "admin_conflicts_resolve_bulk", {
      _ids: data.ids,
      _choice: data.choice,
    }),
  );

/** ملف الطفل الموحّد للفريق، بنطاق دولته (`country_can … 'read'`). */
export const getChildFile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(({ data, context }) =>
    callRpc<ChildFile>(context.supabase, "country_child_file", { _orphan: data.id }),
  );

export const listLinkQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ country: code2.nullable(), ...queuePage }).parse(input),
  )
  .handler(({ data, context }) =>
    callRpc<LinkItem[]>(context.supabase, "admin_link_queue", {
      _country: data.country,
      _limit: data.limit ?? QUEUE_PAGE,
      _after: data.after ?? null,
    }),
  );

export const resolveLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid,
        action: z.enum(["link", "create", "ignore"]),
        orphanId: uuid.optional(),
      })
      .parse(input),
  )
  .handler(({ data, context }) =>
    callRpc<{ ok: true }>(context.supabase, "admin_link_resolve", {
      _id: data.id,
      _action: data.action,
      _orphan: data.orphanId ?? null,
    }),
  );

export const createUnmatched = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ country: code2 }).parse(input))
  .handler(({ data, context }) =>
    callRpc<{ ok: true; created: number; failed: number }>(
      context.supabase,
      "admin_link_create_unmatched",
      { _country: data.country },
    ),
  );

/* ── محرّك التحقق: التنبيهات وشارة الكافل ───────────────────────── */

export const listAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ country: code2.nullable(), ...queuePage }).parse(input),
  )
  .handler(({ data, context }) =>
    callRpc<DataAlert[]>(context.supabase, "admin_alerts", {
      _country: data.country,
      _limit: data.limit ?? QUEUE_PAGE,
      _after: data.after ?? null,
    }),
  );

export const resolveAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid,
        status: z.enum(["reviewed", "false_positive", "confirmed"]),
        note: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(({ data, context }) =>
    callRpc<{ ok: true }>(context.supabase, "admin_alert_resolve", {
      _id: data.id,
      _status: data.status,
      _note: data.note ?? null,
    }),
  );

/* ── صلاحيات الدول ──────────────────────────────────────────────── */

export const getMyCountryAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => callRpc<CountryAccess>(context.supabase, "my_country_access"));

export const listCountryStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ country: code2 }).parse(input))
  .handler(({ data, context }) =>
    callRpc<StaffMember[]>(context.supabase, "country_staff_list", { _country: data.country }),
  );

export const setCountryStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        country: code2,
        email: z.string().trim().toLowerCase().email().max(254),
        role: z.enum(["supervisor", "data_entry", "viewer"]).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const args = { _country: data.country, _email: data.email, _role: data.role };
    const first = await callRpc<{ ok: true }>(context.supabase, "country_staff_set", args);
    // بريدٌ بلا حساب: القاعدة تقول ذلك لمن يملك الإدارة وحده، وبعد فحص الدور. فتُرسل
    // دعوة المصادقة (قالب «invite») ويُسند الدور للحساب الجديد في الخطوة نفسها.
    if (first.ok || first.error !== "user_not_found" || data.role === null) {
      return { ...first, invited: false };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { appBaseUrl } = await import("@/lib/env.server");
    const base = appBaseUrl();
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      ...(base ? { redirectTo: `${base}/country-data` } : {}),
    });
    if (error)
      return { ok: false as const, missing: false, error: "invite_failed", invited: false };
    const second = await callRpc<{ ok: true }>(context.supabase, "country_staff_set", args);
    return { ...second, invited: second.ok };
  });
