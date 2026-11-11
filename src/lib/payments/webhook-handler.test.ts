import { describe, expect, it, vi } from "vitest";

import { handlePaymentWebhook, type WebhookDb } from "./webhook-handler";
import type { PaymentEvent, PaymentProvider } from "./types";

/**
 * APP-03 / ARC-03 / APP-02: الـwebhook يفحص كل كتابة، ولا يُعلّم الحدث
 * معالَجاً إلا بعد نجاحه، ويعيد تطبيق ما فشل، ويُلغي الاشتراك حين يُرفض
 * تحصيلٌ على كفالةٍ منتهية.
 */

const baseEvent: PaymentEvent = {
  providerEventId: "evt_1",
  kind: "subscription.charged",
  sponsorshipId: "sp-1",
  providerCheckoutId: null,
  providerPaymentId: "ord_1",
  providerSubscriptionId: "sub_1",
  amount: 40,
  currency: "EUR",
  failureReason: null,
  occurredAt: null,
};

function fakeProvider(event: Partial<PaymentEvent> = {}, verified = true) {
  const cancel = vi.fn(async () => {});
  const provider: PaymentProvider = {
    id: "creem",
    isConfigured: () => true,
    supportsRecurring: () => true,
    createCheckout: async () => ({ providerCheckoutId: "x", checkoutUrl: "x" }),
    verifyWebhook: () => verified,
    parseEvent: () => ({ ...baseEvent, ...event }),
    cancelSubscription: cancel,
  };
  return { provider, cancel };
}

type Opts = {
  insertError?: { message: string; code?: string } | null;
  prior?: { id: string; processed_at: string | null } | null;
  rpc?: (fn: string, args: Record<string, unknown>) => { data: unknown; error: unknown };
  updateError?: { message: string } | null;
};

function fakeDb(opts: Opts = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const db = {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () =>
            opts.insertError
              ? { data: null, error: opts.insertError }
              : { data: { id: "row-1" }, error: null },
        }),
      }),
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: opts.prior ?? null, error: null }) }),
        }),
      }),
      update: (row: Record<string, unknown>) => ({
        eq: async () => {
          updates.push(row);
          return { data: null, error: opts.updateError ?? null };
        },
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return (opts.rpc?.(fn, args) ?? { data: { outcome: "recorded" }, error: null }) as {
        data: unknown;
        error: null;
      };
    },
  } as unknown as WebhookDb;
  return { db, updates, rpcs };
}

const raw = JSON.stringify({ id: "evt_1" });

