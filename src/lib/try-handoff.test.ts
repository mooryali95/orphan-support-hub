import { describe, expect, it } from "vitest";

import {
  clearHandoff,
  dismissProposal,
  firstLeave,
  HANDOFF_KEY,
  HANDOFF_MAX,
  HANDOFF_TTL_MS,
  loadProposals,
  markResume,
  matchProposal,
  parseHandoff,
  proposalsFrom,
  syncHandoff,
  takeResume,
  tryJourney,
  tryStageOf,
  type TrialProposal,
} from "@/lib/try-handoff";

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
}

const NOW = Date.parse("2026-11-21T10:00:00Z");
const coOf = (id: string) => ({ "try-01": "AL", "try-03": "EG" })[id];

const gift = (over: Record<string, unknown> = {}) => ({
  id: "gift-1",
  childId: "try-01",
  amount: 50,
  cadence: "monthly" as const,
  at: "2026-11-21T09:00:00Z",
  ...over,
});
const pledge = (over: Record<string, unknown> = {}) => ({
  id: "DEMO-PLG-1",
  kind: "qualification" as const,
  scope: "region",
  target: "EGY-1533",
  co: "EG",
  amount: 30,
  currency: "USD",
  at: "2026-11-21T09:30:00Z",
  ...over,
});

describe("proposalsFrom", () => {
  it("carries kind, country, amount and cadence, and never the trial child", () => {
    const [p] = proposalsFrom([gift({ cadence: "one_time" })], [], coOf, "EUR");
    expect(p).toEqual({
      id: "gift-1",
      track: "sponsorship",
      cadence: "one_time",
      co: "AL",
      amount: 50,
      currency: "EUR",
      at: "2026-11-21T09:00:00Z",
    });
    expect(JSON.stringify(p)).not.toContain("try-01");
  });

  it("keeps the amount as the visitor typed it when they paid in another currency", () => {
    const [p] = proposalsFrom(
      [gift({ amount: 46.2, paid: { amount: 50, currency: "USD" } })],
      [],
      coOf,
      "EUR",
    );
    expect(p).toMatchObject({ amount: 50, currency: "USD" });
  });

  it("turns pledges into monthly proposals of their kind and drops scope and target", () => {
    const [p] = proposalsFrom([], [pledge({ kind: "in_kind" })], coOf, "EUR");
    expect(p).toMatchObject({ track: "in_kind", cadence: "monthly", co: "EG", amount: 30 });
    expect(p).not.toHaveProperty("target");
    expect(p).not.toHaveProperty("scope");
  });

  it("orders newest first, drops what it cannot place, and caps the list", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      gift({ id: `gift-${i}`, at: new Date(NOW - i * 60_000).toISOString() }),
    );
    const out = proposalsFrom(
      [...many, gift({ id: "lost", childId: "try-99" }), gift({ id: "zero", amount: 0 })],
      [pledge({ at: new Date(NOW + 1000).toISOString() })],
      coOf,
      "EUR",
    );
    expect(out).toHaveLength(HANDOFF_MAX);
    expect(out[0]!.id).toBe("DEMO-PLG-1");
    expect(out.map((p) => p.id)).not.toContain("lost");
    expect(out.map((p) => p.id)).not.toContain("zero");
  });
});

