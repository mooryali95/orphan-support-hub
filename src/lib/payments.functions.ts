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

/**
 * حال التعليق كما تقرأه القاعدة.
 *
 * التعليق إعداد في القاعدة لا متغيّر بيئة: رفعه قرار تشغيلي يُتّخذ حين
 * يصل جواب المزوّد، ولا ينبغي أن يحتاج إعادة نشر. والافتراض `true`
 * فبيئة جديدة تبدأ معلَّقة لا مفتوحة.
 */
async function readHold(supabase: unknown) {
  const { data: raw } = await (supabase as { rpc: (fn: string) => Promise<{ data: unknown }> }).rpc(
    "payment_hold_state",
  );
  const data = raw as { payments_on_hold?: boolean; payments_hold_reason?: string | null } | null;

  // تعذّرت القراءة: يُفترض التعليق. الفشل إلى الجانب الآمن.
  return {
    onHold: data?.payments_on_hold ?? true,
    reason:
      data?.payments_hold_reason ??
      "التحصيل الإلكتروني موقوف مؤقتاً بانتظار اكتمال التحقّق من مزوّد الدفع.",
  };
}

/**
 * شروط التحصيل المحفوظة مع الكفالة (هجرة العملة الموحّدة): ما اتُّفق على
 * تحصيله بعملة الدفع. العمودان أحدث من الأنواع المولَّدة، فيُقرآن بنوعٍ محلّي؛
 * وإن غابا (هجرةٌ لم تُطبَّق) أو فرغا عاد null فيُحصَّل مبلغ الكفالة بعملتها.
 * أيّ خطأٍ آخر يوقف الدفع: تحصيل مبلغ الحاجة بعملتها عن كفالةٍ اتُّفق على
 * غيرها خطأٌ ماليّ لا يُخاطَر به لتعذّر قراءة.
 */
