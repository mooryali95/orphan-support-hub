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
