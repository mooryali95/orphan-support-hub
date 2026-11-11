import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { creemProvider } from "./creem";
import { CurrencyNotSupportedError } from "./types";

const SECRET = "whsec_test_secret";

function sign(body: string, secret = SECRET) {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function headers(signature: string | null) {
  const h = new Headers();
  if (signature !== null) h.set("creem-signature", signature);
  return h;
}

beforeEach(() => {
  process.env["CREEM_API_KEY"] = "creem_test_key";
  process.env["CREEM_WEBHOOK_SECRET"] = SECRET;
  process.env["CREEM_PRODUCT_MONTHLY"] = "prod_monthly";
  process.env["CREEM_PRODUCT_ONETIME"] = "prod_onetime";
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of [
    "CREEM_API_KEY",
    "CREEM_WEBHOOK_SECRET",
    "CREEM_PRODUCT_MONTHLY",
    "CREEM_PRODUCT_ONETIME",
  ]) {
    delete process.env[k];
  }
});

describe("verifyWebhook", () => {
  const body = JSON.stringify({ id: "evt_1", eventType: "checkout.completed" });

  it("يقبل توقيعاً صحيحاً", () => {
    expect(creemProvider.verifyWebhook(body, headers(sign(body)))).toBe(true);
  });

  // جوهر الأمان: توقيع صالح لجسم آخر لا يصلح لهذا الجسم.
  it("يرفض جسماً عُدِّل بعد التوقيع", () => {
    const tampered = JSON.stringify({ id: "evt_1", eventType: "subscription.paid" });
    expect(creemProvider.verifyWebhook(tampered, headers(sign(body)))).toBe(false);
  });

  it("يرفض توقيعاً بسرّ آخر", () => {
    expect(creemProvider.verifyWebhook(body, headers(sign(body, "wrong_secret")))).toBe(false);
  });

  it("يرفض غياب الترويسة", () => {
    expect(creemProvider.verifyWebhook(body, headers(null))).toBe(false);
  });

  // بلا سرّ لا تحقّق، والقبول هنا يعني قبول أي حمولة من أي جهة.
  it("يرفض حين لا سرّ مضبوطاً أصلاً", () => {
    delete process.env["CREEM_WEBHOOK_SECRET"];
    expect(creemProvider.verifyWebhook(body, headers(sign(body)))).toBe(false);
  });
});

