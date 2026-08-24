import { describe, expect, it } from "vitest";

import { fundingPercent } from "./format";

/**
 * قواعد عرض الفائض (M5).
 *
 * الفائض قيمة مستقلّة لا امتداد للنسبة: شريط عند 140٪ يُقرأ عطلاً لا
 * كرماً. هذه الاختبارات تحرس الفصل بينهما.
 */

const surplusOf = (need: number, funded: number) => Math.max(0, funded - need);
const gapOf = (need: number, funded: number) => Math.max(0, need - funded);

describe("فصل الفائض عن النسبة", () => {
  it("النسبة تُسقَف عند مئة مهما زاد التمويل", () => {
    expect(fundingPercent(100, 250)).toBe(100);
    expect(fundingPercent(100, 100)).toBe(100);
  });

  it("الفائض يحمل الزيادة التي أسقطتها النسبة", () => {
    // 250 على احتياج 100: النسبة 100٪ والفائض 150 — لا 250٪.
    expect(surplusOf(100, 250)).toBe(150);
  });

  it("لا فائض ولا فجوة عند التطابق التامّ", () => {
    expect(surplusOf(180, 180)).toBe(0);
    expect(gapOf(180, 180)).toBe(0);
  });

  it("لا يجتمع فائض وفجوة أبداً", () => {
    for (const [need, funded] of [
      [100, 40],
      [100, 100],
      [100, 260],
      [0, 50],
    ]) {
      const s = surplusOf(need!, funded!);
      const g = gapOf(need!, funded!);
      expect(s === 0 || g === 0).toBe(true);
    }
  });

  it("لا فائض سالب عند نقص التمويل", () => {
    expect(surplusOf(200, 50)).toBe(0);
  });

  // احتياج صفر مع تمويل: كل المبلغ فائض، ولا قسمة على صفر.
  it("يتعامل مع احتياج صفر بلا انفجار", () => {
    expect(fundingPercent(0, 90)).toBe(0);
    expect(surplusOf(0, 90)).toBe(90);
  });
});
