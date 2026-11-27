import { afterEach, describe, expect, it, vi } from "vitest";
import { LAST_GIFT_KEY, readLastGift, saveLastGift } from "./last-gift";
import { USER_DATA_PREFIXES } from "./client-state";

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("last gift", () => {
  it("round-trips a confirmed amount and currency", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage() });
    saveLastGift({ amount: 73, currency: "USD" });
    expect(readLastGift()).toEqual({ amount: 73, currency: "USD" });
  });

  it("ignores damaged values and works without storage", () => {
    const s = fakeStorage();
    vi.stubGlobal("window", { localStorage: s });
    s.setItem(LAST_GIFT_KEY, '{"amount":-4,"currency":"usd"}');
    expect(readLastGift()).toBeNull();
    s.setItem(LAST_GIFT_KEY, "not json");
    expect(readLastGift()).toBeNull();
    vi.unstubAllGlobals();
    expect(readLastGift()).toBeNull();
  });

  it("is wiped on sign-out with the other donor data", () => {
    expect(USER_DATA_PREFIXES.some((p) => LAST_GIFT_KEY.startsWith(p))).toBe(true);
  });
});
