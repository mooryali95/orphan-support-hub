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
    });
  });

  it("ما ليس رقماً «غير متاح» لا صفر", () => {
    expect(toPlatformStats(null)).toBeNull();
    expect(toPlatformStats({ total: 3 })).toBeNull();
    expect(
      toPlatformStats({ total: "x", fully_sponsored: 0, monthly_need: 0, monthly_funded: 0 }),
    ).toBeNull();
  });
});
