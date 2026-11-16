import { describe, expect, it } from "vitest";

import {
  COST_PER_ORPHAN,
  fundingPct,
  gapOrphans,
  isFunded,
  recommend,
  reduce,
  revive,
  seed,
  SESSIONS_PER_CYCLE,
  totals,
} from "./vision-engine";

const at = 1_700_000_000_000;
const tirana = (s: ReturnType<typeof seed>) => s.cities.find((c) => c.id === "tirana")!;

describe("vision engine", () => {
  it("seeds the demo picture: 19 groups, 14 funded, Tirana at 34%", () => {
    const s = seed();
    expect(s.groups).toHaveLength(19);
    expect(fundingPct(tirana(s))).toBe(34);
    expect(totals(s).fundedGroups).toBe(14);
    expect(s.groups.every((g) => g.id.startsWith("demo-"))).toBe(true);
  });

  it("a card donation settles, invoices, funds the waiting group and narrows the gap", () => {
    const s0 = seed();
    const gap0 = gapOrphans(tirana(s0));
    const s = reduce(s0, {
      type: "donate",
      donor: "أ",
      amount: 10_000,
      method: "card",
      target: { kind: "city", id: "tirana" },
      at,
    });
    const d = s.donations[0]!;
    expect(d.status).toBe("settled");
    expect(d.invoice).toBe("DEMO-INV-2026-0001");
    expect(d.fee).toBe(500);
    expect(gapOrphans(tirana(s))).toBeLessThan(gap0);
    expect(s.groups.filter((g) => g.city === "tirana").filter(isFunded).length).toBeGreaterThan(
      s0.groups.filter((g) => g.city === "tirana").filter(isFunded).length,
    );
    expect(totals(s).raised).toBe(10_000);
  });

  it("a bank transfer waits for confirmation and has no fee", () => {
    let s = reduce(seed(), {
      type: "donate",
      donor: "ب",
      amount: 3000,
      method: "bank",
      target: { kind: "city", id: "berat" },
      at,
    });
    expect(s.donations[0]!.status).toBe("pending");
    expect(totals(s).raised).toBe(0);
    s = reduce(s, { type: "confirmTransfer", id: s.donations[0]!.id, at });
    expect(s.donations[0]!.status).toBe("settled");
    expect(s.donations[0]!.net).toBe(3000);
  });

  it("sessions only run for funded groups, and measurement closes the need", () => {
    let s = seed();
    const unfunded = s.groups.find((g) => !isFunded(g))!;
    expect(reduce(s, { type: "session", group: unfunded.id, at })).toBe(s);
    const g = s.groups.find((x) => isFunded(x) && x.sessionsDone < SESSIONS_PER_CYCLE)!;
    while (s.groups.find((x) => x.id === g.id)!.sessionsDone < SESSIONS_PER_CYCLE) {
      s = reduce(s, { type: "session", group: g.id, at });
    }
    const city0 = s.cities.find((c) => c.id === g.city)!.need;
    s = reduce(s, { type: "measure", group: g.id, at });
    const after = s.groups.find((x) => x.id === g.id)!;
    expect(after.after).toBeGreaterThan(after.before);
    expect(s.cities.find((c) => c.id === g.city)!.need).toBe(city0 - g.members);
  });

  it("enough free pool recommends a new group, and applying it creates one once", () => {
    let s = seed();
    // تمويل كلّ مجموعات تيرانا ثم رصيدٌ حرّ يكفي مجموعة.
    s = reduce(s, {
      type: "donate",
      donor: "ج",
      amount: 40_000,
      method: "bank",
      target: { kind: "city", id: "tirana" },
      at,
    });
    s = reduce(s, { type: "confirmTransfer", id: s.donations[0]!.id, at });
    const rec = recommend(s).find((r) => r.kind === "newGroup" && r.city === "tirana");
    expect(rec).toBeDefined();
    const n = s.groups.length;
    s = reduce(s, { type: "apply", key: rec!.key, at });
    expect(s.groups).toHaveLength(n + 1);
    expect(s.groups.at(-1)!.fromDecision).toBe(true);
    expect(recommend(s).some((r) => r.key === rec!.key)).toBe(false);
  });

  it("recommends a campaign for the largest gap, computed from the numbers", () => {
    const top = recommend(seed()).find((r) => r.kind === "campaign")!;
    expect(top.city).toBe("tirana");
    expect(top.amount).toBe(top.gap! * COST_PER_ORPHAN);
  });

  it("rejects malformed amounts and corrupt saved state", () => {
    const s = seed();
    expect(
      reduce(s, {
        type: "donate",
        donor: "x",
        amount: 0,
        method: "card",
        target: { kind: "city", id: "tirana" },
        at,
      }),
    ).toBe(s);
    expect(revive({ v: 9 }).groups).toHaveLength(19);
    expect(revive(null).events).toEqual([]);
  });
});

