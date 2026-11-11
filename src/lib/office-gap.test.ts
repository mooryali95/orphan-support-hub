import { describe, expect, it } from "vitest";

import { type NetworkCountry, WAMY_COUNTRIES } from "@/data/wamy-network";
import {
  CONFIDENCE_WEIGHT,
  coverage,
  estimateOrphans,
  isPublicPresence,
  NETWORK_BY_CODE,
  priorityOf,
  rankPriorities,
  rationale,
  tierOf,
} from "./office-gap";

const OFFICE = "SA TD NE SD KE DJ SN GN MR EG NG KG TH CM ML ID BD BA BR PS".split(" ");
const FIELD = "AL XK MK ET TZ RW CI".split(" ");
const UNCONFIRMED = "SO YE PH IQ ZA MY TJ UG".split(" ");

const country = (over: Partial<NetworkCountry>): NetworkCountry => ({
  code: "ZZ",
  nameAr: "تجربة",
  presence: { status: "unconfirmed", lastEvidenceYear: null, source: null, url: null },
  need: [],
  context: null,
  ...over,
});
const ind = (over: Partial<NetworkCountry["need"][number]>): NetworkCountry["need"][number] => ({
  key: "orphans_total",
  value: 1,
  unit: "count",
  year: "2024",
  source: "S",
  sourceShort: "S",
  url: "https://example.org",
  note: "",
  confidence: "high",
  derived: false,
  check: "confirmed",
  ...over,
});

