import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { paymentReturnState, type PaymentReturn } from "@/lib/payment-return";

/**
 * حال آخر دفعةٍ لكفالةٍ يملكها المتّصل. الملكية تُتحقَّق بعميل المستخدم (RLS)، ثم تُقرأ
 * الدفعة بشرط `sponsor_id` نفسه؛ فمعرّفٌ لكفالة غيره يعود «منتهية» بلا أيّ تفصيل.
 */
export const getMyPaymentReturn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sponsorshipId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<PaymentReturn> => {
    const { supabase, userId } = context;
    const empty: PaymentReturn = {
      state: "expired",
      childName: null,
      amount: null,
      currency: null,
      reference: null,
    };

    const { data: sponsorship } = await supabase
      .from("sponsorships")
      .select("id, orphans(display_name)")
      .eq("id", data.sponsorshipId)
      .eq("sponsor_id", userId)
      .maybeSingle();
    if (!sponsorship) return empty;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { withPayments } = await import("@/integrations/supabase/types.extra");
    const { data: row } = await withPayments(supabaseAdmin)
      .from("sponsorship_payments")
      .select("id, status, created_at, amount, currency")
      .eq("sponsorship_id", sponsorship.id)
      .eq("sponsor_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      state: paymentReturnState(row ?? null),
      childName: (sponsorship.orphans as { display_name?: string } | null)?.display_name ?? null,
      amount: row ? Number(row.amount) : null,
      currency: row?.currency ?? null,
      reference: row ? String(row.id).slice(0, 8).toUpperCase() : null,
    };
  });
