import { describe, expect, it } from "vitest";

import type { Geo } from "@/lib/geo";
import * as demoStats from "./demo-stats";
import { toMapStats } from "./demo-stats";
import { resolveMapSource } from "./map-source";

const real: Geo = {
  available: true,
  countries: [
    {
      value: "ألبانيا",
      code: "AL",
      total: 12,
      sponsored: 5,
      small: false,
      gap: 300,
      currency: "EUR",
      delivered: null,
      regions: [],
    },
  ],
};

/** كلّ رقمٍ تعرضه الخريطة، لا الرمز وحده. */
const numbersOf = (geo: Geo) => Object.values(toMapStats(geo)).map((s) => s.total);

describe("مصدر الخريطة خارج وضع العرض (ARC-11/PRD-15)", () => {
  const live = { demoMode: false };

  it("أثناء التحميل: لا أرقام ولا دول — هيكلٌ فقط", () => {
    const r = resolveMapSource(undefined, { ...live, failed: false });
    expect(r.status).toBe("loading");
    expect(r.geo.countries).toEqual([]);
    expect(numbersOf(r.geo)).toEqual([]);
  });

  it("عند تعذّر القاعدة: «غير متاحة» بلا أيّ رقمٍ مختلَق", () => {
    for (const r of [
      resolveMapSource({ available: false, countries: [] }, { ...live, failed: false }),
      resolveMapSource(undefined, { ...live, failed: true }),
    ]) {
      expect(r.status).toBe("unavailable");
      expect(r.geo.countries).toEqual([]);
      // لا اليمن ولا السودان ولا كوسوفو — ولا ألبانيا بـ٩٦.
      for (const code of ["YE", "SD", "XK", "AL"]) {
        expect(toMapStats(r.geo)[code]).toBeUndefined();
      }
    }
  });

  it("لا تُشحن أرقامٌ مختلَقة في الحزمة أصلاً", () => {
    // كانت `DEMO_GEO` (ألبانيا ٩٦، اليمن ٥٧، السودان ٤١) تُعرض عند كلّ تحميل.
    expect(Object.keys(demoStats)).not.toContain("DEMO_GEO");
  });

  it("الأرقام الحقيقية تُعرض كما هي", () => {
    const r = resolveMapSource(real, { ...live, failed: false });
    expect(r.status).toBe("ready");
    expect(numbersOf(r.geo)).toEqual([12]);
  });
});

describe("وضع العرض الصريح يبقى كما صُمّم", () => {
  it("بطاقات المكاتب التجريبية بشارتها، أيّاً كان حال القاعدة", () => {
    for (const data of [undefined, real, { available: false, countries: [] }]) {
      const r = resolveMapSource(data, { demoMode: true, failed: false });
      expect(r.status).toBe("demo");
      expect(r.geo.countries).toHaveLength(34);
    }
  });
});