type ChargeTermsClient = {
  from: (t: "sponsorships") => {
    select: (c: "charge_currency, charge_amount") => {
      eq: (
        c: "id",
        v: string,
      ) => {
        maybeSingle: () => PromiseLike<{
          data: { charge_currency: string | null; charge_amount: number | string | null } | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
  };
};

async function readChargeTerms(
  supabase: unknown,
  sponsorshipId: string,
): Promise<{ ok: true; terms: { amount: number; currency: string } | null } | { ok: false }> {
  const { data, error } = await (supabase as ChargeTermsClient)
    .from("sponsorships")
    .select("charge_currency, charge_amount")
    .eq("id", sponsorshipId)
    .maybeSingle();
  if (error) {
    // 42703 (PostgreSQL) / PGRST204 (PostgREST): العمود غير موجود بعد.
    const missing = error.code === "42703" || error.code === "PGRST204";
    if (missing) return { ok: true, terms: null };
    console.error("[payments] تعذّرت قراءة شروط التحصيل", error.message);
    return { ok: false };
  }
  if (!data?.charge_currency) return { ok: true, terms: null };
  const amount = Number(data.charge_amount);
  if (!(amount > 0)) return { ok: false };
  return { ok: true, terms: { amount, currency: data.charge_currency } };
}

/** ما تحتاجه الواجهة لتعرف كيف تصف مسار الدفع، بلا كشف أي سرّ. */
export const getPaymentMode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { paymentMode } = await import("@/lib/payments");
    const mode = paymentMode();
    const hold = await readHold(context.supabase);
    return {
      ...mode,
      // التعليق يُغلق المسار الإلكتروني مهما كان المزوّد مضبوطاً.
      online: mode.online && !hold.onHold,
      onHold: hold.onHold,
      holdReason: hold.reason,
    };
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
    // الدفع يبدأ الكفالة؛ المنتهية والجارية لا تنتظر جلسة دفع.
    if (sponsorship.status !== "pending_payment") {
      return {
        ok: false as const,
        error:
          sponsorship.status === "cancelled" || sponsorship.status === "completed"
            ? "هذه الكفالة منتهية"
            : "هذه الكفالة لا تنتظر دفعاً",
      };
    }

    // تحديد المعدّل قبل أي عمل: إنشاء جلسات دفع بلا حدّ يُنشئ ضغطاً على
    // المزوّد ويُلوّث سجلّاته بجلسات مهجورة.
    const { hitRateLimit } = await import("@/lib/rate-limit");
    const verdict = await hitRateLimit("checkout", `u:${userId}`);
    if (!verdict.allowed) {
      return { ok: false as const, error: "محاولات كثيرة في وقت قصير. أعد المحاولة بعد قليل." };
    }

    const { paymentProvider, CurrencyNotSupportedError } = await import("@/lib/payments");
    const provider = paymentProvider();

    // ما يُحصَّل: المتّفق عليه بعملة الدفع إن اختار الكافل غير عملة الحاجة
    // (`charge_*`)، وإلا مبلغ الكفالة بعملتها كما كان.
    const read = await readChargeTerms(supabase, sponsorship.id);
    if (!read.ok) return { ok: false as const, error: "تعذّر بدء الدفع، حاول لاحقاً" };
    const terms = read.terms;
    const charge = terms ?? {
      amount: Number(sponsorship.amount),
      currency: sponsorship.currency,
    };
    // الحدود يفرضها الخادم: مبلغٌ خارجها لا يبلغ المزوّد مهما كان مصدره.
    if (!Number.isFinite(charge.amount) || charge.amount < 5 || charge.amount > 100000) {
      return { ok: false as const, error: "مبلغ الكفالة خارج الحدود المسموح بها" };
    }
    // التحويل اليدوي يُطابَق بمبلغ الكفالة وعملتها؛ كفالةٌ اتُّفق على تحصيلها
    // بعملةٍ أخرى لا تُحوَّل يدوياً بمبلغٍ غير المتّفق عليه.
    if (terms && provider.id === "manual") {
      return {
        ok: false as const,
        error: `هذه الكفالة سُجّلت للدفع بالبطاقة بعملة ${terms.currency}، والدفع الإلكتروني غير متاح الآن. ألغِها وابدأ كفالةً بعملة الملفّ (${sponsorship.currency}).`,
      };
    }

    // التعليق يخصّ التحصيل الإلكتروني وحده: التحويل اليدوي تطابقه الإدارة
    // قبل التفعيل، فلا يُغلق بإغلاق المزوّد. والفحص هنا لا في الواجهة: زرّ
    // مخفيّ يُتجاوَز بطلب واحد.
    if (provider.id !== "manual") {
      const hold = await readHold(supabase);
      if (hold.onHold) {
        return { ok: false as const, error: hold.reason, onHold: true as const };
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { withPayments } = await import("@/integrations/supabase/types.extra");
    const admin = withPayments(supabaseAdmin);

    // مفتاح منع التكرار مشتقّ من الكفالة والشهر: ضغط الزر مرّتين في نفس
    // الشهر لا ينشئ دفعتين. والتحويل اليدوي بمفتاحٍ واحد لا يتبدّل بالشهر.
    const period = new Date().toISOString().slice(0, 7);
    const idempotencyKey =
      provider.id === "manual" ? `${sponsorship.id}:manual` : `${sponsorship.id}:${period}`;

    // APP-07: جلسةٌ قائمة لهذا الشهر تُعاد كما هي، بدل جلسةٍ جديدة لدى المزوّد
    // عند كل ضغطة. المهجورة تُنهيها المطابقة الدورية فيتحرّر المفتاح.
    const { data: existing, error: existingError } = await admin
      .from("sponsorship_payments")
      .select("checkout_url")
      .eq("idempotency_key", idempotencyKey)
      .eq("status", "pending")
      .maybeSingle();
    if (existingError) {
      console.error("[payments] تعذّر قراءة الجلسة القائمة", existingError.message);
      return { ok: false as const, error: "تعذّر بدء الدفع، حاول لاحقاً" };
    }
    if (existing?.checkout_url) {
      return {
        ok: true as const,
        checkoutUrl: existing.checkout_url,
        provider: provider.id,
        online: provider.id !== "manual",
      };
    }

    // أصلٌ واحد للروابط المطلقة (ARC-12): PUBLIC_BASE_URL، و APP_ORIGIN احتياطاً.
    const { appBaseUrl } = await import("@/lib/env.server");
    const origin = appBaseUrl() ?? "";
    const orphanName =
      (sponsorship.orphans as { display_name?: string } | null)?.display_name ?? "يتيم";

    let session;
    try {
      session = await provider.createCheckout({
        sponsorshipId: sponsorship.id,
        amount: charge.amount,
        currency: charge.currency,
        recurring: sponsorship.type === "monthly" && provider.supportsRecurring(),
        idempotencyKey,
        description: `كفالة ${orphanName} — ${charge.currency} ${charge.amount}`,
        returnUrl: `${origin}/dashboard?payment=done`,
        cancelUrl: `${origin}/dashboard?payment=cancelled`,
      });
    } catch (cause) {
      if (cause instanceof CurrencyNotSupportedError) {
        // APP-04: لا تُحصَّل كفالةٌ باليورو على منتجٍ بالدولار.
        return {
          ok: false as const,
          error: `الدفع الإلكتروني لا يقبل عملة هذه الكفالة (${charge.currency}) بعد. يمكنك إكمالها بتحويلٍ بنكي.`,
        };
      }
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error("[payments] تعذّر إنشاء جلسة الدفع", message);
      return { ok: false as const, error: "تعذّر بدء الدفع، حاول لاحقاً" };
    }

    // قيد الدفعة المعلّقة يُكتب بـservice_role: سجلّ المدفوعات ممنوع على
    // العميل عمداً (إصلاح C3)، وهذا المسار خادمي بعد التحقّق من الهوية.
    const { error: paymentError } = await admin.from("sponsorship_payments").insert({
      sponsorship_id: sponsorship.id,
      sponsor_id: userId,
      // الدفعة تحمل ما يُحصَّل فعلاً؛ والمقيَّد لحاجة الطفل يكتبه قيد التحصيل.
      amount: charge.amount,
      currency: charge.currency,
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
