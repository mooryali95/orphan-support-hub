import { describe, expect, it } from "vitest";

import { addGift, loadGifts, resetGifts } from "@/lib/try-demo";
import { addPledge, loadPledges } from "@/lib/try-support";
import { withMemory, type TryStore } from "@/lib/try-store";

const denied: TryStore = {
  getItem() {
    throw new Error("denied");
  },
  setItem() {
    throw new Error("denied");
  },
  removeItem() {
    throw new Error("denied");
  },
};

const working = (): TryStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

describe("trial store", () => {
  it("keeps a gift for the tab when the browser denies storage", () => {
    const store = withMemory(denied, new Map());
    addGift({ childId: "try-01", amount: 30, cadence: "monthly" }, store);
    expect(loadGifts(store)).toHaveLength(1);
    resetGifts(store);
    expect(loadGifts(store)).toEqual([]);
  });

  it("keeps a pledge for the tab when there is no browser store at all", () => {
    const store = withMemory(null, new Map());
    const p = addPledge(
      { kind: "in_kind", scope: "country", target: "AL", co: "AL", amount: 50, currency: "EUR" },
      store,
    );
    expect(p).not.toBeNull();
    expect(loadPledges(store)).toHaveLength(1);
  });

  it("uses the browser store when it works, and leaves nothing in memory", () => {
    const inner = working();
    const kept = new Map<string, string>();
    const store = withMemory(inner, kept);
    addGift({ childId: "try-01", amount: 30, cadence: "monthly" }, store);
    expect(kept.size).toBe(0);
    expect(inner.data.size).toBe(1);
    expect(loadGifts(inner)).toHaveLength(1);
  });

  it("a later successful write replaces what memory held", () => {
    const inner = working();
    const kept = new Map<string, string>([["k", "old"]]);
    const store = withMemory(inner, kept);
    expect(store.getItem("k")).toBe("old");
    store.setItem("k", "new");
    expect(kept.has("k")).toBe(false);
    expect(store.getItem("k")).toBe("new");
  });
});
