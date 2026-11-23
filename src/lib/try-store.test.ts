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

describe("resetTrialSession", () => {
  it("clears every trial key from the session store", async () => {
    const { resetTrialSession, TRIAL_SESSION_KEYS } = await import("@/lib/try-store");
    const data = new Map<string, string>(TRIAL_SESSION_KEYS.map((k) => [k, "x"]));
    data.set("unrelated", "keep");
    resetTrialSession({ removeItem: (k: string) => void data.delete(k) });
    expect([...data.keys()]).toEqual(["unrelated"]);
  });
});

describe("full cycle", () => {
  it("publishes a file into the trial lookup only after every document is verified", async () => {
    const cycle = await import("@/lib/try-cycle");
    const { tryChild } = await import("@/lib/try-demo");
    const c = cycle.emptyCycle();
    c.child.name = "هاجر";
    expect(cycle.cycleChild(c)).toBeNull();
    for (const d of cycle.CYCLE_DOCS) c.docs[d] = { uploaded: true, verified: true };
    expect(cycle.allUploaded(c) && cycle.allVerified(c)).toBe(true);
    const published = { ...c, stage: "published" as const };
    expect(cycle.cycleChild(published)?.id).toBe(cycle.CYCLE_CHILD_ID);
    cycle.saveCycle(published);
    expect(tryChild(cycle.CYCLE_CHILD_ID)?.name).toBe("هاجر");
  });
});
