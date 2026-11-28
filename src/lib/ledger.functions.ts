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
  /** إيصال الشهر: بصمةٌ قصيرة لحقائقه (null للقادم أو ما لم يحدث فيه شيء). */
  receipt?: string | null;
  /** فواتير الشهر، كلٌّ مربوطةٌ بمعاملتها لدى المزوّد. */
  payments?: LedgerPayment[];
};

export type LedgerPayment = {
  invoice_no: string;
  provider: string | null;
  provider_payment_id: string | null;
  amount: number;
  currency: string;
  status: "paid" | "refunded" | "disputed" | "pending" | "failed";
  paid_at: string | null;
  receipt_url: string | null;
};

export type PaymentLookup =
  | { found: false }
  | {
      found: true;
      invoice_no: string;
      provider: string | null;
      provider_payment_id: string | null;
      amount: number;
      currency: string;
      status: LedgerPayment["status"];
      paid_at: string | null;
      sponsorship_id: string;
      month: string;
      orphan: string;
      orphan_code: string;
      month_receipt: string | null;
      delivery_status: LedgerMonth["delivery_status"];
      anchor: string | null;
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
    region?: string | null;
    age_band: string;
    /** ملفٌّ مثبّت: لا يُحذف ولا تتغيّر هويته إلا بطلبٍ رسمي بموافقتين. */
    locked?: boolean;
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
  pending: "رسالتك قيد مراجعة الجهة الميدانية قبل وصولها",
  approved: "وصلت رسالتك",
  rejected: "لم تُعتمد رسالتك — راجعتها الجهة الميدانية حمايةً للطفل",
};

const MONTH_STATE = {
  ar: {
    upcoming: "مستحَقّ قادم",
    delivered: "وصل الطفل · موثّق",
    transferred: "حُوِّل للجهة · بانتظار تأكيد الوصول",
    paid: "دُفع · بانتظار التحويل",
    failed: "تعذّر الدفع",
    waiting: "بانتظار الدفع",
  },
  en: {
    upcoming: "Upcoming",
    delivered: "Reached the child · documented",
    transferred: "Sent to the field organization · awaiting delivery",
    paid: "Paid · awaiting transfer",
    failed: "Payment failed",
    waiting: "Awaiting payment",
  },
} as const;

/** حالة الشهر بجملةٍ واحدة يفهمها الكافل، بلغة الواجهة. */
export function monthState(
  m: LedgerMonth,
  locale: string = "ar",
): {
  label: string;
  tone: "done" | "progress" | "wait" | "issue";
} {
  const t = locale === "en" ? MONTH_STATE.en : MONTH_STATE.ar;
  if (m.upcoming) return { label: t.upcoming, tone: "wait" };
  if (m.delivery_status === "delivered") return { label: t.delivered, tone: "done" };
  if (m.delivery_status === "transferred") return { label: t.transferred, tone: "progress" };
  if (m.paid > 0) return { label: t.paid, tone: "progress" };
  if (m.payment_status === "failed") return { label: t.failed, tone: "issue" };
  return { label: t.waiting, tone: "wait" };
}

/** يتحقّق الكافل أن إيصالاً حفظه ما زال يطابق حقائق شهره اليوم. */
export const verifyLedgerReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sponsorshipId: z.string().uuid(),
        month: z.string().regex(/^\d{4}-\d{2}$/),
        receipt: z
          .string()
          .trim()
          .regex(/^[0-9A-Fa-f]{4}-?[0-9A-Fa-f]{4}-?[0-9A-Fa-f]{4}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const code = data.receipt
      .replace(/-/g, "")
      .toUpperCase()
      .replace(/(.{4})(.{4})(.{4})/, "$1-$2-$3");
    const { data: r, error } = await rpc(context.supabase).rpc("verify_ledger_receipt", {
      _sponsorship: data.sponsorshipId,
      _month: data.month,
      _receipt: code,
    });
    if (error) return { ok: false as const };
    return { ok: true as const, ...(r as { match: boolean; current: string | null }) };
  });

/** البحث برقم الفاتورة أو برقم المعاملة لدى المزوّد — الكافل في دفعاته، والإدارة في الكل. */
export const lookupPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ref: z.string().trim().min(6).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: r, error } = await rpc(context.supabase).rpc("lookup_payment", {
      _ref: data.ref,
    });
    return error ? ({ found: false } as PaymentLookup) : (r as PaymentLookup);
  });
