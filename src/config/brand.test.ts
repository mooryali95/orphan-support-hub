import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import raw from "./brand.json";
import { BRAND, pageTitle } from "./brand";

/** كل ملفّات الكود تحت src، عدا مجلّد الإعداد نفسه والمولَّد آلياً. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return path.endsWith("config") ? [] : sources(path);
    return /\.(ts|tsx)$/.test(entry) && !entry.endsWith(".gen.ts") ? [path] : [];
  });
}

/** الشروح تذكر الاسم بحرّية؛ المقصود ما يُعرض أو يُرسَل. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

describe("اسم المنصّة — مصدرٌ واحد", () => {
  it("لا يُكتب الاسم حرفياً خارج src/config", () => {
    const offenders = sources("src").filter((file) =>
      codeOnly(readFileSync(file, "utf8")).includes(raw.name),
    );
    expect(offenders).toEqual([]);
  });

  it("الوصف والعناوين تُبنى من الاسم", () => {
    expect(BRAND.description).toContain(raw.name);
    expect(BRAND.description).not.toContain("{name}");
    expect(pageTitle("الدليل")).toBe(`الدليل — ${raw.name} — ${raw.slogan}`);
    expect(pageTitle("الدليل", false)).toBe(`الدليل — ${raw.name}`);
  });
});

describe("ألوان الهوية — مصدرٌ واحد", () => {
  const brandHex = new Set(
    [...Object.values(raw.colors.light), ...Object.values(raw.colors.dark)]
      .filter((v) => v.startsWith("#"))
      .map((v) => v.toUpperCase())
      // الأبيض والأسود ليسا هويّة.
      .filter((v) => v !== "#FFFFFF" && v !== "#000000"),
  );

  it("لا يُكتب لونٌ من الهوية حرفياً خارج src/config", () => {
    const offenders = sources("src").filter((file) =>
      (codeOnly(readFileSync(file, "utf8")).match(/#[0-9a-fA-F]{6}\b/g) ?? []).some((hex) =>
        brandHex.has(hex.toUpperCase()),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("لا لون صريح في styles.css — الألوان تأتي من brand.json", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|oklch\(\s*[\d.]/g) ?? []).toEqual([]);
  });

  it("الوضعان يعرّفان المفاتيح نفسها", () => {
    expect(Object.keys(raw.colors.dark).sort()).toEqual(Object.keys(raw.colors.light).sort());
  });
});
