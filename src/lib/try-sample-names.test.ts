import { describe, expect, it } from "vitest";

import { sampleNameEn } from "@/lib/try-verification";

describe("أسماء العيّنة في الواجهة الإنجليزية", () => {
  it("يترجم الاسم المستعار ووسمه", () => {
    expect(sampleNameEn("سلمى (نموذج)")).toBe("Salma (sample)");
    expect(sampleNameEn("يوسف (نموذج)")).toBe("Yusuf (sample)");
  });
  it("لا يمسّ نصّاً غير اسم عيّنة", () => {
    expect(sampleNameEn("سريلانكا")).toBe("سريلانكا");
    expect(sampleNameEn("DEMO-LK-101")).toBe("DEMO-LK-101");
  });
});
