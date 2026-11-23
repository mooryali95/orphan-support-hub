/**
 * one sample amount reads as one currency everywhere. A payment simulated in the concept hall
 * (`/hall?live=1`) is written to the /vision session engine as the same number, so /vision may
 * not format money with a currency of its own: every amount goes through the shared formatter
 * (`@/lib/format`, `@/lib/currency`) in the engine's currency, which is the platform's unified
 * one, the hall's. These tests fail when a /vision file writes a currency by hand.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { UNIFIED_CURRENCY } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import { payEngine } from "@/lib/hall/engine-bridge";
import { hallLive } from "@/lib/hall/live";
import { TRACKS } from "@/lib/hall/model";
import {
  COST_PER_ORPHAN,
  KIT_PRICE,
  OFFICE_CURRENCY,
  OFFICE_RATE,
  seed,
  VISION_CURRENCY,
} from "@/lib/vision-engine";

const SRC = resolve(__dirname, "..");
const ls = (dir: string, re: RegExp) =>
  readdirSync(join(SRC, dir))
    .filter((f) => re.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => `${dir}/${f}`);

/** every file that draws or computes a /vision amount, and the hall's bridge into the engine */
const FILES = [
  ...ls("routes", /^vision[.\w$-]*\.tsx$/),
  ...ls("components/vision", /\.tsx?$/),
  ...ls("lib", /^vision[\w.-]*\.ts$/),
  "data/vision-demo.ts",
  "lib/hall/engine-bridge.ts",
];

/** code without its comments: a comment may explain with an example and is shown to no one */
const code = (path: string) =>
  readFileSync(join(SRC, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

describe("منصة الرؤية: عملةٌ واحدة عبر المنسّق المشترك", () => {
  it("عملة المحرّك هي عملة المنصّة الموحّدة، عملة القاعة", () => {
    expect(VISION_CURRENCY).toBe(UNIFIED_CURRENCY);
    for (const locale of ["ar", "en"]) {
      const kit = hallLive(locale);
      expect(kit.currency).toBe(VISION_CURRENCY);
      expect(kit.money(5000)).toBe(formatMoney(5000, VISION_CURRENCY, locale));
    }
  });

  it("دفعة القاعة تُقيَّد في المحرّك بالرقم نفسه، فتُقرأ بالعملة نفسها", () => {
    const s = payEngine(seed(), {
      track: "qualify",
      amount: 5000,
      kids: 8,
      city: "tirana",
      donor: "test",
      at: 1_700_000_000_000,
    });
    const d = s.donations.at(-1)!;
    expect(d.amount).toBe(5000);
    // the page's `useMoney` and the hall's `money` are the same call for the same number
    expect(formatMoney(d.amount, VISION_CURRENCY, "ar")).toBe(hallLive("ar").money(5000));
    expect(formatMoney(d.amount, VISION_CURRENCY, "en")).toBe("⁨$5,000⁩");
  });

  it("أسعار الوحدة النموذجية واحدة في القاعة والمحرّك", () => {
    expect(TRACKS.qualify.unit).toBe(COST_PER_ORPHAN);
    expect(TRACKS.kiswa.unit).toBe(KIT_PRICE);
    // the office is disbursed in its own currency at the platform's seed rate, not a private one
    expect(OFFICE_CURRENCY).toBe("EUR");
    expect(OFFICE_RATE).toBeGreaterThan(0.5);
    expect(OFFICE_RATE).toBeLessThan(1.5);
  });

  it("`useMoney` يكتب بالمنسّق المشترك وبعملة المحرّك", () => {
    const store = code("components/vision/VisionStore.tsx");
    expect(store).toContain("formatMoney(n, VISION_CURRENCY, locale)");
    expect(store).toContain("formatMoney(n, OFFICE_CURRENCY, locale)");
  });

  it("لا عملة مكتوبة باليد في ملفّات منصة الرؤية", () => {
    expect(FILES.length).toBeGreaterThan(15);
    for (const path of FILES) {
      const text = code(path);
      // no riyal left, in words, symbol or code
      expect(text, path).not.toMatch(/ر\.س|ريال|riyal|\bSAR\b/i);
      // no symbol or ISO code glued to an amount by hand
      expect(text, path).not.toMatch(/[€£]|US\$|\$\s?\d|\d\s?\$(?![{/)])/);
      expect(text, path).not.toMatch(/["'`](USD|EUR|GBP|AED|TRY)["'`]/);
      // no private currency formatter: `formatMoney` / `formatMoneyExact` only
      expect(text, path).not.toMatch(/style:\s*["']currency["']|currencyDisplay/);
    }
  });

  it("كلّ ملفٍّ يعرض مبلغاً يأخذه من `useMoney` أو المنسّق المشترك", () => {
    for (const path of FILES.filter((p) => p.endsWith(".tsx"))) {
      const text = code(path);
      if (!/\bmoney\(/.test(text)) continue;
      expect(text, path).toMatch(/useMoney\(\)|formatMoney(Exact)?\(/);
    }
  });
});
