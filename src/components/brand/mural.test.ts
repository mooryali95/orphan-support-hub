import { describe, expect, it } from "vitest";
import { registerFor } from "./MuralImage";

/**
 * السجلّ البصري قاعدة أخلاقية لا خيار جمالي: ملف في حالة الاحتياج يُعرض
 * أحادي اللون وبلا وجه، حفظاً لكرامة الطفل كما يشترط دليل الهوية.
 * اشتقاقه من حالة الملف هو ما يمنع تجاوزه، فهذه الفحوص تحرس ذلك.
 */
describe("registerFor", () => {
  it("يختار السجلّ المؤلم لملف ما يزال بحاجة", () => {
    expect(registerFor("approved", 40)).toBe("need");
  });

  it("يختار سجلّ العمران للمكفول بالكامل", () => {
    expect(registerFor("fully_sponsored", 100)).toBe("omran");
  });

  // التمويل قد يبلغ 100% قبل أن يُحدّث المُشغِّل الحالة
  it("يختار سجلّ العمران عند اكتمال التغطية ولو لم تُحدّث الحالة بعد", () => {
    expect(registerFor("approved", 100)).toBe("omran");
  });

  it("يبقى على السجلّ المؤلم لحالة غير معروفة", () => {
    expect(registerFor("", 0)).toBe("need");
    expect(registerFor("draft", 0)).toBe("need");
  });
});
