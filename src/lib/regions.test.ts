import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { regionOptions, resolveRegion, type RegionShape } from "./regions";

const AL = (
  JSON.parse(readFileSync("public/geo/admin1/AL.json", "utf8")) as { regions: RegionShape[] }
).regions;

describe("مناطق الإدخال من ملفّ الخارطة نفسه (UX-10)", () => {
  it("القائمة تحمل اسم كلّ منطقةٍ كما ترسمه الخارطة", () => {
    const opts = regionOptions(AL);
    expect(opts).toHaveLength(AL.length);
    expect(opts.map((o) => o.value)).toContain("إشقودرة");
    expect(opts.find((o) => o.value === "تيرانا")?.label).toBe("تيرانا (Tirana)");
  });

  it("التهجئة الشائعة «شكودر» تُردّ إلى منطقة الخارطة ولا تسقط", () => {
    expect(resolveRegion("شكودر", AL)).toBe("إشقودرة");
    expect(resolveRegion("Shkodra", AL)).toBe("إشقودرة");
    expect(resolveRegion("دوريس", AL)).toBe("دوريس");
  });

  it("ما لا تعرفه الخارطة لا يُخمَّن", () => {
    expect(resolveRegion("مكانٌ ما", AL)).toBeNull();
    expect(resolveRegion("", AL)).toBeNull();
  });
});
