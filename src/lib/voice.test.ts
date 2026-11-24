/**
 * الصوت المؤسسي (docs/institutional-voice.ar.md): مفهومٌ واحد = اسمٌ واحد. يقفل هذا الاختبار
 * المعجمَ المعتمد على فهرس النصوص كلّه، فلا يعود مصطلحٌ مرفوض في نصٍّ جديد.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Entry = { ar?: string; en?: string };
const entries = Object.entries(
  (JSON.parse(readFileSync("src/i18n/catalog.json", "utf8")) as { entries: Record<string, Entry> })
    .entries,
);

const offenders = (lang: "ar" | "en", rx: RegExp, allow: RegExp = /$^/) =>
  entries
    .filter(([key, e]) => rx.test(e[lang] ?? "") && !allow.test(e[lang] ?? "") && key)
    .map(([key, e]) => `${key}: ${e[lang]}`);

describe("المعجم الموحَّد", () => {
  it("«تجريبي» للوضع و«نموذجي» للبيانات — لا «افتراضي»", () => {
    expect(offenders("ar", /افتراضي/)).toEqual([]);
  });

  it("«الداعم» و«الكافل» — لا «متبرّع»", () => {
    // the one deliberate contrast on the home page: «الكافل شريكٌ في نظام، لا متبرّعٌ في صندوق»
    expect(offenders("ar", /متبرّع|متبرع/, /لا متبرّعٌ في صندوق/)).toEqual([]);
  });

  it("«الجهة الميدانية» — لا «جهة الرعاية»", () => {
    expect(offenders("ar", /جهة الرعاية|جهات الرعاية|جهة رعاية/)).toEqual([]);
  });

  it("زرّ الفعل العامّ «اكفل يتيماً» — لا «اكفل طفلاً»", () => {
    expect(offenders("ar", /اكفل طفلاً/)).toEqual([]);
  });

  it("الرسم: «منصّة» بالشدّة", () => {
    expect(offenders("ar", /منصة/)).toEqual([]);
  });

  it("English: supporter or sponsor, not donor (donor entities are a different concept)", () => {
    expect(offenders("en", /\bdonors?\b/i, /donor entit|donor to a fund/i)).toEqual([]);
  });

  it("English: demo mode and sample data, not virtual", () => {
    expect(offenders("en", /\bvirtual\b/i)).toEqual([]);
  });
});
