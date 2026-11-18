import { describe, expect, it } from "vitest";

import { gapOrphans, seed, totals } from "@/lib/vision-engine";

import {
  albaniaRegions,
  ENGINE_KEY,
  levelFacts,
  loadEngine,
  payEngine,
  saveEngine,
} from "./engine-bridge";
import { byCode, regionsFor } from "./model";

const at = 1_700_000_000_000;
const base = () => regionsFor(byCode("AL")!);

describe("جسر القاعة إلى محرّك الرؤية", () => {
  it("مناطق ألبانيا تأخذ أرقامها من المحرّك", () => {
    const s = seed();
    const t = albaniaRegions(s, base()).find((r) => r.id === "tirana")!;
    const c = s.cities.find((x) => x.id === "tirana")!;
    expect(t.need).toBe(c.need);
    expect(t.need - t.qualified).toBe(gapOrphans(c));
  });

  it("التأهيل من القاعة تبرّعٌ في المحرّك يضيّق الفجوة", () => {
    const s0 = seed();
    const s1 = payEngine(s0, {
      track: "qualify",
      amount: 10_000,
      kids: 16,
      city: "tirana",
      donor: "داعم القاعة",
      at,
    });
    expect(totals(s1).raised).toBe(10_000);
    expect(totals(s1).gap).toBeLessThan(totals(s0).gap);
    const f = levelFacts(s0, s1, "tirana")!;
    expect(f.group.funded).toBe(true);
    expect(f.child.code.startsWith("DEMO-")).toBe(true);
    expect(f.child.traits).toHaveLength(6);
  });

  it("الكفالة والكسوة تُقيَّدان وتُسلَّمان في المحرّك", () => {
    const s0 = seed();
    const sp = payEngine(s0, {
      track: "sponsor",
      amount: 3600,
      kids: 2,
      city: "tirana",
      donor: "د",
      at,
    });
    expect(sp.sponsorships).toHaveLength(2);
    expect(sp.sponsorships.every((x) => x.months === 1)).toBe(true);
    const k = payEngine(s0, {
      track: "kiswa",
      amount: 3000,
      kids: 10,
      city: "tirana",
      donor: "د",
      at,
    });
    expect(totals(k).kitsDelivered).toBe(10);
    const r = albaniaRegions(k, base()).find((x) => x.id === "tirana")!;
    expect(r.clothed).toBeGreaterThan(base().find((x) => x.id === "tirana")!.clothed);
  });

  it("يحفظ ويسترجع بالمفتاح نفسه، ويتسامح مع التخزين الممنوع", () => {
    const mem = new Map<string, string>();
    const st = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    };
    const s = payEngine(seed(), {
      track: "qualify",
      amount: 6000,
      kids: 9,
      city: "berat",
      donor: "د",
      at,
    });
    saveEngine(s, st);
    expect(mem.has(ENGINE_KEY)).toBe(true);
    expect(totals(loadEngine(st)).raised).toBe(6000);
    expect(loadEngine(null).groups.length).toBeGreaterThan(0);
  });
});
