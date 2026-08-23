import { describe, expect, it } from "vitest";
import { sanitizeSearch } from "./orphans.functions";

/**
 * H3: مصطلح البحث يُدرج نصياً في تعبير PostgREST المنطقي
 * `display_name.ilike.%X%,city.ilike.%X%`، فأي فاصلة أو قوس أو نقطة تغيّر
 * بنية الفلتر. هذه الفحوص تمنع عودة الثغرة.
 */
describe("sanitizeSearch", () => {
  it("يزيل الفاصلة التي تفصل شروط PostgREST", () => {
    expect(sanitizeSearch("محمد,status.eq.draft")).not.toContain(",");
  });

  it("يزيل الأقواس التي تفتح مجموعة شروط", () => {
    const out = sanitizeSearch("a),or(status.eq.draft");
    expect(out).not.toContain("(");
    expect(out).not.toContain(")");
  });

  it("يزيل محارف البدل في LIKE فلا يتحكّم المستخدم بنمط المطابقة", () => {
    const out = sanitizeSearch("%_%");
    expect(out).not.toContain("%");
    expect(out).not.toContain("_");
  });

  it("يبقي النص العربي والمسافات سليمة", () => {
    expect(sanitizeSearch("  محمد   الرياض  ")).toBe("محمد الرياض");
  });

  it("يعيد نصاً فارغاً حين لا يبقى شيء صالح، فيُتخطّى الفلتر", () => {
    expect(sanitizeSearch(",,,()")).toBe("");
  });
});
