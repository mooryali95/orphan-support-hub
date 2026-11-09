import { describe, expect, it } from "vitest";
import type { MapStats } from "@/components/map/demo-stats";
import { defaultAmount, gapOfTarget, suggestionsFor } from "./support-amounts";

const stats: MapStats = {
  AL: {
    value: "ألبانيا",
    total: 20,
    sponsored: 8,
    small: false,
    gap: 1100.5,
    currency: "USD",
    delivered: null,
    regions: {
      Tirana: {
        value: "Tirana",
        total: 8,
        sponsored: null,
        small: false,
        gap: 420,
        currency: "USD",
        delivered: null,
      },
      Kukës: {
        value: "Kukës",
        total: null,
        sponsored: null,
        small: true,
        gap: null,
        currency: null,
        delivered: null,
      },
    },
  },
};

describe("المبلغ المقترح من الفجوة", () => {
  it("الدولة والمنطقة من مصدر الجغرافيا، والمحجوب بلا اقتراح", () => {
    expect(gapOfTarget({ targetType: "country", target: "AL", country: "AL", stats })).toEqual({
      gap: 1101,
      currency: "USD",
    });
    expect(gapOfTarget({ targetType: "region", target: "tirana", country: "AL", stats })).toEqual({
      gap: 420,
      currency: "USD",
    });
    expect(gapOfTarget({ targetType: "region", target: "Kukës", country: "AL", stats })).toBeNull();
    expect(gapOfTarget({ targetType: "group", target: "x", country: "AL", stats })).toBeNull();
    expect(gapOfTarget({ targetType: "country", target: "YE", country: "YE", stats })).toBeNull();
  });

  it("الطفل من رابطه بعملته، وبلا فجوةٍ لا اقتراح", () => {
    expect(
      gapOfTarget({
        targetType: "orphan",
        target: "id",
        country: "",
        stats,
        orphanGap: 120,
        orphanCurrency: "USD",
      }),
    ).toEqual({ gap: 120, currency: "USD" });
    expect(gapOfTarget({ targetType: "orphan", target: "id", country: "", stats })).toBeNull();
  });

  it("ثلاث درجاتٍ بلا كسور، والبداية نصف الشهر", () => {
    expect(suggestionsFor(470)).toEqual([470, 235, 118]);
    expect(suggestionsFor(0.4)).toEqual([1, 1, 1]);
    expect(defaultAmount({ gap: 470, currency: "USD" }, 25)).toBe(235);
    expect(defaultAmount(null, 25)).toBe(25);
  });
});