describe("parseEvent", () => {
  it("يقرأ إتمام الدفع ويستخرج مرجع الكفالة والمبلغ", () => {
    const event = creemProvider.parseEvent(
      JSON.stringify({
        id: "evt_checkout_1",
        eventType: "checkout.completed",
        created_at: 1750000000000,
        object: {
          id: "ch_1",
          subscription: { id: "sub_1" },
          order: { id: "ord_1", amount: 8000, currency: "USD" },
          metadata: { sponsorship_id: "sp-uuid-1" },
        },
      }),
    );

    expect(event.providerEventId).toBe("evt_checkout_1");
    expect(event.kind).toBe("payment.succeeded");
    expect(event.sponsorshipId).toBe("sp-uuid-1");
    expect(event.providerSubscriptionId).toBe("sub_1");
    // رقم المعاملة الحقيقي (الطلب) لا رقم جلسة الدفع.
    expect(event.providerPaymentId).toBe("ord_1");
    expect(event.providerCheckoutId).toBe("ch_1");
    // السنتات تتحوّل إلى الوحدة الكبرى كما تخزّنها القاعدة.
    expect(event.amount).toBe(80);
    expect(event.currency).toBe("USD");
  });

  it("يقرأ تحصيل الاشتراك الشهري", () => {
    const event = creemProvider.parseEvent(
      JSON.stringify({
        id: "evt_paid_1",
        eventType: "subscription.paid",
        created_at: 1750000000000,
        object: {
          id: "sub_1",
          metadata: { sponsorship_id: "sp-uuid-1" },
          last_transaction: { id: "ord_2", amount: 8000, currency: "USD" },
        },
      }),
    );

    expect(event.kind).toBe("subscription.charged");
    expect(event.providerSubscriptionId).toBe("sub_1");
    expect(event.providerPaymentId).toBe("ord_2");
    expect(event.amount).toBe(80);
  });

  // Creem يرسل ثلاثة عشر نوعاً؛ ما لا فعل له عندنا يجب ألّا يُرمى به
  // استثناء، وإلا أعاد المزوّد إرساله بلا نهاية.
  it("يُرجع unknown لنوع لا فعل له بدل أن يفشل", () => {
    const event = creemProvider.parseEvent(
      JSON.stringify({ id: "evt_x", eventType: "subscription.trialing", object: {} }),
    );
    expect(event.kind).toBe("unknown");
    expect(event.providerEventId).toBe("evt_x");
  });

  it("يميّز المنازعة عن ردّ المبلغ", () => {
    const dispute = creemProvider.parseEvent(
      JSON.stringify({ id: "e1", eventType: "dispute.created", object: {} }),
    );
    const refund = creemProvider.parseEvent(
      JSON.stringify({ id: "e2", eventType: "refund.created", object: {} }),
    );
    expect(dispute.kind).toBe("payment.disputed");
    expect(refund.kind).toBe("payment.refunded");
  });

  it("الردّ والمنازعة يحملان رقم المعاملة الأصلية", () => {
    const refund = creemProvider.parseEvent(
      JSON.stringify({
        id: "e3",
        eventType: "refund.created",
        object: { id: "ref_1", transaction: { id: "ord_9" } },
      }),
    );
    const dispute = creemProvider.parseEvent(
      JSON.stringify({
        id: "e4",
        eventType: "dispute.created",
        object: { id: "dsp_1", transaction: "ord_8" },
      }),
    );
    expect(refund.providerPaymentId).toBe("ord_9");
    expect(dispute.providerPaymentId).toBe("ord_8");
  });
});

