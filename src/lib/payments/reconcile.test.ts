import { describe, expect, it, vi } from "vitest";

import { processProviderCancellations, runMoneyReconcile, type ReconcileDb } from "./reconcile";
import type { PaymentProvider } from "./types";

function provider(id = "creem") {
  const cancel = vi.fn(async (_id: string, _mode?: string) => {});
  return {
    cancel,
    p: {
      id,
      isConfigured: () => true,
      supportsRecurring: () => true,
      createCheckout: async () => ({ providerCheckoutId: "", checkoutUrl: "" }),
      verifyWebhook: () => true,
      parseEvent: () => {
        throw new Error("no");
      },
      cancelSubscription: cancel,
    } satisfies PaymentProvider,
  };
}

function db(due: unknown[], fail?: string) {
  const calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
  const d: ReconcileDb = {
    rpc: async (fn, args) => {
      calls.push({ fn, ...(args ? { args } : {}) });
      if (fn === fail) return { data: null, error: { message: "boom" } };
      if (fn === "provider_cancellations_due") return { data: due, error: null };
      if (fn === "apply_due_sponsorship_transitions")
        return { data: { cancelled: 1, resumed: 0 }, error: null };
      return { data: 0, error: null };
    },
  };
  return { d, calls };
}

describe("الإلغاء لدى المزوّد", () => {
  it("يُلغي بالوضع المطلوب ويسجّل النجاح والفشل", async () => {
    const { p, cancel } = provider();
    cancel.mockRejectedValueOnce(new Error("Creem 503"));
    const { d, calls } = db([
      {
        sponsorship_id: "a",
        provider: "creem",
        provider_subscription_id: "sub_a",
        mode: "scheduled",
      },
      {
        sponsorship_id: "b",
        provider: "creem",
        provider_subscription_id: "sub_b",
        mode: "immediate",
      },
    ]);
    const r = await processProviderCancellations(d, p);
    expect(cancel).toHaveBeenNthCalledWith(1, "sub_a", "scheduled");
    expect(cancel).toHaveBeenNthCalledWith(2, "sub_b", "immediate");
    expect(r).toEqual({ done: 1, failed: 1, skipped: 0 });
    const marks = calls.filter((c) => c.fn === "mark_provider_cancel_result");
    expect(marks[0]!.args).toMatchObject({ _sponsorship: "a", _ok: false, _error: "Creem 503" });
    expect(marks[1]!.args).toMatchObject({ _sponsorship: "b", _ok: true });
  });

  it("لا يُلغي اشتراك مزوّدٍ آخر بمفتاح المزوّد الحالي", async () => {
    const { p, cancel } = provider("manual");
    const { d } = db([
      {
        sponsorship_id: "a",
        provider: "creem",
        provider_subscription_id: "sub_a",
        mode: "scheduled",
      },
    ]);
    expect(await processProviderCancellations(d, p)).toEqual({ done: 0, failed: 0, skipped: 1 });
    expect(cancel).not.toHaveBeenCalled();
  });

  it("يقتصر على كفالةٍ بعينها حين تُذكر", async () => {
    const { p, cancel } = provider();
    const { d } = db([
      {
        sponsorship_id: "a",
        provider: "creem",
        provider_subscription_id: "sub_a",
        mode: "scheduled",
      },
      {
        sponsorship_id: "b",
        provider: "creem",
        provider_subscription_id: "sub_b",
        mode: "scheduled",
      },
    ]);
    await processProviderCancellations(d, p, "b");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith("sub_b", "scheduled");
  });
});

describe("المطابقة الدورية", () => {
  it("تشغّل الانتقالات والإشعار الثاني وانقضاء الجلسات والإلغاء", async () => {
    const { p } = provider();
    const { d, calls } = db([]);
    const r = await runMoneyReconcile(d, p);
    expect(calls.map((c) => c.fn)).toEqual([
      "apply_due_sponsorship_transitions",
      "send_due_exit_followups",
      "expire_stale_checkouts",
      "provider_cancellations_due",
    ]);
    expect(r.transitions.cancelled).toBe(1);
  });

  it("خطأ القاعدة يُرفع ولا يُبتلع", async () => {
    const { p } = provider();
    const { d } = db([], "send_due_exit_followups");
    await expect(runMoneyReconcile(d, p)).rejects.toThrow(/boom/);
  });
});