describe("demo children", async () => {
  const { childrenOf, stageOf } = await import("./vision-children");
  it("derives stable pseudonymous files that follow the group", () => {
    const s = seed();
    const g = s.groups[0]!;
    const a = childrenOf(g);
    expect(a).toHaveLength(g.members);
    expect(childrenOf(g)).toEqual(a);
    expect(a.every((c) => c.code.startsWith("DEMO-"))).toBe(true);
    const waiting = s.groups.find((x) => !isFunded(x))!;
    expect(stageOf(waiting)).toBe("waiting");
  });
});

describe("impact levels", async () => {
  const { childrenOf, traitsOf, growthOf, levelOf } = await import("./vision-children");
  const { TRAITS } = await import("@/data/vision-demo");
  it("measured groups lift their children's six traits, and levels follow thresholds", () => {
    const g = seed().groups.find((x) => x.after !== null)!;
    const kid = childrenOf(g)[0]!;
    const t = traitsOf(kid, TRAITS);
    expect(t).toHaveLength(6);
    expect(t.every((x) => x.after !== null && x.after >= x.before)).toBe(true);
    const gr = growthOf(t);
    expect(gr.after!).toBeGreaterThan(gr.before);
    expect([levelOf(15.9), levelOf(16), levelOf(17.5), levelOf(19)]).toEqual([
      "start",
      "growing",
      "capable",
      "distinct",
    ]);
  });
});

describe("time", () => {
  it("a month brings recurring support, sessions and measurement, and a history point", () => {
    const s0 = seed();
    expect(s0.history).toHaveLength(6);
    let s = reduce(s0, { type: "advanceMonth", at });
    expect(s.month).toBe(1);
    expect(s.history).toHaveLength(7);
    expect(s.donations.length).toBe(3);
    expect(totals(s).sessions).toBeGreaterThan(totals(s0).sessions);
    // tirana-1 كان جاهزاً للقياس: يُقاس في الشهر الأوّل.
    expect(s.groups.find((g) => g.id === "demo-g-tirana-1")!.after).not.toBeNull();
    for (let i = 0; i < 4; i++) s = reduce(s, { type: "advanceMonth", at });
    expect(s.history.at(-1)!.measured).toBeGreaterThan(s0.history.at(-1)!.measured);
  });
});

describe("what if", async () => {
  const { whatIf, planOf, DECISION_FUND } = await import("./vision-engine");
  it("projects a budget without touching state, and applying it records a decision", () => {
    const s = seed();
    const snap = JSON.stringify(s);
    const w = whatIf(s, { amount: 30_000, strategy: "even" });
    expect(JSON.stringify(s)).toBe(snap);
    expect(w.next.gap).toBeLessThan(w.now.gap);
    expect(planOf(s, { amount: 30_000, strategy: "gap" })).toEqual([
      { city: "tirana", amount: 30_000 },
    ]);
    const big = whatIf(s, { amount: 10_000_000, strategy: "even" });
    expect(big.cities.every((c) => c.after <= Math.max(100, c.before))).toBe(true);
    expect(big.unused).toBeGreaterThan(0);
    if (w.monthsNow !== null && w.monthsNext !== null)
      expect(w.monthsNext).toBeLessThanOrEqual(w.monthsNow);
    const n = reduce(s, { type: "scenario", scenario: { amount: 30_000, strategy: "gap" }, at });
    expect(n.donations.every((d) => d.donor === DECISION_FUND && d.status === "settled")).toBe(
      true,
    );
    expect(n.events[0]!.kind).toBe("decision");
    expect(totals(n).gap).toBeLessThan(totals(s).gap);
  });
});

describe("role inbox", async () => {
  const { relevantFor } = await import("@/components/vision/Inbox");
  it("each role sees only what concerns it", () => {
    let s = reduce(seed(), {
      type: "donate",
      donor: "أ",
      amount: 6000,
      method: "card",
      target: { kind: "city", id: "tirana" },
      at,
    });
    s = reduce(s, {
      type: "donate",
      donor: "ب",
      amount: 6000,
      method: "card",
      target: { kind: "city", id: "berat" },
      at,
    });
    const mine = relevantFor(s, { role: "supporter", name: "أ" });
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((e) => !String(e.args["donor"] ?? "أ").includes("ب"))).toBe(true);
    const dec = relevantFor(s, { role: "decider", name: "x" });
    expect(dec.every((e) => e.layer === "decision")).toBe(true);
    const sup = relevantFor(s, { role: "supervisor", name: "x" });
    expect(sup.every((e) => e.layer === "operations")).toBe(true);
  });
});