describe("handlePaymentWebhook", () => {
  it("يرفض توقيعاً غير صالح قبل أي كتابة", async () => {
    const { provider } = fakeProvider({}, false);
    const { db, rpcs } = fakeDb();
    const res = await handlePaymentWebhook(raw, new Headers(), provider, db);
    expect(res.status).toBe(401);
    expect(rpcs).toHaveLength(0);
  });

  it("التحصيل يمرّ بدالّةٍ ذرّية ثم يُعلَّم معالَجاً", async () => {
    const { provider } = fakeProvider();
    const { db, rpcs, updates } = fakeDb();
    const res = await handlePaymentWebhook(raw, new Headers(), provider, db);
    expect(res.status).toBe(200);
    expect(rpcs[0]!.fn).toBe("record_provider_charge");
    expect(rpcs[0]!.args["_currency"]).toBe("EUR");
    expect(updates.at(-1)).toHaveProperty("processed_at");
  });

  // ARC-03: خطأ الكتابة كان يُبتلع فيُعلَّم الحدث معالَجاً ولا يعيده المزوّد.
  it("خطأ الكتابة يُرجع 500 ولا يُعلّم الحدث معالَجاً", async () => {
    const { provider } = fakeProvider();
    const { db, updates } = fakeDb({
      rpc: () => ({ data: null, error: { message: "invoice trigger failed" } }),
    });
    const res = await handlePaymentWebhook(raw, new Headers(), provider, db);
    expect(res.status).toBe(500);
    expect(updates.some((u) => "processed_at" in u)).toBe(false);
    expect(updates.at(-1)!["error"]).toMatch(/invoice trigger failed/);
  });

  // APP-03: إعادة المزوّد لحدثٍ فشل كانت تُجاب «already processed».
  it("حدثٌ مسجَّل لم يُعالَج يُعاد تطبيقه", async () => {
    const { provider } = fakeProvider();
    const { db, rpcs } = fakeDb({
      insertError: { message: "dup", code: "23505" },
      prior: { id: "row-0", processed_at: null },
    });
    const res = await handlePaymentWebhook(raw, new Headers(), provider, db);
    expect(res.status).toBe(200);
    expect(rpcs[0]!.fn).toBe("record_provider_charge");
  });

  it("حدثٌ معالَج سابقاً يُجاب 200 بلا تطبيق", async () => {
    const { provider } = fakeProvider();
    const { db, rpcs } = fakeDb({
      insertError: { message: "dup", code: "23505" },
      prior: { id: "row-0", processed_at: "2026-11-01T00:00:00Z" },
    });
    const res = await handlePaymentWebhook(raw, new Headers(), provider, db);
    expect(res.status).toBe(200);
    expect(rpcs).toHaveLength(0);
  });

  it("تعذّر تعليم الحدث معالَجاً يُرجع 500 لتُعاد المحاولة", async () => {
    const { provider } = fakeProvider();
    const { db } = fakeDb({ updateError: { message: "down" } });
    const res = await handlePaymentWebhook(raw, new Headers(), provider, db);
    expect(res.status).toBe(500);
  });

  // APP-02: التجديد على كفالةٍ ملغاة لا يُعيدها؛ والاشتراك يُلغى فوراً.
  it("تحصيلٌ مرفوض على كفالةٍ منتهية يُلغي الاشتراك فوراً ويسجّل النتيجة", async () => {
    const { provider, cancel } = fakeProvider();
    const { db, rpcs } = fakeDb({
      rpc: (fn) =>
        fn === "record_provider_charge"
          ? {
              data: {
                outcome: "refused",
                reason: "charge_after_end",
                cancel_subscription: "sub_1",
              },
              error: null,
            }
          : { data: null, error: null },
    });
    const res = await handlePaymentWebhook(raw, new Headers(), provider, db);
    expect(res.status).toBe(200);
    expect(cancel).toHaveBeenCalledWith("sub_1", "immediate");
    expect(rpcs.map((r) => r.fn)).toEqual([
      "record_provider_charge",
      "mark_provider_cancel_result",
    ]);
    expect(rpcs[1]!.args["_ok"]).toBe(true);
  });

  it("فشل الإلغاء لدى المزوّد يُسجَّل ولا يُفشل الحدث", async () => {
    const { provider, cancel } = fakeProvider();
    cancel.mockRejectedValueOnce(new Error("Creem 503"));
    const { db, rpcs } = fakeDb({
      rpc: (fn) =>
        fn === "record_provider_charge"
          ? { data: { outcome: "refused", cancel_subscription: "sub_1" }, error: null }
          : { data: null, error: null },
    });
    const res = await handlePaymentWebhook(raw, new Headers(), provider, db);
    expect(res.status).toBe(200);
    expect(rpcs[1]!.args).toMatchObject({ _ok: false, _error: "Creem 503" });
  });

  it("الردّ والإلغاء من المزوّد يمرّان بدوالّهما", async () => {
    for (const [kind, fn] of [
      ["payment.refunded", "mark_provider_payment"],
      ["subscription.cancelled", "record_provider_subscription_state"],
      ["payment.failed", "record_provider_failure"],
    ] as const) {
      const { provider } = fakeProvider({ kind });
      const { db, rpcs } = fakeDb();
      const res = await handlePaymentWebhook(raw, new Headers(), provider, db);
      expect(res.status).toBe(200);
      expect(rpcs[0]!.fn).toBe(fn);
    }
  });

  it("حدثٌ لا فعل له يُعتمد بلا كتابة", async () => {
    const { provider } = fakeProvider({ kind: "unknown", sponsorshipId: null });
    const { db, rpcs } = fakeDb();
    const res = await handlePaymentWebhook(raw, new Headers(), provider, db);
    expect(res.status).toBe(200);
    expect(rpcs).toHaveLength(0);
  });
});
