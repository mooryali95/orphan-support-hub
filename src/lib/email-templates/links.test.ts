import { describe, expect, it } from "vitest";

import { normalizeBase, resolveEmailLink, unsubscribeUrl } from "./links";

describe("روابط البريد", () => {
  it("المسار النسبي يصير مطلقاً", () => {
    expect(resolveEmailLink("https://ioco.test", "/dashboard")).toBe("https://ioco.test/dashboard");
  });

  it("الشرطة الزائدة في الأساس لا تُنتج شرطتين", () => {
    expect(resolveEmailLink("https://ioco.test/", "/dashboard")).toBe(
      "https://ioco.test/dashboard",
    );
    expect(normalizeBase("https://ioco.test///")).toBe("https://ioco.test");
  });

  it("مسارٌ بلا شرطة بادئة يُوصل صحيحاً", () => {
    expect(resolveEmailLink("https://ioco.test", "dashboard")).toBe("https://ioco.test/dashboard");
  });

  it("الرابط المطلق يبقى كما هو", () => {
    expect(resolveEmailLink("https://ioco.test", "https://pay.example/receipt/9")).toBe(
      "https://pay.example/receipt/9",
    );
  });

  it("غياب الرابط يقود إلى جذر المنصّة لا إلى رابط مكسور", () => {
    expect(resolveEmailLink("https://ioco.test", null)).toBe("https://ioco.test");
    expect(resolveEmailLink("https://ioco.test", "")).toBe("https://ioco.test");
    expect(resolveEmailLink("https://ioco.test", "   ")).toBe("https://ioco.test");
  });

  it("رمز الإلغاء يُرمَّز، فلا يكسر محارفُه سلسلة الاستعلام", () => {
    const url = unsubscribeUrl("https://ioco.test/", "a b&c=d");
    expect(url).toBe("https://ioco.test/unsubscribe?token=a%20b%26c%3Dd");
    // القراءة تعود بالقيمة الأصلية لا بالمشوّهة.
    expect(new URL(url).searchParams.get("token")).toBe("a b&c=d");
  });
});
