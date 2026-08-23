import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * بدء الدفع.
 *
 * الكفالة تُنشأ أولاً بحالة `pending_payment` (لا يستطيع العميل غير ذلك،
 * إصلاح C2)، ثم يبدأ الكافل الدفع من هنا. تفعيل العقد لا يحدث في هذه
 * الدالة إطلاقاً — بل في webhook المزوّد وحده.
 */

/** ما تحتاجه الواجهة لتعرف كيف تصف مسار الدفع، بلا كشف أي سرّ. */
export const getPaymentMode = createServerFn({ method: "GET" }).handler(async () => {
  const { paymentMode } = await import("@/lib/payments");
  return paymentMode();
});

export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sponsorshipId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // ملكية الكفالة تُتحقَّق بعميل المستخدم، فتحرسها RLS لا شرط في الكود.
    const { data: sponsorship, error } = await supabase
      .from("sponsorships")
      .select("id, amount, currency, type, status, orphan_id, orphans(display_name)")
      .eq("id", data.sponsorshipId)
      .eq("sponsor_id", userId)
      .maybeSingle();

    if (error) return { ok: false as const, error: error.message };
    if (!sponsorship) return { ok: false as const, error: "لا توجد كفالة بهذا المعرّف" };
    if (sponsorship.status === "cancelled" || sponsorship.status === "completed") {
      return { ok: false as const, error: "هذه الكفالة منتهية" };
    }

    const { paymentProvider } = await import("@/lib/payments");
    const provider = paymentProvider();

    const origin = process.env["APP_ORIGIN"] ?? "";
    const orphanName =
      (sponsorship.orphans as { display_name?: string } | null)?.display_name ?? "يتيم";

    // مفتاح منع التكرار مشتقّ من الكفالة والشهر: ضغط الزر مرّتين في نفس
    // الشهر لا ينشئ دفعتين.
    const period = new Date().toISOString().slice(0, 7);
    const idempotencyKey = `${sponsorship.id}:${period}`;

    let session;
    try {
      session = await provider.createCheckout({
        sponsorshipId: sponsorship.id,
        amount: Number(sponsorship.amount),
        currency: sponsorship.currency,
        recurring: sponsorship.type === "monthly" && provider.supportsRecurring(),
        idempotencyKey,
        description: `كفالة ${orphanName} — ${sponsorship.currency} ${sponsorship.amount}`,
        returnUrl: `${origin}/dashboard?payment=done`,
        cancelUrl: `${origin}/dashboard?payment=cancelled`,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error("[payments] تعذّر إنشاء جلسة الدفع", message);
      return { ok: false as const, error: "تعذّر بدء الدفع، حاول لاحقاً" };
    }

    // قيد الدفعة المعلّقة يُكتب بـservice_role: سجلّ المدفوعات ممنوع على
    // العميل عمداً (إصلاح C3)، وهذا المسار خادمي بعد التحقّق من الهوية.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { withPayments } = await import("@/integrations/supabase/types.extra");

    const { error: paymentError } = await withPayments(supabaseAdmin)
      .from("sponsorship_payments")
      .insert({
        sponsorship_id: sponsorship.id,
        sponsor_id: userId,
        amount: Number(sponsorship.amount),
        currency: sponsorship.currency,
        status: "pending",
        provider: provider.id,
        provider_checkout_id: session.providerCheckoutId,
        checkout_url: session.checkoutUrl,
        idempotency_key: idempotencyKey,
      });

    // 23505 يعني أن جلسة هذا الشهر أُنشئت سابقاً — نُكمل إلى نفس الرابط.
    if (paymentError && paymentError.code !== "23505") {
      console.error("[payments] تعذّر تسجيل الدفعة المعلّقة", paymentError);
      return { ok: false as const, error: "تعذّر بدء الدفع، حاول لاحقاً" };
    }

    return {
      ok: true as const,
      checkoutUrl: session.checkoutUrl,
      provider: provider.id,
      online: provider.id !== "manual",
    };
  });
