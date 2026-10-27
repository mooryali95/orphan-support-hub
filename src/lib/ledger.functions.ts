import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * سجلّ الكفالة، ومراجعة رسائل الكفلاء، وتأكيد وصول الدعم.
 *
 * كل دالّة تنادي بابها في القاعدة، والقاعدة تفحص الصلة: الكافل يقرأ
 * سجلّ كفالته وحده، والجهة وحدها تؤكّد الوصول، ودائرة الطفل وحدها
 * تراجع الرسائل.
 */

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
const rpc = (client: unknown) => client as RpcClient;

export type LedgerMonth = {
  month: string;
  upcoming: boolean;
  due: number;
  paid: number;
  payment_status: "pending" | "paid" | "failed" | "refunded" | "disputed" | null;
  delivery_status: "scheduled" | "transferred" | "delivered" | null;
  delivered_at: string | null;
};

export type SponsorshipLedger = {
  sponsorship: {
    id: string;
    amount: number;
    currency: string;
    status: string;
    type: string;
    started_at: string | null;
    next_charge_at: string | null;
    is_anonymous: boolean;
    message: string | null;
    message_status: "none" | "pending" | "approved" | "rejected";
    created_at: string;
  };
  orphan: {
    id: string;
    code: string;
    display_name: string;
    country: string | null;
    age_band: string;
  };
  months: LedgerMonth[];
  totals: { paid: number; months_paid: number; months_delivered: number };
};

export type PendingMessage = {
  sponsorship_id: string;
  orphan_id: string;
  orphan: string;
  message: string;
  created_at: string;
};

export type PendingDelivery = {
  id: string;
  orphan_id: string;
  orphan: string;
  amount: number;
  currency: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};

export const getSponsorshipLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sponsorshipId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: l, error } = await rpc(context.supabase).rpc("sponsorship_ledger", {
      _sponsorship: data.sponsorshipId,
    });
    if (error) return { ok: false as const, ledger: null };
    return { ok: true as const, ledger: l as SponsorshipLedger };
  });

export const getOrgInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = rpc(context.supabase);
    const [m, d] = await Promise.all([
      db.rpc("sponsor_messages_for_review"),
      db.rpc("org_pending_deliveries"),
    ]);
    return {
      ok: !m.error && !d.error,
      messages: (m.data ?? []) as PendingMessage[],
      deliveries: (d.data ?? []) as PendingDelivery[],
    };
  });

export const moderateMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ sponsorshipId: z.string().uuid(), approve: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await rpc(context.supabase).rpc("moderate_sponsor_message", {
      _sponsorship: data.sponsorshipId,
      _approve: data.approve,
    });
    return error ? { ok: false as const } : { ok: true as const };
  });

export const confirmDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        disbursementId: z.string().uuid(),
        proofPath: z.string().trim().min(3).max(500),
        note: z.string().trim().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await rpc(context.supabase).rpc("confirm_disbursement_delivery", {
      _disbursement: data.disbursementId,
      _proof_path: data.proofPath,
      _note: data.note || null,
    });
    return error
      ? { ok: false as const, error: error.message }
      : { ok: true as const, error: null };
  });

export const MESSAGE_STATUS_LABELS: Record<
  SponsorshipLedger["sponsorship"]["message_status"],
  string
> = {
  none: "",
  pending: "رسالتك قيد مراجعة جهة الرعاية قبل وصولها",
  approved: "وصلت رسالتك",
  rejected: "لم تُعتمد رسالتك — راجعتها جهة الرعاية حمايةً للطفل",
};

/** حالة الشهر بجملةٍ واحدة يفهمها الكافل. */
export function monthState(m: LedgerMonth): {
  label: string;
  tone: "done" | "progress" | "wait" | "issue";
} {
  if (m.upcoming) return { label: "مستحَقّ قادم", tone: "wait" };
  if (m.delivery_status === "delivered") return { label: "وصل الطفل · موثّق", tone: "done" };
  if (m.delivery_status === "transferred")
    return { label: "حُوِّل للجهة · بانتظار تأكيد الوصول", tone: "progress" };
  if (m.paid > 0) return { label: "دُفع · بانتظار التحويل", tone: "progress" };
  if (m.payment_status === "failed") return { label: "تعذّر الدفع", tone: "issue" };
  return { label: "بانتظار الدفع", tone: "wait" };
}
