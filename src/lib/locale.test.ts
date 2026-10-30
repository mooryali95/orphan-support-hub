import { describe, expect, it } from "vitest";

import catalog from "@/i18n/catalog.json";
import { copyOf, defineCopy, dirOf, parseLocale, pluralOf, setMessages } from "./locale";
// @ts-expect-error — سكربت .mjs بلا أنواع
import { extract } from "../../scripts/i18n-extract.mjs";

const DEF = defineCopy("test/sample", {
  ar: {
    title: "العنوان",
    pageOf: (p: number, n: number) => `صفحة ${p} من ${n}`,
    files: (n: number) => `${n} ملف`,
    steps: ["أ", "ب"],
    nested: { a: "أ" },
  },
  en: {
    title: "Title",
    pageOf: (p: number, n: number) => `Page ${p} of ${n}`,
    files: pluralOf({ one: "{0} file", other: "{0} files" }),
    steps: ["A", "B"],
    nested: { a: "A" },
  },
});

describe("اللغات — الطبقة فوق الإنجليزية", () => {
  it("العربية والإنجليزية من الكود كما هي", () => {
    expect(copyOf(DEF, "ar").title).toBe("العنوان");
    expect(copyOf(DEF, "en").files(1)).toBe("1 file");
    expect(copyOf(DEF, "en").files(3)).toBe("3 files");
  });

  it("لغةٌ بلا ترجمات منشورة ترجع للإنجليزية لا للفراغ", () => {
    expect(copyOf(DEF, "fr").title).toBe("Title");
  });

  it("المنشور يُطبَّق بالمفاتيح، والقوالب بمواضعها، والناقص بالإنجليزية", () => {
    setMessages("sq", {
      "test/sample.title": "Titulli",
      "test/sample.pageOf": "Faqja {0} nga {1}",
      "test/sample.steps.1": "B-sq",
      "test/sample.files.one": "{0} dosje",
      "test/sample.files.other": "{0} dosje",
    });
    const c = copyOf(DEF, "sq");
    expect(c.title).toBe("Titulli");
    expect(c.pageOf(2, 5)).toBe("Faqja 2 nga 5");
    expect(c.steps).toEqual(["A", "B-sq"]);
    expect(c.nested.a).toBe("A");
    expect(c.files(4)).toBe("4 dosje");
  });

  it("الاتجاه من رمز اللغة، والكعكة تقبل أي رمز", () => {
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("ur")).toBe("rtl");
    expect(dirOf("sq")).toBe("ltr");
    expect(parseLocale("a=1; kh_lang=sq")).toBe("sq");
    expect(parseLocale("kh_lang=<script>")).toBe("ar");
  });
});

describe("فهرس النصوص", () => {
  it("مطابقٌ للكود — شغّل scripts/i18n-extract.mjs بعد تغيير أي نصّ", () => {
    expect(extract()).toEqual(catalog);
  });

  it("كل نصٍّ قابلٌ للترجمة (لا شروط داخل القوالب)", () => {
    expect(catalog.skipped).toEqual([]);
  });
});