describe("createCheckout", () => {
  function stubFetch() {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ id: "ch_1", checkout_url: "https://pay/x" }), {
          status: 200,
        });
      }),
    );
    return calls;
  }

  const base = {
    sponsorshipId: "sp-1",
    idempotencyKey: "idem-1",
    description: "كفالة",
    returnUrl: "https://app/ok",
    cancelUrl: "https://app/no",
    currency: "USD",
  };

  // القيد المحوري: المبلغ المتكرّر يُمرَّر كعدد وحدات لا كسعر، لأن
  // custom_price لا يعمل مع المنتجات المتكرّرة.
  it("الكفالة الشهرية تُمرَّر بالوحدات بلا custom_price", async () => {
    const calls = stubFetch();
    await creemProvider.createCheckout({ ...base, amount: 80, recurring: true });

    expect(calls[0]!.url).toBe("https://test-api.creem.io/v1/checkouts");
    expect(calls[0]!.body["product_id"]).toBe("prod_monthly");
    expect(calls[0]!.body["units"]).toBe(80);
    expect(calls[0]!.body).not.toHaveProperty("custom_price");
    expect(calls[0]!.body["metadata"]).toEqual({ sponsorship_id: "sp-1" });
  });

  it("الدفعة الواحدة تستعمل custom_price بالسنتات", async () => {
    const calls = stubFetch();
    await creemProvider.createCheckout({ ...base, amount: 80, recurring: false });

    expect(calls[0]!.body["product_id"]).toBe("prod_onetime");
    expect(calls[0]!.body["custom_price"]).toBe(8000);
    expect(calls[0]!.body["units"]).toBe(1);
  });

  // مفتاح الاختبار على نطاق الإنتاج يُرفض من المزوّد، فالاشتقاق من
  // المفتاح يمنع تناقضاً لا يظهر إلا عند أول دفعة حقيقية.
  it("يشتقّ نطاق الإنتاج من مفتاح الإنتاج", async () => {
    process.env["CREEM_API_KEY"] = "creem_live_key";
    const calls = stubFetch();
    await creemProvider.createCheckout({ ...base, amount: 25, recurring: true });
    expect(calls[0]!.url).toBe("https://api.creem.io/v1/checkouts");
  });

  // APP-04: منتجٌ بدولار واحد يحصّل 40 دولاراً لكفالةٍ بـ40 يورو.
  it("يرفض عملةً لا منتج لها بدل تحصيلها بعملةٍ أخرى", async () => {
    const calls = stubFetch();
    await expect(
      creemProvider.createCheckout({ ...base, currency: "EUR", amount: 40, recurring: true }),
    ).rejects.toBeInstanceOf(CurrencyNotSupportedError);
    expect(calls).toHaveLength(0);
  });

  it("يختار منتج العملة حين يُضبط", async () => {
    process.env["CREEM_PRODUCT_MONTHLY_EUR"] = "prod_monthly_eur";
    try {
      const calls = stubFetch();
      await creemProvider.createCheckout({ ...base, currency: "EUR", amount: 40, recurring: true });
      expect(calls[0]!.body["product_id"]).toBe("prod_monthly_eur");
      expect(calls[0]!.body["units"]).toBe(40);
    } finally {
      delete process.env["CREEM_PRODUCT_MONTHLY_EUR"];
    }
  });

  it("المنتج العامّ بعملته المعلنة", async () => {
    process.env["CREEM_PRODUCT_CURRENCY"] = "EUR";
    try {
      const calls = stubFetch();
      await creemProvider.createCheckout({ ...base, currency: "eur", amount: 40, recurring: true });
      expect(calls[0]!.body["product_id"]).toBe("prod_monthly");
      await expect(
        creemProvider.createCheckout({ ...base, currency: "USD", amount: 40, recurring: true }),
      ).rejects.toBeInstanceOf(CurrencyNotSupportedError);
    } finally {
      delete process.env["CREEM_PRODUCT_CURRENCY"];
    }
  });

  it("لا يدوّر مبلغاً شهرياً كسرياً صامتاً", async () => {
    stubFetch();
    await expect(
      creemProvider.createCheckout({ ...base, amount: 40.5, recurring: true }),
    ).rejects.toThrow();
  });

  it("يرفض مبلغاً دون الحدّ الأدنى بدل إرساله للمزوّد", async () => {
    stubFetch();
    await expect(
      creemProvider.createCheckout({ ...base, amount: 0.4, recurring: true }),
    ).rejects.toThrow();
  });
});

describe("cancelSubscription", () => {
  function stubCancel(status = 200, text = "{}") {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
        return new Response(text, { status });
      }),
    );
    return calls;
  }

  // APP-02: إلغاء الكافل نافذٌ آخر الدورة المدفوعة، لا فوراً.
  it("الإلغاء المجدول يُرسل mode=scheduled", async () => {
    const calls = stubCancel();
    await creemProvider.cancelSubscription("sub_1", "scheduled");
    expect(calls[0]!.url).toBe("https://test-api.creem.io/v1/subscriptions/sub_1/cancel");
    expect(calls[0]!.body).toEqual({ mode: "scheduled" });
  });

  it("الافتراض فوريّ (خروج الطفل)", async () => {
    const calls = stubCancel();
    await creemProvider.cancelSubscription("sub_2");
    expect(calls[0]!.body).toEqual({ mode: "immediate" });
  });

  it("اشتراكٌ مُلغى سلفاً نجاح", async () => {
    stubCancel(400, '{"message":"Subscription already canceled"}');
    await expect(creemProvider.cancelSubscription("sub_3")).resolves.toBeUndefined();
  });

  it("خطأ المزوّد الآخر يُرفع ليُعاد لاحقاً", async () => {
    stubCancel(503, "unavailable");
    await expect(creemProvider.cancelSubscription("sub_4")).rejects.toThrow(/503/);
  });
});

describe("isConfigured", () => {
  it("يشترط المفتاح والسرّ والمنتج المتكرّر", () => {
    expect(creemProvider.isConfigured()).toBe(true);
    delete process.env["CREEM_PRODUCT_MONTHLY"];
    expect(creemProvider.isConfigured()).toBe(false);
  });
});
