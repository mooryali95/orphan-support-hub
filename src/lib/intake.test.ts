import { describe, expect, it } from "vitest";

import {
  documentStoragePath,
  missingRequiredDocs,
  REQUIRED_DOCS,
  unverifiedRequiredDocs,
} from "./intake.functions";

const ORPHAN = "11111111-1111-4111-8111-111111111111";

describe("documentStoragePath", () => {
  // العزلة في سياسة التخزين تقوم على أن المجلّد الأول هو معرّف اليتيم،
  // فأي شرطة مائلة تنجو من التطهير تُنشئ مجلّداً آخر وتكسر العزلة.
  it("يضع الملف في مجلّد اليتيم", () => {
    const p = documentStoragePath(ORPHAN, "orphan_id", "hoya.pdf", 1750000000000);
    expect(p.startsWith(ORPHAN + "/")).toBe(true);
    expect(p.split("/")).toHaveLength(2);
  });

  it("يمنع الهروب من المجلّد بالشرطة المائلة", () => {
    const p = documentStoragePath(ORPHAN, "other", "../../secrets/key.pem", 1);
    expect(p.split("/")[0]).toBe(ORPHAN);
    expect(p.split("/")).toHaveLength(2);
    expect(p).not.toContain("..");
  });

  it("يمنع المسار المطلق", () => {
    const p = documentStoragePath(ORPHAN, "other", "/etc/passwd", 1);
    expect(p.split("/")).toHaveLength(2);
  });

  it("يزيل الفراغات ومحارف التحكّم", () => {
    const p = documentStoragePath(ORPHAN, "other", "a b" + String.fromCharCode(10) + "c.pdf", 1);
    expect(p).not.toContain(" ");
    expect(p).not.toContain(String.fromCharCode(10));
  });

  it("يُبقي الحروف العربية كما هي", () => {
    const p = documentStoragePath(ORPHAN, "other", "شهادة.pdf", 1);
    expect(p).toContain("شهادة.pdf");
  });

  it("يحدّ طول الاسم فلا ينفجر المسار", () => {
    const p = documentStoragePath(ORPHAN, "other", "x".repeat(500), 1);
    expect(p.length).toBeLessThan(ORPHAN.length + 160);
  });
});

describe("missingRequiredDocs", () => {
  it("يعدّ الإلزاميات ناقصة حين لا شيء مرفوع", () => {
    expect(missingRequiredDocs([])).toEqual([...REQUIRED_DOCS]);
  });

  it("يعيد فارغاً حين تكتمل الإلزاميات", () => {
    expect(missingRequiredDocs([...REQUIRED_DOCS, "other"])).toEqual([]);
  });

  // وثائق اختيارية كثيرة لا تُغني عن إلزامية واحدة.
  it("لا تُغني الوثائق الاختيارية عن الإلزامية", () => {
    expect(missingRequiredDocs(["school_record", "medical_report", "orphan_id"])).toEqual([
      ...REQUIRED_DOCS,
    ]);
  });
});

// شرط النشر في القاعدة (`review_orphan`): كلّ وثيقةٍ إلزامية **موثَّقة**.
// وزرّ الاعتماد يُبنى على المرآة نفسها، فلا يَعِد بما ترفضه القاعدة.
describe("unverifiedRequiredDocs", () => {
  it("المرفوعة غير الموثَّقة لا تكفي للنشر", () => {
    expect(
      unverifiedRequiredDocs([
        { kind: "death_certificate", verified: false },
        { kind: "guardianship_proof", verified: false },
      ]),
    ).toEqual([...REQUIRED_DOCS]);
  });

  it("يكفي موثَّقٌ واحد من كلّ نوعٍ إلزامي ولو بجانبه نسخةٌ غير موثَّقة", () => {
    expect(
      unverifiedRequiredDocs([
        { kind: "death_certificate", verified: false },
        { kind: "death_certificate", verified: true },
        { kind: "guardianship_proof", verified: true },
      ]),
    ).toEqual([]);
  });

  it("وثيقةٌ اختيارية موثَّقة لا تُغني عن إلزاميةٍ ناقصة", () => {
    expect(
      unverifiedRequiredDocs([
        { kind: "death_certificate", verified: true },
        { kind: "orphan_id", verified: true },
      ]),
    ).toEqual(["guardianship_proof"]);
  });
});
