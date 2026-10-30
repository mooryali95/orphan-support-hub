import { createHmac, timingSafeEqual } from "node:crypto";

import {
  ProviderNotReadyError,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentEvent,
  type PaymentEventKind,
  type PaymentProvider,
} from "./types";

/**
 * محوّل Creem — كل ما يخصّ المزوّد محصور هنا.
 *
 * مصدر هذا الملف هو حزمة `creem` الرسمية على npm (الإصدار 1.6.0): قرأتُ
 * تعريفات الأنواع فيها بدل الاعتماد على أمثلة مكتوبة بخطّ اليد، فالأنواع
 * مولَّدة من مواصفة OpenAPI الخاصة بالمزوّد فهي أدقّ ما يُتاح خارج الوثائق.
 *
 * قيدان يحكمان التصميم كلّه:
 *
 *  1. الدفع لدى Creem مربوط بـ«منتج» لا بمبلغ حرّ. لا يمكن أن تقول
 *     «حصّل 80 دولاراً»، بل «حصّل منتج X بعدد Y وحدة».
 *  2. الحقل الوحيد الذي يقبل مبلغاً حرّاً — `custom_price` — لا يعمل إلا
 *     مع منتجات الدفعة الواحدة، وهذا نصّ المزوّد حرفياً:
 *     «Only supported for one-time payment products».
 *
 * والكفالة شهرية متكرّرة بمبلغ يختاره الكافل، فهي تقع في التقاطع الذي
 * لا يغطّيه `custom_price`. فالحلّ: منتج متكرّر واحد سعر وحدته دولار
 * واحد شهرياً، و`units` هو المبلغ بالدولار. كفالة بـ80 دولاراً = 80 وحدة.
 * والوحدات تضرب السعر — وهذا موثَّق في وصف `custom_price` نفسه:
 * «the amount is per unit: with `units: 3` and `custom_price: 1500` the
 * customer pays 4500».
 *
 * ولأن الدفعة الواحدة لا تعاني هذا القيد، تستعمل `custom_price` مباشرة
 * بمنتج منفصل، فتُقبل المبالغ الكسرية فيها دون تدوير.
 */

const ENV = {
  apiKey: "CREEM_API_KEY",
  webhookSecret: "CREEM_WEBHOOK_SECRET",
  productMonthly: "CREEM_PRODUCT_MONTHLY",
  productOnetime: "CREEM_PRODUCT_ONETIME",
} as const;

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

/**
 * البيئة تُشتقّ من المفتاح لا من متغيّر مستقلّ.
 *
 * Creem يرفض مفتاح الاختبار على نطاق الإنتاج والعكس، ومتغيّر منفصل يعني
 * احتمال تناقضه مع المفتاح — وهو أسوأ أنواع الأعطال: إعداد يبدو سليماً
 * ويفشل عند أول دفعة حقيقية. الاشتقاق يجعل التناقض مستحيلاً.
 */
function baseUrl(apiKey: string): string {
  return apiKey.startsWith("creem_test_") ? "https://test-api.creem.io" : "https://api.creem.io";
}

const SIGNATURE_HEADER = "creem-signature";

/**
 * خريطة أحداث Creem إلى مفردات المنصة.
 *
 * الأحداث الثلاثة عشر التي يرسلها Creem ليست كلها مالية: منها ما يصف
 * انتقالاً في دورة حياة الاشتراك فقط. وما لا يقابله فعل هنا يُترك خارج
 * الخريطة عمداً فيصير `unknown`، ويُسجَّل ويُعتمَد استلامه دون تطبيق —
 * لا يُرفض. فرفضه يعني إعادة إرسال لا تنتهي من المزوّد.
 */
const EVENT_KIND: Record<string, PaymentEventKind> = {
  "checkout.completed": "payment.succeeded",
  "subscription.paid": "subscription.charged",
  "subscription.canceled": "subscription.cancelled",
  "subscription.expired": "subscription.cancelled",
  "subscription.unpaid": "payment.failed",
  "subscription.past_due": "payment.failed",
  "subscription.paused": "subscription.paused",
  "refund.created": "payment.refunded",
  "dispute.created": "payment.disputed",
};

type Json = Record<string, unknown>;

