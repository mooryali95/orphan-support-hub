import { describe, expect, it } from "vitest";

import { FX_SEED } from "./currency";
import {
  amountAfterSwitch,
  canPayIn,
  demoPayOptions,
  needOnly,
  parsePayOptions,
  presetKeyOf,
  presetsIn,
  quoteFor,
  unitInNeed,
} from "./pay-options";

const ROWS = [
  { currency: "EUR", kind: "operating" },
  {
    currency: "USD",
    kind: "unified",
    pair: "EUR/USD",
    rate: 1.08,
    as_of: "2026-11-21",
    source: "seed:indicative",
    indicative: true,
  },
];

describe("خيارات الدفع من القاعدة", () => {
  it("عملة الحاجة أولاً ثم الموحّدة بسعرها", () => {
    const o = parsePayOptions(ROWS, "EUR");
    expect(o.options).toEqual([
      { currency: "EUR", kind: "operating" },
      { currency: "USD", kind: "unified" },
    ]);
    expect(o.rates).toEqual([FX_SEED[0]]);
    expect(quoteFor(o, 54, "USD")?.credited).toEqual({ amount: 50, currency: "EUR" });
    expect(quoteFor(o, 54, "EUR")?.fx).toBeNull();
    expect(quoteFor(o, 54, "GBP")).toBeNull();
  });
  it("ردٌّ غير مفهوم أو غائب ⇒ عملة الحاجة وحدها", () => {
    expect(parsePayOptions(null, "EUR")).toEqual(needOnly("EUR"));
    expect(parsePayOptions("x", "EUR")).toEqual(needOnly("EUR"));
    expect(parsePayOptions([], "EUR")).toEqual(needOnly("EUR"));
    // rows without the need currency cannot be trusted
    expect(parsePayOptions([ROWS[1]], "EUR")).toEqual(needOnly("EUR"));
  });
  it("عملةٌ بلا سعرٍ صالح لا تُعرض", () => {
    for (const bad of [
      { ...ROWS[1], rate: 0 },
      { ...ROWS[1], rate: "abc" },
      { ...ROWS[1], pair: "EUR-USD" },
      { ...ROWS[1], pair: "EUR/GBP" },
      { ...ROWS[1], as_of: "yesterday" },
      { ...ROWS[1], kind: "other" },
      { ...ROWS[1], currency: "usd" },
    ]) {
      const o = parsePayOptions([ROWS[0], bad], "EUR");
      expect(o.options.map((x) => x.currency)).toEqual(["EUR"]);
      expect(canPayIn(o, "USD")).toBe(false);
    }
  });
  it("سعرٌ بلا وسمٍ يُعدّ استرشادياً", () => {
    const { indicative: _drop, ...row } = ROWS[1]!;
    expect(parsePayOptions([ROWS[0], row], "EUR").rates[0]!.indicative).toBe(true);
    expect(
      parsePayOptions([ROWS[0], { ...row, indicative: false }], "EUR").rates[0]!.indicative,
    ).toBe(false);
  });
  it("التكرار يُهمل", () => {
    const o = parsePayOptions([...ROWS, ROWS[1]], "EUR");
    expect(o.options).toHaveLength(2);
    expect(o.rates).toHaveLength(1);
  });
});

describe("خيارات التجربة", () => {
  it("طفلٌ في أوروبا: اليورو ثم الموحّدة", () => {
    const o = demoPayOptions("AL", "EUR");
    expect(o.options).toEqual([
      { currency: "EUR", kind: "operating" },
      { currency: "USD", kind: "unified" },
    ]);
  });
  it("طفلٌ في أفريقيا حاجته باليورو: عملة الملف ثم الدولار (تشغيل بلده)", () => {
    const o = demoPayOptions("SN", "EUR");
    expect(o.options).toEqual([
      { currency: "EUR", kind: "need" },
      { currency: "USD", kind: "operating" },
    ]);
  });
});

describe("المقترحات وتبديل العملة", () => {
  const o = demoPayOptions("AL", "EUR");
  it("بعملة الحاجة كما كانت", () => {
    expect(presetsIn(o, "EUR", 120, 80)).toEqual({ gap: 80, amounts: [30, 60] });
  });
  it("بالموحّدة: المتبقّي يسدّ الفجوة، والكسور لطيفة بعملتها", () => {
    const p = presetsIn(o, "USD", 120, 80);
    expect(p.gap).toBe(87);
    expect(quoteFor(o, p.gap!, "USD")!.credited.amount).toBeGreaterThanOrEqual(80);
    for (const v of p.amounts) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeLessThanOrEqual(87);
    }
  });
  it("حاجةٌ مكتملة: لا «متبقّي»", () => {
    expect(presetsIn(o, "USD", 120, 0).gap).toBeNull();
  });
  it("ما كتبه الداعم يبقى، وما اختاره من المقترحات يُعاد اختياره", () => {
    const eur = presetsIn(o, "EUR", 120, 80);
    const usd = presetsIn(o, "USD", 120, 80);
    expect(presetKeyOf(eur, 80)).toBe("gap");
    expect(presetKeyOf(eur, 30)).toBe(0);
    expect(presetKeyOf(eur, 45)).toBeNull();
    // «المتبقّي كاملاً» round-trips exactly
    expect(amountAfterSwitch("gap", "80", usd)).toBe("87");
    expect(amountAfterSwitch(presetKeyOf(usd, 87), "87", eur)).toBe("80");
    // a typed amount is never rewritten
    expect(amountAfterSwitch(null, "45", usd)).toBe("45");
    expect(amountAfterSwitch(null, "", usd)).toBe("");
    // a preset with no counterpart keeps the number
    expect(amountAfterSwitch(5, "33", usd)).toBe("33");
  });
  it("وحدة الدفع بعملة الحاجة: هامش التقريب", () => {
    expect(unitInNeed(o, "EUR")).toBe(1);
    expect(unitInNeed(o, "USD")).toBe(0.92);
    expect(unitInNeed(o, "GBP")).toBe(1);
  });
});