describe("بيانات الشبكة", () => {
  it("تصنّف كل دولةٍ في حالةٍ واحدة كما اعتمدها المالك", () => {
    const by = (s: string) =>
      WAMY_COUNTRIES.filter((c) => c.presence.status === s)
        .map((c) => c.code)
        .sort();
    expect(by("office")).toEqual([...OFFICE].sort());
    expect(by("field")).toEqual([...FIELD].sort());
    expect(by("unconfirmed")).toEqual([...UNCONFIRMED].sort());
    expect(new Set(WAMY_COUNTRIES.map((c) => c.code)).size).toBe(WAMY_COUNTRIES.length);
  });

  it("لكل قيمةٍ مصدرٌ ورابطٌ وسنة ودرجة ثقة", () => {
    for (const c of WAMY_COUNTRIES)
      for (const i of c.need) {
        expect(i.url).toMatch(/^https?:\/\//);
        expect(i.source.length).toBeGreaterThan(2);
        expect(i.year).toMatch(/\d{4}/);
        expect(["high", "medium", "low"]).toContain(i.confidence);
      }
  });

  it("لا تُعلَن مدنٌ لم يؤكّدها البحث", () => {
    for (const code of ["CM", "NG", "TH", "KG", "ML", ...FIELD]) {
      const p = NETWORK_BY_CODE.get(code)!.presence;
      expect(p.status !== "unconfirmed" && p.city).toBeFalsy();
    }
    const cities = WAMY_COUNTRIES.flatMap((c) =>
      isPublicPresence(c) && c.presence.city ? [c.presence.city.ar] : [],
    );
    for (const bad of ["ياوندي", "أبوجا", "بانكوك", "فريزاي", "عدن", "كاجنغ", "كاجانغ"])
      expect(cities).not.toContain(bad);
  });

  it("المقرّ الرئيسي في الرياض، وغير المؤكَّد لا يُعرض مكتباً", () => {
    const sa = NETWORK_BY_CODE.get("SA")!;
    expect(sa.presence.status === "office" && sa.presence.hq).toBe(true);
    expect(WAMY_COUNTRIES.filter(isPublicPresence).map((c) => c.code)).not.toContain("SO");
  });

  it("تطبّق تصحيحات التحقّق: غزّة ٥٨ ألفاً (٢٠٢٦)، وما تعذّر التحقّق موسوم", () => {
    const ps = NETWORK_BY_CODE.get("PS")!.need.find((i) => i.key === "conflict_orphans")!;
    expect(ps.value).toBe(58000);
    expect(ps.year).toContain("2026");
    expect(ps.check).toBe("confirmed");
    const ci = NETWORK_BY_CODE.get("CI")!.need.find((i) => i.key === "orphans_total")!;
    expect(ci.check).toBe("unverifiable");
    expect(ci.confidence).toBe("low");
  });
});

describe("تقدير الأيتام", () => {
  it("يفضّل العدد المنشور، ثم يشتقّ من السكان × النسبة بأضعف الثقتين", () => {
    expect(
      estimateOrphans(
        country({
          need: [
            ind({ key: "child_pop_u18", value: 1_000_000, confidence: "high" }),
            ind({ key: "orphan_rate_pct", value: 10, year: "2010", confidence: "low" }),
          ],
        }),
      ),
    ).toMatchObject({
      value: 100_000,
      derived: true,
      basis: "derived",
      confidence: "low",
      year: 2024,
      rateYear: 2010,
    });
  });

  it("لا يستعمل رقماً تعذّر التحقّق منه، ولا يخمّن", () => {
    const c = country({ need: [ind({ value: 5_000_000, check: "unverifiable" })] });
    expect(estimateOrphans(c)).toBeNull();
    expect(priorityOf(c)).toMatchObject({ tier: "data", score: 0 });
    expect(priorityOf(c)!.unverified?.value).toBe(5_000_000);
  });

  it("يرجع إلى أيتام الحرب حين لا عدد كلّياً", () => {
    const c = country({ need: [ind({ key: "conflict_orphans", value: 58000 })] });
    expect(estimateOrphans(c)).toMatchObject({ basis: "conflict", value: 58000 });
  });

  it("يزن بالثقة: عالية ١، متوسطة ٠٫٨، منخفضة ٠٫٦", () => {
    expect(CONFIDENCE_WEIGHT).toEqual({ high: 1, medium: 0.8, low: 0.6 });
    const e = (confidence: "high" | "medium" | "low", value: number) =>
      estimateOrphans(country({ need: [ind({ value, confidence })] }));
    expect(tierOf(e("high", 1_000_000))).toBe("high");
    expect(tierOf(e("low", 1_500_000))).toBe("medium");
    expect(tierOf(null)).toBe("data");
  });
});

describe("قرار التوسّع من البيانات الفعلية", () => {
  const ranked = rankPriorities();

  it("يشمل الدول بلا مكتبٍ مؤكَّد فقط", () => {
    expect(ranked.map((r) => r.code).sort()).toEqual([...FIELD, ...UNCONFIRMED].sort());
  });

  it("الأولوية العالية: تنزانيا وإثيوبيا وأوغندا وجنوب أفريقيا", () => {
    const high = ranked.filter((r) => r.tier === "high").map((r) => r.code);
    expect(high.sort()).toEqual(["ET", "TZ", "UG", "ZA"]);
    expect(ranked[0]!.code).toBe("TZ");
    const tz = ranked.find((r) => r.code === "TZ")!;
    expect(tz.estimate?.value).toBe(3_133_199);
    expect(ranked.find((r) => r.code === "ET")!.estimate?.value).toBe(4_281_840);
  });

  it("العراق واليمن بحسب بياناتهما — متوسطة", () => {
    expect(ranked.find((r) => r.code === "IQ")).toMatchObject({ tier: "medium" });
    expect(ranked.find((r) => r.code === "YE")).toMatchObject({ tier: "medium" });
    expect(ranked.find((r) => r.code === "YE")!.estimate?.value).toBe(600_000);
  });

  it("من لا رقم موثوقاً له يذهب إلى «تحتاج بيانات»", () => {
    const data = ranked.filter((r) => r.tier === "data").map((r) => r.code);
    for (const code of ["XK", "MK", "CI", "SO", "PH", "MY", "TJ"]) expect(data).toContain(code);
  });

  it("لكل عنصرٍ سطر تعليل بالرقم والسنة والمصدر بالعربية والإنجليزية", () => {
    const tz = ranked.find((r) => r.code === "TZ")!;
    const ar = rationale(tz, "ar");
    expect(ar).toContain("2022");
    expect(ar).toContain("NBS Tanzania");
    expect(ar).toContain("3.1");
    expect(ar).toContain("بلا مكتبٍ مؤكَّد");
    const et = rationale(
      ranked.find((r) => r.code === "ET")!,
      "en",
    );
    expect(et).toContain("2023 population × 2016 rate");
    expect(et).toContain("estimate");
    expect(
      rationale(
        ranked.find((r) => r.code === "CI")!,
        "ar",
      ),
    ).toContain("تعذّر التحقّق");
  });

  it("التغطية لدول المكاتب: الحاجة مقابل الحضور، والأكبر حاجةً أولاً", () => {
    const cov = coverage();
    expect(cov.map((c) => c.code).sort()).toEqual([...OFFICE].sort());
    expect(cov[0]!.code).toBe("NG");
    expect(cov.find((c) => c.code === "PS")!.estimate).toMatchObject({ basis: "conflict" });
  });
});
