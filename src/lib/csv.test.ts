import { describe, expect, it } from "vitest";

import { toCsv } from "./csv";

describe("تصدير CSV للإدارة", () => {
  it("يبدأ بـBOM ويحمل الأعمدة من اتّحاد المفاتيح", () => {
    const csv = toCsv([
      { code: "A-1", amount: 50 },
      { code: "A-2", note: "ملاحظة" },
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual(["code,amount,note", "A-1,50,", "A-2,,ملاحظة", ""]);
  });

  it("يقتبس الفواصل وعلامات التنصيص والأسطر", () => {
    const csv = toCsv([{ v: 'قال "نعم", ثم\nمضى' }]);
    expect(csv).toContain('"قال ""نعم"", ثم\nمضى"');
  });

  it("لا يترك خليةً تُنفَّذ صيغةً في Excel", () => {
    const csv = toCsv([{ a: '=HYPERLINK("http://x")', b: "+1", c: "-2", d: "@SUM(A1)" }]);
    const row = csv.slice(1).split("\r\n")[1]!;
    expect(row).toBe(`"'=HYPERLINK(""http://x"")",'+1,'-2,'@SUM(A1)`);
  });

  it("القيم الفارغة خلايا فارغة", () => {
    expect(toCsv([{ a: null, b: undefined }]).slice(1)).toBe("a,b\r\n,\r\n");
  });
});
