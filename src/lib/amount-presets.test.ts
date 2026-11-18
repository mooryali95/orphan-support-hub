import { describe, expect, it } from "vitest";

import { amountPresets, niceRound } from "./amount-presets";

describe("المبالغ المقترحة من الحاجة", () => {
  it("تقريبٌ لطيف بحسب الحجم", () => {
    expect(niceRound(27)).toBe(25);
    expect(niceRound(133)).toBe(130);
    expect(niceRound(740)).toBe(750);
    expect(niceRound(2260)).toBe(2300);
    expect(niceRound(0)).toBe(0);
  });
  it("ربع الحاجة ونصفها وكاملها، بلا تكرار ولا المتبقّي نفسه", () => {
    expect(amountPresets(120, 60)).toEqual([30, 120]);
    expect(amountPresets(3000, 0)).toEqual([750, 1500, 3000]);
    expect(amountPresets(0, 0)).toEqual([25, 50, 100]);
  });
});
