import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export const reviewOrphan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        reason: z.string().trim().max(400).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) return { ok: false as const, error: "غير مصرّح" };

    const { error } = await context.supabase
      .from("orphans")
      .update({
        status: data.decision,
        approved_at: data.decision === "approved" ? new Date().toISOString() : null,
        rejection_reason: data.decision === "rejected" ? (data.reason ?? null) : null,
      })
      .eq("id", data.id);

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const reviewOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), decision: z.enum(["approved", "rejected"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) return { ok: false as const, error: "غير مصرّح" };

    const { error } = await context.supabase
      .from("care_organizations")
      .update({ status: data.decision })
      .eq("id", data.id);

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