describe("stored handoff", () => {
  const proposals = proposalsFrom([gift()], [pledge()], coOf, "EUR");

  it("round-trips through storage", () => {
    const s = memory();
    syncHandoff(proposals, s, NOW);
    expect(loadProposals(s, NOW)).toEqual(proposals);
  });

  it("expires, and rejects what is malformed or from the future", () => {
    const s = memory();
    syncHandoff(proposals, s, NOW);
    expect(loadProposals(s, NOW + HANDOFF_TTL_MS + 1)).toEqual([]);
    expect(parseHandoff("{", NOW)).toBeNull();
    expect(parseHandoff(JSON.stringify({ v: 2, at: NOW, proposals }), NOW)).toBeNull();
    expect(parseHandoff(JSON.stringify({ v: 1, at: NOW + 3_600_000, proposals }), NOW)).toBeNull();
  });

  it("drops tampered proposals instead of showing them", () => {
    const bad = [
      { ...proposals[0], amount: -5 },
      { ...proposals[0], amount: 5_000_000 },
      { ...proposals[0], currency: "euro" },
      { ...proposals[0], co: "Albania" },
      { ...proposals[0], track: "payment" },
      { ...proposals[0], at: "yesterday" },
    ];
    const h = parseHandoff(JSON.stringify({ v: 1, at: NOW, proposals: bad, dismissed: [] }), NOW);
    expect(h?.proposals).toEqual([]);
  });

  it("forces pledges to monthly whatever was stored", () => {
    const raw = JSON.stringify({
      v: 1,
      at: NOW,
      proposals: [{ ...proposals[0], track: "in_kind", cadence: "one_time" }],
      dismissed: [],
    });
    expect(parseHandoff(raw, NOW)?.proposals[0]?.cadence).toBe("monthly");
  });

  it("keeps a dismissed proposal hidden across later syncs", () => {
    const s = memory();
    syncHandoff(proposals, s, NOW);
    dismissProposal("gift-1", s, NOW);
    expect(loadProposals(s, NOW).map((p) => p.id)).toEqual(["DEMO-PLG-1"]);
    syncHandoff(proposals, s, NOW + 1000);
    expect(loadProposals(s, NOW + 1000).map((p) => p.id)).toEqual(["DEMO-PLG-1"]);
  });

  it("forgets everything when the trial starts over", () => {
    const s = memory();
    syncHandoff(proposals, s, NOW);
    dismissProposal("gift-1", s, NOW);
    syncHandoff([], s, NOW);
    expect(s.raw.has(HANDOFF_KEY)).toBe(false);
    // the same record id made again after a restart is a new choice
    syncHandoff(proposals, s, NOW);
    expect(loadProposals(s, NOW)).toHaveLength(2);
  });

  it("does not rewrite storage when nothing changed", () => {
    const s = memory();
    syncHandoff(proposals, s, NOW);
    const before = s.raw.get(HANDOFF_KEY);
    syncHandoff(proposals, s, NOW + 5000);
    expect(s.raw.get(HANDOFF_KEY)).toBe(before);
  });

  it("clears on request and survives a blocked store", () => {
    const s = memory();
    syncHandoff(proposals, s, NOW);
    clearHandoff(s);
    expect(loadProposals(s, NOW)).toEqual([]);
    expect(() => syncHandoff(proposals, null, NOW)).not.toThrow();
    expect(loadProposals(null, NOW)).toEqual([]);
    expect(() => dismissProposal("x", null, NOW)).not.toThrow();
  });
});

describe("matchProposal", () => {
  const list: TrialProposal[] = proposalsFrom(
    [gift(), gift({ id: "gift-2", childId: "try-03", at: "2026-11-21T09:45:00Z" })],
    [pledge()],
    coOf,
    "EUR",
  );

  it("prefers the same country, then the newest of the wanted tracks", () => {
    expect(matchProposal(list, { tracks: ["sponsorship"], co: "AL" })?.id).toBe("gift-1");
    expect(matchProposal(list, { tracks: ["sponsorship"], co: "KE" })?.id).toBe("gift-2");
    expect(matchProposal(list, { tracks: ["sponsorship"] })?.id).toBe("gift-2");
  });

  it("never offers another country's proposal on a place card", () => {
    const want = { tracks: ["qualification", "in_kind"] as const, sameCountryOnly: true };
    expect(matchProposal(list, { ...want, co: "EG" })?.id).toBe("DEMO-PLG-1");
    expect(matchProposal(list, { ...want, co: "AL" })).toBeNull();
    expect(matchProposal(list, { ...want })).toBeNull();
  });

  it("returns nothing when no track matches", () => {
    expect(matchProposal(list, { tracks: ["in_kind"], co: "EG" })).toBeNull();
  });
});

describe("journey stages", () => {
  it("places each trial page on its stage", () => {
    expect(tryStageOf("/try")).toBe("choose");
    expect(tryStageOf("/try/")).toBe("choose");
    expect(tryStageOf("/try/try-01")).toBe("give");
    expect(tryStageOf("/try/pay")).toBe("give");
    expect(tryStageOf("/try/support")).toBe("give");
    expect(tryStageOf("/hall")).toBe("give");
    expect(tryStageOf("/try/impact")).toBe("impact");
  });

  const states = (path: string, has: boolean, registered = false) =>
    tryJourney(path, has, registered).map((s) => s.state);

  it("marks what is behind as done and the real journey as ahead until registered", () => {
    expect(states("/try", false)).toEqual(["current", "ahead", "ahead", "ahead"]);
    expect(states("/try/pay", false)).toEqual(["done", "current", "ahead", "ahead"]);
    expect(states("/try/impact", true)).toEqual(["done", "done", "current", "ahead"]);
    expect(states("/try/impact", true, true)).toEqual(["done", "done", "current", "done"]);
  });

  it("remembers a simulated gift when the visitor walks back", () => {
    expect(states("/try", true)).toEqual(["current", "done", "ahead", "ahead"]);
    expect(states("/try/impact", false)).toEqual(["done", "done", "current", "ahead"]);
  });
});

describe("tab flags", () => {
  it("resumes once", () => {
    const s = memory();
    expect(takeResume(s)).toBe(false);
    markResume(s);
    expect(takeResume(s)).toBe(true);
    expect(takeResume(s)).toBe(false);
  });

  it("says the leaving invitation once per tab, and never without storage", () => {
    const s = memory();
    expect(firstLeave(s)).toBe(true);
    expect(firstLeave(s)).toBe(false);
    expect(firstLeave(null)).toBe(false);
  });
});