function obj(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

/** حقول Creem تأتي أحياناً كمعرّف نصّي وأحياناً ككائن كامل. */
function idOf(value: unknown): string | null {
  if (typeof value === "string") return value || null;
  const o = obj(value);
  return o && typeof o["id"] === "string" ? (o["id"] as string) : null;
}

/** Creem يتعامل بالسنتات؛ القاعدة تخزّن بالوحدة الكبرى. */
function fromCents(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value / 100 : null;
}

async function call(path: string, init: RequestInit): Promise<Json> {
  const apiKey = env(ENV.apiKey);
  if (!apiKey) throw new ProviderNotReadyError(ENV.apiKey);

  const res = await fetch(`${baseUrl(apiKey)}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  if (!res.ok) {
    // نصّ الخطأ يُمرَّر كما هو: رسالة Creem أدقّ من أي إعادة صياغة.
    throw new Error(`Creem ${res.status}: ${text.slice(0, 500)}`);
  }
  return (text ? JSON.parse(text) : {}) as Json;
}

export const creemProvider: PaymentProvider = {
  id: "creem",

  isConfigured() {
    // المنتج المتكرّر شرط: بدونه لا كفالة شهرية، وهي جوهر المنصة.
    return Boolean(env(ENV.apiKey) && env(ENV.webhookSecret) && env(ENV.productMonthly));
  },

  supportsRecurring() {
    return true;
  },

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const monthly = env(ENV.productMonthly);
    const onetime = env(ENV.productOnetime);

    const body: Json = {
      request_id: req.idempotencyKey,
      success_url: req.returnUrl,
      // المرجع الوحيد الذي يربط دفعة المزوّد بعقد الكفالة عندنا. Creem
      // يعيد `metadata` في كل حدث لاحق، فبها يُعرَف صاحب الدفعة.
      metadata: { sponsorship_id: req.sponsorshipId },
    };

    if (req.recurring) {
      if (!monthly) throw new ProviderNotReadyError(ENV.productMonthly);
      const units = Math.round(req.amount);
      if (units < 1) {
        throw new Error("الكفالة الشهرية لا تقلّ عن وحدة واحدة (دولار واحد)");
      }
      body["product_id"] = monthly;
      body["units"] = units;
    } else {
      if (!onetime) throw new ProviderNotReadyError(ENV.productOnetime);
      const cents = Math.round(req.amount * 100);
      // الحدّ الأدنى عند Creem وحدة كاملة من العملة.
      if (cents < 100) throw new Error("أقل مبلغ مقبول دولار واحد");
      body["product_id"] = onetime;
      body["units"] = 1;
      body["custom_price"] = cents;
    }

    const res = await call("/v1/checkouts", { method: "POST", body: JSON.stringify(body) });

    const checkoutUrl = res["checkout_url"];
    if (typeof checkoutUrl !== "string" || !checkoutUrl) {
      throw new Error("Creem لم يُعِد checkout_url");
    }

    const subscriptionId = idOf(res["subscription"]);
    return {
      providerCheckoutId: String(res["id"] ?? ""),
      checkoutUrl,
      ...(subscriptionId ? { providerSubscriptionId: subscriptionId } : {}),
    };
  },

  verifyWebhook(rawBody: string, headers: Headers): boolean {
    const secret = env(ENV.webhookSecret);
    if (!secret) return false;

    const received = headers.get(SIGNATURE_HEADER);
    if (!received) return false;

    const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

    // المقارنة ثابتة الزمن: المقارنة النصّية العادية تُسرّب طول البادئة
    // الصحيحة عبر زمن التنفيذ، فيُبنى التوقيع حرفاً حرفاً.
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(received.trim(), "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  },

  parseEvent(rawBody: string): PaymentEvent {
    const root = obj(JSON.parse(rawBody));
    if (!root) throw new Error("حمولة Creem ليست كائناً");

    // المزوّد يرسل `eventType` بالسنام لا `event_type`، خلافاً لبقية
    // حقوله المنخفضة الشرطة (`created_at`). هذا مثبَّت في أنواع الحزمة.
    const type = String(root["eventType"] ?? "");
    const kind = EVENT_KIND[type] ?? "unknown";

    const payload = obj(root["object"]) ?? {};
    const subscription = obj(payload["subscription"]);
    // المعاملة: «order» في إتمام الدفع، و«last_transaction» في التجديد،
    // و«transaction» في الردّ والمنازعة.
    const order =
      obj(payload["order"]) ?? obj(payload["last_transaction"]) ?? obj(payload["transaction"]);

    // `metadata` تكون على الحمولة نفسها في أحداث الاشتراك، وعلى جلسة
    // الدفع في checkout.completed.
    const metadata =
      obj(payload["metadata"]) ?? obj(subscription?.["metadata"]) ?? obj(order?.["metadata"]) ?? {};

    const sponsorshipId =
      typeof metadata["sponsorship_id"] === "string"
        ? (metadata["sponsorship_id"] as string)
        : null;

    // في أحداث الاشتراك تكون الحمولة هي الاشتراك ذاته؛ وفي إتمام الدفع
    // يكون الاشتراك حقلاً بداخلها.
    const providerSubscriptionId = type.startsWith("subscription.")
      ? (idOf(payload["id"]) ?? null)
      : idOf(payload["subscription"]);

    const createdAt = root["created_at"];

    return {
      providerEventId: String(root["id"] ?? ""),
      kind,
      sponsorshipId,
      providerCheckoutId: type === "checkout.completed" ? idOf(payload["id"]) : idOf(order?.["id"]),
      providerPaymentId:
        idOf(order?.["id"]) ?? idOf(payload["transaction"]) ?? idOf(payload["order"]),
      providerSubscriptionId,
      amount: fromCents(order?.["amount"]),
      currency: typeof order?.["currency"] === "string" ? (order["currency"] as string) : null,
      failureReason:
        typeof payload["status"] === "string" && kind === "payment.failed"
          ? (payload["status"] as string)
          : null,
      occurredAt: typeof createdAt === "number" ? new Date(createdAt).toISOString() : null,
    };
  },

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    await call(`/v1/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ mode: "immediate" }),
    });
  },
};
