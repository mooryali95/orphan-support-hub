import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withPhase2 } from "@/integrations/supabase/types.extra";
import { REJECTION_CODES } from "@/lib/intake.functions";

export type AdminOverview = {
  currency: string;
  orphans: {
    total: number;
    published: number;
    fully_sponsored: number;
    awaiting_review: number;
    monthly_need: number;
    monthly_funded: number;
    monthly_gap: number;
  };
  organizations: { total: number; approved: number; pending: number };
  sponsors: {
    total: number;
    with_active: number;
    sponsorships: number;
    active: number;
    awaiting_payment: number;
    monthly_committed: number;
  };
  money: {
    collected: number;
    fees: number;
    pending: number;
    failed: number;
    disbursed: number;
    balance: number;
  };
  /**
   * لكلّ عملةٍ مجاميعها (PRD-14). الحقول المجمّعة أعلاه تضيف اليورو إلى
   * الدولار فلا تُعرض؛ وتغيب هذه في قاعدةٍ لم تُطبَّق عليها هجرة ٣أ.
   */
  orphans_by_currency?: Array<{
    currency: string;
    monthly_need: number;
    monthly_funded: number;
    monthly_gap: number;
  }>;
  committed_by_currency?: Array<{ currency: string; amount: number }>;
  money_by_currency?: Array<{
    currency: string;
    collected: number;
    fees: number;
    pending: number;
    failed: number;
    disputed: number;
    disbursed: number;
    balance: number;
  }>;
  /** أوّل صفحةٍ وحدها (١٠٠)؛ والعدد الكلّي معها — والباقي من `listAdminRows`. */
  orphan_rows_total?: number;
  sponsor_rows_total?: number;
  orphan_rows: Array<{
    id: string;
    code: string;
    name: string;
    city: string | null;
    status: string;
    org: string | null;
    need: number;
    funded: number;
    gap: number;
    sponsors: number;
  }>;
  sponsor_rows: Array<{
    id: string;
    email: string | null;
    name: string | null;
    sponsorships: number;
    active: number;
    monthly: number;
    paid: number;
    since: string | null;
  }>;
  pending_orphans: Array<{
    id: string;
    code: string;
    name: string;
    city: string | null;
    region: string | null;
    need: number;
    currency?: string;
    status: string;
    created_at: string;
  }>;
  pending_orgs: Array<{
    id: string;
    name: string;
    city: string | null;
    region: string | null;
    license: string | null;
    email: string | null;
    created_at: string;
  }>;
};

/**
 * صورة النظام كاملة في استعلام واحد: الأيتام والكفلاء وكم كُفل وكم تبقّى.
 *
 * التجميع في القاعدة لا في المتصفّح — فلوحة الإدارة لا تُحمّل صفوف كل
 * الكفالات لتجمعها، ولا تتسرّب صفوف لا يحتاجها العرض. والدالة تفحص الدور
 * بنفسها فترفض غير الإدارة.
 */
export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { withPayments } = await import("@/integrations/supabase/types.extra");
    const { data, error } = await withPayments(context.supabase).rpc("admin_overview");

    // 42501 = ليس مديراً. رسالة الواجهة تكفي بلا كشف تفاصيل.
    if (error) return { allowed: false as const };
    return { allowed: true as const, overview: data as AdminOverview };
  });

/**
 * قرار المراجعة يمرّ عبر `review_orphan` في القاعدة لا عبر UPDATE مباشر.
 *
 * ثلاثة أشياء تكسبها بذلك ولا تكسبها من التحديث المباشر: فحص الدور في
 * نفس المعاملة، وكتابة أثر تدقيقي لا يمكن إغفاله، ورفض الرفض بلا سبب
 * مُهيكل. وكان `audit_log` جدولاً بلا كاتب: اعتماد ملفّ يتيم أو رفضه —
 * وهو قرار يتعلّق بمال ومصير — كان يمرّ بلا أثر يُعرف منه من قرّر
 * ومتى ولماذا (M7).
 */
export const reviewOrphan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "under_review"]),
        code: z.enum(REJECTION_CODES).optional(),
        reason: z.string().trim().max(400).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.decision === "rejected" && !data.code) {
      return { ok: false as const, error: "الرفض يحتاج سبباً مُهيكلاً" };
    }

    const db = withPhase2(context.supabase);
    const { error } = await db.rpc("review_orphan", {
      _id: data.id,
      _decision: data.decision,
      ...(data.code ? { _code: data.code } : {}),
      ...(data.reason ? { _reason: data.reason } : {}),
    });

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const reviewOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "suspended"]),
        reason: z.string().trim().max(400).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = withPhase2(context.supabase);
    const { error } = await db.rpc("review_organization", {
      _id: data.id,
      _decision: data.decision,
      ...(data.reason ? { _reason: data.reason } : {}),
    });

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type AdminOrphanRow = AdminOverview["orphan_rows"][number] & { currency?: string };
export type AdminSponsorRow = AdminOverview["sponsor_rows"][number];

/** صفحةٌ من قائمة الأيتام المنشورين أو الكفلاء، ببحث (PRD-13). */
export const listAdminRows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        list: z.enum(["orphans", "sponsors"]),
        q: z.string().trim().max(120).optional(),
        page: z.number().int().min(0).max(10_000).default(0),
        pageSize: z.number().int().min(10).max(200).default(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await (context.supabase as unknown as RpcClient).rpc(
      "admin_list",
      {
        _list: data.list,
        _q: data.q || null,
        _limit: data.pageSize,
        _offset: data.page * data.pageSize,
      },
    );
    type Cell = string | number | boolean | null;
    if (error) return { ok: false as const, total: 0, rows: [] as Record<string, Cell>[] };
    const out = res as { total: number; rows: Record<string, Cell>[] };
    return { ok: true as const, total: out.total, rows: out.rows };
  });

export const EXPORT_DATASETS = ["orphans", "sponsorships", "payments"] as const;

/**
 * تصدير CSV للإدارة (PRD-13): القاعدة تفحص الدور وتختار الأعمدة — بلا
 * بيانات الطفل السرّية — وتكتب أثر التصدير.
 */
export const exportAdminCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ dataset: z.enum(EXPORT_DATASETS) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as unknown as RpcClient).rpc(
      "admin_export",
      { _dataset: data.dataset },
    );
    if (error) return { ok: false as const, error: "تعذّر التصدير" };
    const { toCsv } = await import("@/lib/csv");
    const list = (rows ?? []) as Record<string, unknown>[];
    return { ok: true as const, csv: toCsv(list), count: list.length };
  });

/**
 * هل بوابة الدفع مهيّأة؟ لجاهزية الاعتماد في لوحة الإدارة: نعم/لا فقط، بلا اسمٍ ولا قيمة.
 * الإدارة وحدها: يُسأل `admin_overview` (يرفض غيرها) قبل الجواب.
 */
export const getPaymentsReady = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { withPayments } = await import("@/integrations/supabase/types.extra");
    const { error } = await withPayments(context.supabase).rpc("admin_overview");
    if (error) return { allowed: false as const, ready: null };
    const { featureReady } = await import("@/lib/env.server");
    return { allowed: true as const, ready: featureReady("payments") };
  });
