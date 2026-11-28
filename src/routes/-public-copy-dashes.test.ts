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
  "developers.tsx",
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

// الصفحات القانونية تكتب نصّها في JSX بمكوّنين (عربي وإنجليزي) لا في defineCopy:
// يُفحص كل سطرٍ ليس تعليقاً، ويُقارن عدد الأقسام بين اللغتين فلا تسقط فقرة من إحداهما.
const LEGAL = ["legal.faq.tsx", "legal.privacy.tsx", "legal.terms.tsx"];

function proseLines(src: string): string[] {
  return src
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\/?\*|\{\/\*)/.test(l))
    .map((l) => l.replace(/\{\/\*.*?\*\/\}/g, "").replace(/\/\/.*$/, ""));
}

function sectionsOf(src: string, fn: string): number {
  const at = src.indexOf(`function ${fn}(`);
  if (at === -1) return -1;
  const next = src.indexOf("\nfunction ", at + 1);
  return (src.slice(at, next === -1 ? undefined : next).match(/<Section\b/g) ?? []).length;
}

describe("legal pages: no prose dashes in JSX, and ar/en parity", () => {
  for (const f of LEGAL) {
    const src = readFileSync(join(__dirname, f), "utf8");
    it(`${f} has no prose dashes`, () => {
      const bad = proseLines(src).filter((l) => l.includes(" — ") || l.includes(" – "));
      expect(bad).toEqual([]);
    });
    it(`${f} has the same sections in ar and en`, () => {
      const base = f.replace(/^legal\.|\.tsx$/g, "");
      const name = base[0]!.toUpperCase() + base.slice(1);
      const ar = sectionsOf(src, `${name}Ar`);
      const en = sectionsOf(src, `${name}En`);
      expect(ar).toBeGreaterThan(0);
      expect(en).toBe(ar);
    });
  }
});
