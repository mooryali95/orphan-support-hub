import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { formatDate, isolate } from "./format";
import { placeLabel } from "./locale";

const FSI = "⁨";
const PDI = "⁩";

describe("العزل ثنائي الاتجاه (UI-03)", () => {
  it("الاسم اللاتيني كتلةٌ معزولة فلا تنقلب نقطته في سطرٍ عربي", () => {
    expect(isolate("Arta S.")).toBe(`${FSI}Arta S.${PDI}`);
    expect(`ادعم ${isolate("Dorian M.")}`).toBe(`ادعم ${FSI}Dorian M.${PDI}`);
    expect(isolate(null)).toBe("");
  });

  it("التاريخ معزول كالمبلغ، والفارغ شرطة", () => {
    const d = formatDate("2026-11-02T10:00:00Z");
    expect(d.startsWith(FSI) && d.endsWith(PDI)).toBe(true);
    expect(formatDate(null)).toBe("—");
  });
});

describe("لا رموز نظامٍ للناس (UI-04)", () => {
  it("البلد المخزَّن رمزاً يُعرض باسمه بالعربية أيضاً", () => {
    const ar = placeLabel("AL", "Tirana", "ar");
    expect(ar).not.toMatch(/\bAL\b/);
    expect(ar).toContain("Tirana");
    expect(placeLabel("XK", null, "en")).toBe("Kosovo");
    // ما ليس رمزاً معروفاً يبقى كما كُتب.
    expect(placeLabel("ألبانيا", null, "ar")).toBe("ألبانيا");
  });
});

/**
 * قرار الأرقام واحد في الواجهة: لاتينية (format.ts يثبّتها). أيّ رقمٍ هندي
 * عربي في نصٍّ يُعرض يخلط النظامين في الصفحة نفسها (UI-18).
 */
describe("الأرقام ثابتة في الصفحة (UI-18)", () => {
  const ROOT = join(__dirname, "..");
  const ARABIC_INDIC = /[٠-٩۰-۹]/;
  // تطبيع الإدخال: يحوّل ما يكتبه المستخدم بالهندية إلى لاتينية.
  const ALLOWED = new Set(["components/auth/AuthPanel.tsx"]);

  function* files(dir: string): Generator<string> {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) yield* files(p);
      else if (/\.(tsx?|json)$/.test(name) && !name.includes(".test.")) yield p;
    }
  }

  it("لا أرقام هندية عربية في نصوص الواجهة", () => {
    const hits: string[] = [];
    for (const f of files(ROOT)) {
      const rel = relative(ROOT, f);
      if (ALLOWED.has(rel)) continue;
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const t = line.trim();
          if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
          if (ARABIC_INDIC.test(line)) hits.push(`${rel}:${i + 1}`);
        });
    }
    expect(hits).toEqual([]);
  });
});
