import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { jsonLdScript, serializeJsonLd } from "./json-ld";

const PAYLOAD = "Ali</script><script>window.__pwned=document.cookie</script>";

describe("JSON-LD مهرَّب (APP-01)", () => {
  it("اسمٌ يحمل </script> لا يُغلق الكتلة ولا يفتح سكربتاً", () => {
    const out = serializeJsonLd({ name: `كفالة ${PAYLOAD}` });
    expect(out).not.toMatch(/<\/?script/i);
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    // ويبقى JSON صالحاً بالقيمة نفسها حرفاً بحرف.
    expect(JSON.parse(out)).toEqual({ name: `كفالة ${PAYLOAD}` });
  });

  it("يهرّب & وفاصلي السطر والفقرة", () => {
    const value = { a: "x&amp;y", b: "سطر\u2028فقرة\u2029", c: "<!--" };
    const out = serializeJsonLd(value);
    expect(out).not.toMatch(/[&<>\u2028\u2029]/);
    expect(JSON.parse(out)).toEqual(value);
  });

  it("يُعطي عنصر سكربت بنوعه", () => {
    expect(jsonLdScript({ a: 1 })).toEqual({ type: "application/ld+json", children: '{"a":1}' });
  });
});

/**
 * حارس: لا مسار يضع JSON خاماً في <script> ولا يحقن HTML من بيانات.
 * الحالات المعروفة الآمنة (أنماط الهوية الثابتة، وأنماط الرسوم من إعدادٍ
 * في الكود) مسمّاةٌ بالاسم، وأيّ جديدٍ يُراجَع قبل أن يُضاف إليها.
 */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) && !name.endsWith(".gen.ts")
      ? [p]
      : [];
  });
}

describe("حارس الحقن في الصفحات", () => {
  const files = sources(join(__dirname, ".."));

  it("لا JSON.stringify خاماً في أبناء سكربت", () => {
    const offenders = files.filter((f) =>
      /children:\s*JSON\.stringify/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("dangerouslySetInnerHTML في المواضع المراجَعة وحدها", () => {
    const allowed = ["routes/__root.tsx", "components/ui/chart.tsx"];
    const offenders = files
      .filter((f) => readFileSync(f, "utf8").includes("dangerouslySetInnerHTML"))
      .map((f) => f.replace(/\\/g, "/").split("/src/")[1])
      .filter((f) => !allowed.includes(f!));
    expect(offenders).toEqual([]);
  });
});

describe("JSON-LD للمنصّة: لمن هي", () => {
  it("الناشر هو الجهة المالكة من brand.json، بالعربية والإنجليزية، بلا ادّعاء غير الملكية", async () => {
    const { siteJsonLd } = await import("./json-ld");
    const raw = JSON.parse(readFileSync("src/config/brand.json", "utf8"));
    const ar = siteJsonLd("ar");
    const en = siteJsonLd("en");
    expect(ar.publisher).toEqual({
      "@type": "Organization",
      name: raw.owner.name,
      alternateName: raw.owner.short,
    });
    expect(en.publisher.name).toBe(raw.owner.nameLatin);
    expect(ar.description.startsWith(raw.owner.line)).toBe(true);
    expect(en.description).toMatch(
      /^The World Assembly of Muslim Youth's orphan sponsorship platform\./,
    );
    expect(JSON.stringify([ar, en])).not.toMatch(/accredit|audit|معتمدة من|مدقَّق/i);
    expect(readFileSync("src/routes/__root.tsx", "utf8")).toContain("jsonLdScript(siteJsonLd(");
  });
});
