import { describe, expect, it } from "vitest";
import { toPlatformStats } from "./orphans.functions";

describe("أرقام الصفحة الأولى من تجميع القاعدة", () => {
  it("يقرأ المجاميع الرقمية والنصّية (NUMERIC يصل نصّاً أحياناً)", () => {
    expect(
      toPlatformStats({
        total: 1250,
        fully_sponsored: 40,
        monthly_need: "137500.00",
        monthly_funded: 52000,
      }),
    ).toEqual({
      totalOrphans: 1250,
      fullySponsored: 40,
      monthlyNeed: 137500,
      monthlyFunded: 52000,
      byCurrency: [],
    });
  });

  // UX-07: «$ 750 / $ 2,750» لملفاتٍ كلّها باليورو.
  it("يقرأ المجاميع لكلّ عملة ولا يجمعها", () => {
    const s = toPlatformStats({
      total: 3,
      fully_sponsored: 0,
      monthly_need: 900,
      monthly_funded: 200,
      by_currency: [
        { currency: "EUR", monthly_need: "600.00", monthly_funded: 150 },
        { currency: "USD", monthly_need: 300, monthly_funded: 50 },
        { currency: "bad!", monthly_need: 1, monthly_funded: 1 },
      ],
    });
    expect(s?.byCurrency).toEqual([
      { currency: "EUR", monthlyNeed: 600, monthlyFunded: 150 },
      { currency: "USD", monthlyNeed: 300, monthlyFunded: 50 },
    ]);
  });

  it("ما ليس رقماً «غير متاح» لا صفر", () => {
    expect(toPlatformStats(null)).toBeNull();
    expect(toPlatformStats({ total: 3 })).toBeNull();
    expect(
      toPlatformStats({ total: "x", fully_sponsored: 0, monthly_need: 0, monthly_funded: 0 }),
    ).toBeNull();
  });
});
