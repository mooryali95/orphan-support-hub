/**
 * نسخة التجربة من «حال الدفعة»: عودةٌ محاكاة ناجحة من بوابةٍ تجريبية، بمرجعٍ يبدأ بـDEMO-
 * واسم بطاقة الطفل التجريبية وحده. لا تقرأ خادماً ولا تلمس معرّفاً يُدفع له.
 */
import { registerDemo } from "@/lib/data-port";
import type { PaymentReturn } from "@/lib/payment-return";
import { loadGifts, localTryChild, tryChild, TRY_CURRENCY } from "@/lib/try-demo";

type Input = { data: { sponsorshipId: string } };

export function tryPaymentReturn(childId: string, locale: "ar" | "en" = "ar"): PaymentReturn {
  const found = tryChild(childId);
  const child = found ? localTryChild(found, locale) : undefined;
  const gift = loadGifts().find((g) => g.childId === childId);
  return {
    state: child ? "success" : "expired",
    childName: child?.name ?? null,
    amount: gift?.amount ?? null,
    currency: gift ? TRY_CURRENCY : null,
    reference: child ? `DEMO-${childId.toUpperCase().slice(0, 8)}` : null,
  };
}

/** تُنادى صراحةً من مسار التجربة (`sideEffects: false` يحذف الاستيراد المجرّد). */
export function registerPaymentReturnDemo() {
  registerDemo("payments.return", async ({ data }: Input) =>
    tryPaymentReturn(
      data.sponsorshipId,
      typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "ar",
    ),
  );
}
