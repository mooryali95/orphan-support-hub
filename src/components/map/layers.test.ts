import { describe, expect, it } from "vitest";
import type { GeoCount } from "@/lib/geo";
import { intensityOf, metricOf, metricText, parseLayer, rankOf } from "./layers";

const full: GeoCount = {
  total: 20,
  sponsored: 8,
  small: false,
  gap: 480,
  currency: "USD",
  delivered: 6,
};
const noSplit: GeoCount = {
  total: 9,
  sponsored: null,
  small: false,
  gap: 120,
  currency: "EUR",
  delivered: null,
};
const small: GeoCount = {
  total: null,
  sponsored: null,
  small: true,
  gap: null,
  currency: null,
  delivered: null,
};

describe("طبقات الخارطة", () => {
  it("الرابط: الطبقات المعروفة فقط", () => {
    expect(parseLayer("gap")).toBe("gap");
    expect(parseLayer("ops")).toBeUndefined();
    expect(parseLayer(3)).toBeUndefined();
  });

  it("القيمة بحسب الطبقة، والمحجوب null", () => {
    expect(metricOf("waiting", full)).toBe(12);
    expect(metricOf("impact", full)).toBe(40);
    expect(metricOf("gap", full)).toBe(480);
    // تقسيمٌ محجوب: «ينتظرون» يعرض العدد كلّه، و«الأثر» لا يعرض شيئاً.
    expect(metricOf("waiting", noSplit)).toBe(9);
    expect(metricOf("impact", noSplit)).toBeNull();
    expect(metricOf("gap", small)).toBeNull();
    expect(metricOf("waiting", undefined)).toBeNull();
  });

  it("الترتيب والكثافة لا يكشفان المحجوب", () => {
    expect(rankOf("gap", small)).toBe(-1);
    expect(intensityOf(null, 100)).toBeCloseTo(0.35);
    expect(intensityOf(100, 100)).toBeCloseTo(0.95);
    expect(intensityOf(0, 100)).toBeCloseTo(0.35);
  });

  it("النصّ: عددٌ أو نسبةٌ أو مبلغٌ بعملته، والمحجوب بنصّه", () => {
    expect(metricText("waiting", full, "en", "few")).toBe("12");
    expect(metricText("impact", full, "en", "few")).toBe("40%");
    expect(metricText("gap", noSplit, "en", "few")).toContain("120");
    expect(metricText("gap", noSplit, "en", "few")).toContain("€");
    expect(metricText("impact", noSplit, "en", "few")).toBe("few");
  });
});
