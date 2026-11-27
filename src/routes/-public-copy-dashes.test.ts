import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// قيم defineCopy فقط في صفحات المجموعة العامة؛ التعليقات خارج النطاق.
const FILES = [
  "__root.tsx",
  "index.tsx",
  "orphans.index.tsx",
  "orphans.$orphanId.tsx",
  "how-it-works.tsx",
  "organizations.tsx",
  "legal.faq.tsx",
  "legal.privacy.tsx",
  "legal.terms.tsx",
];

function copyStrings(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  while ((i = src.indexOf("defineCopy(", i)) !== -1) {
    // نهاية الاستدعاء بموازنة الأقواس.
    let depth = 0;
    let j = i + "defineCopy".length;
    for (; j < src.length; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")" && --depth === 0) break;
    }
    const body = src
      .slice(i, j)
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    for (const m of body.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
      out.push(m[1] ?? m[2] ?? "");
    }
    i = j;
  }
  return out;
}

describe("public copy uses no prose dashes", () => {
  for (const f of FILES) {
    it(f, () => {
      const src = readFileSync(join(__dirname, f), "utf8");
      const bad = copyStrings(src).filter((s) => s.includes(" — ") || s.includes(" – "));
      expect(bad).toEqual([]);
    });
  }
});
