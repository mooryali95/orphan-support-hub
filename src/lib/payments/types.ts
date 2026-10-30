/**
 * منفذ الدفع — العقد الذي يفصل منطق المنصة عن أي مزوّد.
 *
 * قيمته ظهرت عملياً: بُني النظام أولاً على افتراض أن المزوّد «كريم»
 * (Careem)، ثم تبيّن أنه «Creem» — شركة أخرى تماماً بواجهة مختلفة كلياً.
 * ولأن كل ما يخصّ المزوّد كان محصوراً في محوّل واحد، لم يتجاوز أثر
 * التبديل استبدال ملف المحوّل: لا مسار ولا جدول ولا شاشة تغيّرت.
 */

export type Money = {
  /** بالوحدة الكبرى (دولار لا سنت) — كما تخزّنه القاعدة NUMERIC. */
  amount: number;
  currency: string;
};

export type CheckoutRequest = Money & {
  sponsorshipId: string;
  /** يمنع ازدواج الدفعة عند إعادة إرسال الطلب. */
  idempotencyKey: string;
  /** شهرية متكرّرة أم دفعة واحدة. */
  recurring: boolean;
  description: string;
  returnUrl: string;
  cancelUrl: string;
};

export type CheckoutSession = {
  /** معرّف الجلسة لدى المزوّد. */
  providerCheckoutId: string;
  /** العنوان الذي يُحوَّل إليه الكافل لإتمام الدفع. */
  checkoutUrl: string;
  /** يُملأ حين ينشئ المزوّد اشتراكاً متكرّراً. */
  providerSubscriptionId?: string | undefined;
};

/** الأحداث التي تعني شيئاً للمنصة، مستقلةً عن تسمية المزوّد لها. */
export type PaymentEventKind =
  | "payment.succeeded"
  | "payment.failed"
  | "payment.refunded"
  | "payment.disputed"
  | "subscription.charged"
  | "subscription.cancelled"
  | "subscription.paused"
  /** حدث معروف للمزوّد لا فعل له عندنا: يُسجَّل ويُعتمَد استلامه. */
  | "unknown";

export type PaymentEvent = {
  /** معرّف الحدث لدى المزوّد — مفتاح منع تكرار المعالجة. */
  providerEventId: string;
  kind: PaymentEventKind;
  sponsorshipId: string | null;
  providerCheckoutId: string | null;
  /**
   * معرّف المعاملة التي حرّكت المال فعلاً لدى المزوّد (الطلب/الحركة).
   * يُربط به رقم الفاتورة عندنا، ويُطابَق به الردّ والمنازعة.
   */
  providerPaymentId: string | null;
  providerSubscriptionId: string | null;
  amount: number | null;
  currency: string | null;
  failureReason: string | null;
  /** التوقيت كما يذكره المزوّد، أو null فيُستخدم وقت الاستقبال. */
  occurredAt: string | null;
};

export interface PaymentProvider {
  readonly id: string;
  /** false يعني أن الأسرار ناقصة، فتُخفى أزرار الدفع بدل أن تفشل. */
  isConfigured(): boolean;
  /** هل يدير المزوّد التحصيل الشهري بنفسه. */
  supportsRecurring(): boolean;

  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;

  /**
   * التحقّق من توقيع الـwebhook قبل أي قراءة للحمولة.
   * إرجاع false يعني رفض الطلب — لا محاولة تفسير.
   */
  verifyWebhook(rawBody: string, headers: Headers): boolean;

  parseEvent(rawBody: string): PaymentEvent;

  cancelSubscription(providerSubscriptionId: string): Promise<void>;
}

/** يُرفع حين يُطلب من المحوّل ما لم يُوصَّل بعد. */
export class ProviderNotReadyError extends Error {
  constructor(what: string) {
    super(`مزوّد الدفع غير جاهز: ${what}`);
    this.name = "ProviderNotReadyError";
  }
}
