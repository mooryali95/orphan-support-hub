import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * صندوق قرارات الإدارة، وسجلّات المنصّة (الدول، أصناف المؤسسات، أدوار
 * المكاتب). كل كتابةٍ هنا تمرّ بسياسات الإدارة في القاعدة.
 */

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
const rpc = (client: unknown) => client as RpcClient;

export type InboxKind =
  | "orphan"
  | "orphan_edit"
  | "org"
  | "transfer"
  | "access"
  | "circle_role"
  | "circle_role_renewal"
  | "donor"
  | "progress_report"
  | "office_report"
  | "pledge"
  | "unlock"
  | "discrepancy"
  | "money_issue";

export type InboxItem = {
  kind: InboxKind;
  id: string;
  title: string;
  subtitle: string;
  created_at: string;
};

export const INBOX_LABELS: Record<InboxKind, string> = {
  orphan: "ملفّ طفل",
  orphan_edit: "تعديل ملفٍّ منشور",
  org: "جهة ميدانية",
  transfer: "تحويل بنكي",
  access: "طلب اطّلاع",
  circle_role: "دورٌ في دائرة طفل",
  circle_role_renewal: "تجديد دورٍ في دائرة طفل",
  donor: "جهة مانحة",
  progress_report: "تقرير جهة",
  office_report: "تقرير مكتب",
  pledge: "تعهّد",
  unlock: "طلب فكّ",
  discrepancy: "اختلافٌ من المصدر",
  money_issue: "مال يحتاج قراراً",
};

/**
 * بندٌ ماليّ (تحصيلٌ بعد الانتهاء، عملةٌ أو مبلغٌ مخالف، إلغاءٌ تعذّر لدى
 * المزوّد، خروج طفل) يُغلق بملاحظةٍ تقول ما فُعل — ويُكتب الأثر في القاعدة.
 */
export const resolveMoneyIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), note: z.string().trim().min(3).max(1000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await rpc(context.supabase).rpc("admin_resolve_money_issue", {
      _issue: data.id,
      _note: data.note,
    });
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

export const getDecisionInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await rpc(context.supabase).rpc("admin_decision_inbox");
    return error ? ([] as InboxItem[]) : ((data ?? []) as InboxItem[]);
  });

export const getDecisionContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ kind: z.string().regex(/^[a-z_]{2,30}$/), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: c, error } = await rpc(context.supabase).rpc("admin_decision_context", {
      _kind: data.kind,
      _id: data.id,
    });
    return JSON.stringify(error ? null : c);
  });

export const reviewOfficeReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), publish: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await rpc(context.supabase).rpc("admin_review_office_report", {
      _report: data.id,
      _publish: data.publish,
    });
    return error
      ? { ok: false as const, error: error.message }
      : { ok: true as const, error: null };
  });

/**
 * قرار الإدارة في دورٍ أسندته جهةٌ لصاحب حساب: لا يدخل أحدٌ دائرة الطفل
 * (الاسم الحقيقي والصورة والصحّة) بإسناد الجهة وحده. والاعتماد لأجلٍ
 * (٣٦٥ يوماً حدّاً في القاعدة)، والرفض يُنهي الدور؛ وكلاهما يُسجَّل.
 */
export const decideCircleRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        approve: z.boolean(),
        days: z.number().int().min(1).max(365).optional(),
        note: z.string().trim().max(400).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await rpc(context.supabase).rpc("decide_enrollment_role", {
      _role: data.id,
      _decision: data.approve ? "approved" : "rejected",
      _days: data.days ?? 365,
      _note: data.note ?? null,
    });
    return error
      ? { ok: false as const, error: error.message }
      : { ok: true as const, error: null };
  });

/**
 * قرار الإدارة في تعديلٍ على ملفٍّ منشور: ما كتبته الجهة أو الشريك بعد
 * الاعتماد (الاسم والقصّة والمدينة والصورة… ونصوص الاحتياج) ممسوكٌ لم
 * يُنشر، والملفّ باقٍ كما رُوجع. القبول يكتبه، والرفض يطويه؛ وكلاهما
 * يُسجَّل ويُشعر الجهة.
 */
export const reviewOrphanEdit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        approve: z.boolean(),
        note: z.string().trim().max(400).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await rpc(context.supabase).rpc("review_orphan_edit", {
      _orphan: data.id,
      _decision: data.approve ? "approved" : "rejected",
      _note: data.note ?? null,
    });
    return error
      ? { ok: false as const, error: error.message }
      : { ok: true as const, error: null };
  });

export const setPledgeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active", "cancelled"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await rpc(context.supabase).rpc("admin_set_pledge_status", {
      _pledge: data.id,
      _status: data.status,
    });
    return error
      ? { ok: false as const, error: error.message }
      : { ok: true as const, error: null };
  });

// ---------------------------------------------------------------------
// سجلّات المنصّة — ثلاثة جداول بأعمدتها المسموحة وحدها
// ---------------------------------------------------------------------
const REGISTRY = {
  countries: {
    key: "code",
    columns: ["code", "name_ar", "name_local", "status", "sort_order"],
  },
  institution_kinds: { key: "key", columns: ["key", "label", "sort_order", "active"] },
  office_roles: {
    key: "key",
    columns: ["key", "label", "can_write", "can_publish", "sort_order"],
  },
} as const;
export type RegistryName = keyof typeof REGISTRY;

type TableClient = {
  from: (t: string) => {
    select: (c: string) => {
      order: (k: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
    upsert: (
      row: Record<string, unknown>,
      opts: { onConflict: string },
    ) => PromiseLike<{ error: { message: string } | null }>;
  };
};

export const listRegistry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ table: z.enum(["countries", "institution_kinds", "office_roles"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const def = REGISTRY[data.table];
    const { data: rows, error } = await (context.supabase as unknown as TableClient)
      .from(data.table)
      .select(def.columns.join(","))
      .order("sort_order");
    return JSON.stringify(error ? [] : rows);
  });

export const upsertRegistry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        table: z.enum(["countries", "institution_kinds", "office_roles"]),
        row: z.record(
          z.string(),
          z.union([z.string().max(120), z.number(), z.boolean(), z.null()]),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const def = REGISTRY[data.table];
    // عمودٌ خارج القائمة لا يُكتب — حتى لو أُرسل.
    const row = Object.fromEntries(
      Object.entries(data.row).filter(([k]) => (def.columns as readonly string[]).includes(k)),
    );
    const { error } = await (context.supabase as unknown as TableClient)
      .from(data.table)
      .upsert(row, { onConflict: def.key });
    return error
      ? { ok: false as const, error: error.message }
      : { ok: true as const, error: null };
  });
