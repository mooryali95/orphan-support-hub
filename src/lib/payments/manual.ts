import type { CheckoutRequest, CheckoutSession, PaymentEvent, PaymentProvider } from "./types";

/**
 * مزوّد التحويل اليدوي — الافتراضي حتى تصل مفاتيح Creem.
 *
 * لا يتصل بشيء. ينشئ «جلسة» محلية ويحوّل الكافل إلى صفحة تعليمات
 * التحويل البنكي، ثم تؤكّد الإدارة الاستلام يدوياً فتُفعَّل الكفالة عبر
 * نفس المسار الذي يسلكه webhook Creem.
 *
 * فائدته أن حلقة الكفالة كاملةً — من الزر إلى تفعيل العقد إلى ظهور
 * المبلغ في لوحة الإدارة — قابلة للتشغيل والاختبار اليوم، فلا يبقى عند
 * وصول أسرار Creem إلا تبديل المزوّد.
 */
export const manualProvider: PaymentProvider = {
  id: "manual",

  // جاهز دائماً: لا يحتاج سرّاً.
  isConfigured() {
    return true;
  },

  // التحصيل الشهري يدوي بطبيعته، فلا اشتراك يديره المزوّد.
  supportsRecurring() {
    return false;
  },

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    return {
      providerCheckoutId: `manual_${req.idempotencyKey}`,
      checkoutUrl: `/sponsorships/${req.sponsorshipId}/transfer`,
    };
  },

  // لا webhook لمزوّد لا يتصل بشيء؛ التأكيد يتم من لوحة الإدارة.
  verifyWebhook() {
    return false;
  },

  parseEvent(): PaymentEvent {
    throw new Error("manual: لا أحداث webhook لهذا المزوّد");
  },

  async cancelSubscription() {
    // لا شيء يُلغى لدى مزوّد؛ إيقاف الكفالة يكفي.
  },
};
