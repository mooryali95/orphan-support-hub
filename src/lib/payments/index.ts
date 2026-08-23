import { careemProvider } from "./careem";
import { manualProvider } from "./manual";
import type { PaymentProvider } from "./types";

export * from "./types";

/**
 * اختيار المزوّد. `PAYMENT_PROVIDER=careem` يفعّل كريم، ولا يُفعَّل إلا
 * إذا اكتملت أسراره فعلاً — فمفتاح ناقص يعني رجوعاً إلى التحويل اليدوي
 * لا صفحة دفع مكسورة أمام الكافل.
 */
export function paymentProvider(): PaymentProvider {
  const chosen = process.env["PAYMENT_PROVIDER"];
  if (chosen === "careem" && careemProvider.isConfigured()) return careemProvider;
  return manualProvider;
}

/** ما تحتاجه الواجهة لتعرف كيف تصف مسار الدفع للكافل. */
export function paymentMode() {
  const p = paymentProvider();
  return {
    provider: p.id,
    recurring: p.supportsRecurring(),
    online: p.id !== "manual",
  };
}
