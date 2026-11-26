import { describe, expect, it } from "vitest";

import {
  apply,
  byCode,
  COUNTRIES,
  fitScale,
  gapOf,
  inRing,
  PLINTH_FIT,
  project,
  reach,
  regionsFor,
  totals,
} from "./model";

describe("قاعة الأثر — الشبكة", () => {
  it("كخريطة الشبكة: مقرّ و21 مكتباً و7 أنشطة ميدانية، و8 غير مؤكَّدة", () => {
    const n = (st: string) => COUNTRIES.filter((c) => c.st === st).length;
    expect(COUNTRIES).toHaveLength(37);
    expect([n("hq"), n("office"), n("field"), n("unconfirmed")]).toEqual([1, 21, 7, 8]);
    expect(byCode("SA")!.st).toBe("hq");
  });

  it("غير المؤكَّد لا يحمل مدينةً ولا نشاطاً", () => {
    for (const c of COUNTRIES.filter((x) => x.st === "unconfirmed")) {
      expect([c.city, c.type, c.act]).toEqual([null, null, null]);
    }
  });

  it("لكلّ دولة مناطق ثابتة داخل حدودها", () => {
    for (const co of COUNTRIES) {
      const a = regionsFor(co);
      expect(a.length).toBeGreaterThanOrEqual(2);
      expect(regionsFor(co)).toEqual(a);
      if (co.code !== "AL")
        for (const r of a) expect(co.rings.some((ring) => inRing(r.nx, r.ny, ring))).toBe(true);
    }
  });

  it("مدن ألبانيا من vision-demo بأسمائها", () => {
    const al = regionsFor(byCode("AL")!);
    expect(al.map((c) => c.id)).toContain("tirana");
    expect(al.find((c) => c.id === "tirana")).toMatchObject({ ar: "تيرانا", need: 88 });
  });
});

describe("قاعة الأثر — حساب الأثر", () => {
  const tirana = () => regionsFor(byCode("AL")!).find((c) => c.id === "tirana")!;

  it("التأهيل: مبلغ 10,000 = 16 طفلاً، ومجموعتان، والفجوة تنزل بقدرهم", () => {
    const c = tirana();
    const p = project("qualify", 10_000, c);
    expect(p).toMatchObject({ kids: 16, groups: 2, rest: 0, gap0: gapOf(c), gap1: gapOf(c) - 16 });
    apply(p, c);
    expect(gapOf(c)).toBe(p.track === "qualify" ? p.gap1 : -1);
  });

  it("لا يتجاوز التأهيلُ الحاجة، والباقي يُذكر", () => {
    const c = tirana();
    const p = project("qualify", 1_000_000, c);
    expect(p.kids).toBe(gapOf(c));
    expect(p.track === "qualify" && p.spill).toBeGreaterThan(0);
  });

  it("الكفالة بالأشهر، والكسوة بالأيتام", () => {
    const c = tirana();
    expect(project("sponsor", 10_000, c)).toMatchObject({
      units: 33,
      years: 2,
      months: 9,
      kids: 3,
    });
    expect(project("kiswa", 3_000, c)).toMatchObject({ kids: 10 });
  });

  it("المجاميع تتبع المناطق", () => {
    const rs = regionsFor(byCode("SN")!);
    const t = totals(rs);
    expect(t.gap).toBe(t.need - t.q);
    expect(t.pct).toBeGreaterThanOrEqual(0);
  });
});

describe("every country fits its plinth", () => {
  it.each(COUNTRIES.map((c) => [c.code, c] as const))("%s stays on the plinth", (_code, c) => {
    const k = fitScale(c);
    expect(k).toBeGreaterThan(0);
    expect(reach(c) * k).toBeLessThanOrEqual(PLINTH_FIT + 1e-9);
    // its regions (columns) stand on the land, inside the plinth too
    for (const r of regionsFor(c))
      expect(Math.hypot(r.nx, r.ny) * k).toBeLessThanOrEqual(PLINTH_FIT);
  });
  it("square countries shrink, slim ones keep the full scale", () => {
    expect(fitScale(byCode("EG")!)).toBeLessThan(6.3);
    expect(fitScale(byCode("AL")!)).toBeCloseTo(6.3, 1);
  });
});
