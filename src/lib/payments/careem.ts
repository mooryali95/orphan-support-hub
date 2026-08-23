import {
  ProviderNotReadyError,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentEvent,
  type PaymentEventKind,
  type PaymentProvider,
} from "./types";

/**
 * محوّل كريم — كل ما يخصّ المزوّد محصور هنا.
 *
 * ما هو مؤكَّد من مصادر كريم العلنية:
 *   • المصادقة client_credentials: يُبادَل Client ID و Secret بـaccess token،
 *     ثم يُرسل التوكن كـBearer مع كل طلب.
 *   • One-Click Checkout يدعم الاشتراكات والدفع المتكرّر.
 *
 * ما ليس علنياً ويأتي في «دليل تكامل التاجر» من ممثل كريم:
 *   • عناوين البيئتين التجريبية والإنتاجية.
 *   • مسارات: التوكن، إنشاء جلسة الدفع، الإلغاء.
 *   • أسماء حقول الطلب والاستجابة.
 *   • ترويسة التوقيع وخوارزميته، وأسماء أنواع الأحداث.
 *
 * كل موضع ينتظر الدليل معلَّم بـ CAREEM-SPEC، وهي القائمة الكاملة لما
 * يجب تعديله. لا شيء خارج هذا الملف يحتاج تغييراً.
 */

const ENV = {
  base: "CAREEM_API_BASE_URL",
  clientId: "CAREEM_CLIENT_ID",
  clientSecret: "CAREEM_CLIENT_SECRET",
  webhookSecret: "CAREEM_WEBHOOK_SECRET",
} as const;

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

// CAREEM-SPEC: مسار التوكن ومسار إنشاء الجلسة ومسار الإلغاء.
const PATHS = {
  token: "/oauth/token",
  checkout: "/v1/checkout/sessions",
  cancelSubscription: (id: string) => `/v1/subscriptions/${id}/cancel`,
};

// CAREEM-SPEC: ترويسة التوقيع كما يرسلها كريم.
const SIGNATURE_HEADER = "x-careem-signature";

// CAREEM-SPEC: خريطة أنواع أحداث كريم إلى أنواع المنصة.
const EVENT_KIND: Record<string, PaymentEventKind> = {
  "payment.succeeded": "payment.succeeded",
  "payment.captured": "payment.succeeded",
  "payment.failed": "payment.failed",
  "payment.declined": "payment.failed",
  "payment.refunded": "payment.refunded",
  "subscription.charged": "subscription.charged",
  "subscription.cancelled": "subscription.cancelled",
};

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  const base = env(ENV.base);
  const id = env(ENV.clientId);
  const secret = env(ENV.clientSecret);
  if (!base || !id || !secret) {
    throw new ProviderNotReadyError(`${ENV.base} و${ENV.clientId} و${ENV.clientSecret}`);
  }

  // هامش ثلاثين ثانية حتى لا يُستخدم توكن على وشك الانتهاء.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;

  const res = await fetch(`${base}${PATHS.token}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secret,
    }),
  });

  if (!res.ok) {
    throw new Error(`careem: فشل الحصول على التوكن (${res.status})`);
  }

  // CAREEM-SPEC: أسماء حقول استجابة التوكن.
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("careem: استجابة التوكن بلا access_token");

  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

export const careemProvider: PaymentProvider = {
  id: "careem",

  isConfigured() {
    return Boolean(
      env(ENV.base) && env(ENV.clientId) && env(ENV.clientSecret) && env(ENV.webhookSecret),
    );
  },

  // One-Click Checkout يدعم الاشتراكات، فالتحصيل الشهري على المزوّد لا على cron.
  supportsRecurring() {
    return true;
  },

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const base = env(ENV.base)!;
    const token = await accessToken();

    // CAREEM-SPEC: أسماء حقول الطلب.
    const res = await fetch(`${base}${PATHS.checkout}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        // مفتاح منع التكرار يمنع جلستَي دفع لنفس الفترة عند إعادة الإرسال.
        "idempotency-key": req.idempotencyKey,
      },
      body: JSON.stringify({
        amount: req.amount,
        currency: req.currency,
        description: req.description,
        reference: req.sponsorshipId,
        recurring: req.recurring,
        success_url: req.returnUrl,
        cancel_url: req.cancelUrl,
      }),
    });

    if (!res.ok) {
      throw new Error(`careem: فشل إنشاء جلسة الدفع (${res.status}) ${await res.text()}`);
    }

    // CAREEM-SPEC: أسماء حقول الاستجابة.
    const json = (await res.json()) as {
      id?: string;
      checkout_url?: string;
      subscription_id?: string;
    };
    if (!json.id || !json.checkout_url) {
      throw new Error("careem: استجابة الجلسة بلا id أو checkout_url");
    }

    return {
      providerCheckoutId: json.id,
      checkoutUrl: json.checkout_url,
      providerSubscriptionId: json.subscription_id,
    };
  },

  verifyWebhook(rawBody: string, headers: Headers): boolean {
    const secret = env(ENV.webhookSecret);
    if (!secret) return false;

    const provided = headers.get(SIGNATURE_HEADER);
    if (!provided) return false;

    // CAREEM-SPEC: الخوارزمية وصيغة التوقيع. HMAC-SHA256 hex هو الشائع؛
    // يُثبَّت من الدليل قبل التشغيل على الإنتاج.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHmac, timingSafeEqual } = require("node:crypto") as typeof import("node:crypto");
    const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(provided.trim().replace(/^sha256=/, ""), "utf8");
    // المقارنة الآمنة زمنياً تتطلّب طولاً متساوياً.
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  },

  parseEvent(rawBody: string): PaymentEvent {
    // CAREEM-SPEC: بنية حمولة الحدث.
    const p = JSON.parse(rawBody) as Record<string, unknown>;
    const data = (p["data"] ?? p) as Record<string, unknown>;
    const type = String(p["type"] ?? p["event"] ?? "");

    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    const num = (v: unknown) => (typeof v === "number" ? v : v ? Number(v) : null);

    return {
      providerEventId: str(p["id"]) ?? str(p["event_id"]) ?? "",
      kind: EVENT_KIND[type] ?? "unknown",
      sponsorshipId: str(data["reference"]) ?? str(data["metadata"]),
      providerCheckoutId: str(data["checkout_id"]) ?? str(data["id"]),
      providerSubscriptionId: str(data["subscription_id"]),
      amount: num(data["amount"]),
      currency: str(data["currency"]),
      failureReason: str(data["failure_reason"]) ?? str(data["decline_reason"]),
      occurredAt: str(p["created_at"]) ?? str(p["occurred_at"]),
    };
  },

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    const base = env(ENV.base)!;
    const token = await accessToken();
    const res = await fetch(`${base}${PATHS.cancelSubscription(providerSubscriptionId)}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`careem: فشل إلغاء الاشتراك (${res.status})`);
    }
  },
};
