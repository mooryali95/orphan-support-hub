import { describe, expect, it } from "vitest";

import { monthState, type LedgerMonth } from "./ledger.functions";
import { pledgeError } from "./support.functions";

const base: LedgerMonth = {
  month: "2026-10",
  upcoming: false,
  due: 40,
  paid: 0,
  payment_status: null,
  delivery_status: null,
  delivered_at: null,
};

describe("حالة شهر الكفالة", () => {
  it("القادم قادمٌ مهما كان غيره", () => {
    expect(monthState({ ...base, upcoming: true, paid: 40 }).tone).toBe("wait");
  });
  it("الوصول الموثّق يتقدّم على الدفع", () => {
    expect(monthState({ ...base, paid: 40, delivery_status: "delivered" }).label).toContain("وصل");
  });
  it("المحوَّل بانتظار تأكيد الوصول", () => {
    expect(monthState({ ...base, paid: 40, delivery_status: "transferred" }).tone).toBe("progress");
  });
  it("المدفوع بلا تحويل", () => {
    expect(monthState({ ...base, paid: 40 }).label).toContain("دُفع");
  });
  it("الفشل يُذكر ولا يُخفى", () => {
    expect(monthState({ ...base, payment_status: "failed" }).tone).toBe("issue");
  });
  it("لا شيء بعد: بانتظار الدفع", () => {
    expect(monthState(base).label).toBe("بانتظار الدفع");
  });
});

describe("رسائل أخطاء الدعم", () => {
  it("تترجم رموز القاعدة إلى جملٍ مفهومة", () => {
    expect(pledgeError("country_not_active")).toContain("لم يُفتح");
    expect(pledgeError("target_not_found")).toContain("غير متاح");
    expect(pledgeError("something else")).toContain("تعذّر");
  });
});
