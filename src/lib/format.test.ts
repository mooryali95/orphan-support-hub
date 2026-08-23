import { describe, expect, it } from "vitest";
import { ageFromBirthDate, formatDate, fundingPercent } from "./format";

describe("fundingPercent", () => {
  it("يحسب نسبة التغطية", () => {
    expect(fundingPercent(200, 50)).toBe(25);
  });

  // الاحتياج صفر يعني قسمة على صفر — والصفر قيمة افتراضية في المخطّط
  it("يعيد صفراً حين لا احتياج معرّفاً بدل NaN أو Infinity", () => {
    expect(fundingPercent(0, 100)).toBe(0);
  });

  // التمويل الزائد وارد: لا شيء يمنع كافلين من تجاوز الاحتياج (M5)
  it("يحدّ السقف عند 100 مهما زاد التمويل", () => {
    expect(fundingPercent(100, 250)).toBe(100);
  });

  it("يقبل النصوص كما تصل من postgres numeric", () => {
    expect(fundingPercent("120.00", "60.00")).toBe(50);
  });
});

describe("ageFromBirthDate", () => {
  it("يعيد null حين لا تاريخ", () => {
    expect(ageFromBirthDate(null)).toBeNull();
    expect(ageFromBirthDate(undefined)).toBeNull();
  });

  it("يعيد null لتاريخ غير صالح بدل NaN معروضاً للكافل", () => {
    expect(ageFromBirthDate("ليس تاريخاً")).toBeNull();
  });

  it("يحسب عمراً موجباً لتاريخ ماضٍ", () => {
    const age = ageFromBirthDate("2015-01-01");
    expect(age).not.toBeNull();
    expect(age!).toBeGreaterThan(0);
  });
});

describe("formatDate", () => {
  it("يعيد شرطة للقيم الفارغة أو غير الصالحة", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate("nope")).toBe("—");
  });
});
