import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countAt, settle } from "./use-count-up";

describe("منحنى الاستقرار وعدّ الأرقام", () => {
  it("يبدأ من الصفر وينتهي عند الواحد", () => {
    expect(settle(0)).toBe(0);
    expect(settle(1)).toBe(1);
    expect(settle(-1)).toBe(0);
    expect(settle(2)).toBe(1);
  });

  it("يصعد دائماً ولا يتجاوز القيمة — لا ارتداد", () => {
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const v = settle(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
  });

  it("الرقم المعروض لا يتجاوز الهدف وينتهي عنده", () => {
    for (let i = 0; i <= 20; i++) expect(countAt(1284, i / 20)).toBeLessThanOrEqual(1284);
    expect(countAt(1284, 1)).toBe(1284);
    expect(countAt(0, 0.5)).toBe(0);
  });

  it("--ease-settle في motion.css هو المنحنى نفسه", () => {
    const css = readFileSync("src/styles/motion.css", "utf8");
    const body = /--ease-settle:\s*linear\(([^)]*)\)/.exec(css)?.[1] ?? "";
    const stops = [...body.matchAll(/([\d.]+)\s+([\d.]+)%/g)];
    expect(stops.length).toBeGreaterThan(8);
    for (const [, v, at] of stops) expect(Number(v)).toBeCloseTo(settle(Number(at) / 100), 2);
  });

  it("لا لون صريح في motion.css — الألوان من رموز الهوية", () => {
    const css = readFileSync("src/styles/motion.css", "utf8");
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|oklch\(|rgb\(/g) ?? []).toEqual([]);
  });
});
