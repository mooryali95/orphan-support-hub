import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { WAMY_COUNTRIES } from "@/data/wamy-network";
import { COUNTRY_CODES } from "@/lib/countries";

import {
  approxMoney,
  ceilUnit,
  COUNTRY_CURRENCY,
  findRate,
  floorCents,
  formatMoneyExact,
  formatRate,
  FX_SEED,
  isPayable,
  operatingCurrency,
  payableCurrencies,
  payableOptions,
  payAmountFor,
  quoteCharge,
  REGION_CURRENCY,
  UNIFIED_CURRENCY,
  type FxRate,
} from "./currency";

const RATES: FxRate[] = [
  { base: "EUR", quote: "USD", rate: 1.08, asOf: "2026-11-01", source: "test", indicative: true },
  { base: "EUR", quote: "USD", rate: 1.1, asOf: "2026-11-20", source: "test", indicative: false },
  { base: "USD", quote: "TRY", rate: 40, asOf: "2026-11-10", source: "test", indicative: true },
];

const strip = (s: string) => s.replace(/[\u2066-\u2069\u200e\u200f\u061c]/g, "");

describe("عملة تشغيل الدولة", () => {
  it("أوروبا باليورو، وأفريقيا وآسيا بالدولار", () => {
    for (const c of ["AL", "XK", "BA", "MK", "DE"]) expect(operatingCurrency(c)).toBe("EUR");
    for (const c of ["SN", "KE", "EG", "NG", "ID", "SA", "BR"]) {
      expect(operatingCurrency(c)).toBe("USD");
    }
  });
  it("الاستثناء يسبق القارة، والمجهول يأخذ الموحّدة", () => {
    expect(COUNTRY_CURRENCY["CY"]).toBe("EUR");
    expect(operatingCurrency("cy")).toBe("EUR");
    expect(operatingCurrency("ZZ")).toBe(UNIFIED_CURRENCY);
    expect(operatingCurrency(null)).toBe(UNIFIED_CURRENCY);
  });
  it("كل دول الشبكة لها عملة تشغيل من ثلاثة أحرف", () => {
    for (const c of WAMY_COUNTRIES) expect(operatingCurrency(c.code)).toMatch(/^[A-Z]{3}$/);
  });
});

describe("العملات التي يُدفع بها", () => {
  it("عملة التشغيل ثم الموحّدة، بلا تكرار", () => {
    expect(payableCurrencies("AL")).toEqual(["EUR", "USD"]);
    expect(payableCurrencies("SN")).toEqual(["USD"]);
    expect(payableOptions("AL")).toEqual([
      { currency: "EUR", kind: "operating" },
      { currency: "USD", kind: "unified" },
    ]);
  });
  it("حاجةٌ بعملةٍ ثالثة تبقى قابلة للدفع وتتقدّم", () => {
    expect(payableCurrencies("SN", "EUR")).toEqual(["EUR", "USD"]);
    expect(payableOptions("AL", "GBP").map((p) => p.kind)).toEqual([
      "need",
      "operating",
      "unified",
    ]);
    expect(payableCurrencies("AL", "eur")).toEqual(["EUR", "USD"]);
    // an unknown country has no operating currency of its own
    expect(payableOptions(null, "EUR")).toEqual([
      { currency: "EUR", kind: "need" },
      { currency: "USD", kind: "unified" },
    ]);
    expect(payableOptions("ZZ")).toEqual([{ currency: "USD", kind: "unified" }]);
  });
  it("ما عداها مرفوض", () => {
    expect(isPayable("USD", "AL")).toBe(true);
    expect(isPayable("usd", "AL")).toBe(true);
    expect(isPayable("GBP", "AL")).toBe(false);
    expect(isPayable("EUR", "SN")).toBe(false);
    expect(isPayable("EUR", "SN", "EUR")).toBe(true);
  });
});

describe("السعر", () => {
  it("الأحدث تاريخاً، مباشراً أو معكوساً", () => {
    expect(findRate("EUR", "USD", RATES)).toMatchObject({ rate: 1.1, asOf: "2026-11-20" });
    const inv = findRate("USD", "EUR", RATES)!;
    expect(inv.rate).toBeCloseTo(1 / 1.1, 10);
    expect(inv.indicative).toBe(false);
  });
  it("العملة نفسها بواحد، وما لا سعر له null", () => {
    expect(findRate("EUR", "EUR", RATES)).toMatchObject({ rate: 1, source: "identity" });
    expect(findRate("EUR", "GBP", RATES)).toBeNull();
    expect(findRate("EUR", "nope", RATES)).toBeNull();
  });
  it("عبر الموحّدة حين لا سعر مباشر، بأقدم التاريخين", () => {
    const x = findRate("EUR", "TRY", RATES)!;
    expect(x.rate).toBeCloseTo(44, 10);
    expect(x.asOf).toBe("2026-11-10");
    expect(x.indicative).toBe(true);
  });
  it("سعرٌ غير موجب يُهمل", () => {
    const bad: FxRate[] = [
      { base: "EUR", quote: "USD", rate: 0, asOf: "2027-01-01", source: "x", indicative: false },
    ];
    expect(findRate("EUR", "USD", bad)).toBeNull();
  });
});

describe("التقريب", () => {
  it("المقيَّد نزولاً إلى سنتين، بلا خطأ الكسر العشري", () => {
    expect(floorCents(46.296)).toBe(46.29);
    expect(floorCents(54 / 1.08)).toBe(50);
    expect(floorCents(0.1 + 0.2)).toBe(0.3);
  });
  it("المقترح صعوداً إلى وحدةٍ كاملة", () => {
    expect(ceilUnit(86.4)).toBe(87);
    expect(ceilUnit(50 * 1.08)).toBe(54);
    expect(ceilUnit(54.00000000001)).toBe(54);
  });
});

describe("تسعير العطاء", () => {
  const seed: FxRate[] = [
    { base: "EUR", quote: "USD", rate: 1.08, asOf: "2026-11-21", source: "t", indicative: true },
  ];
  it("بعملة الحاجة: المبلغ كما هو بلا سعر", () => {
    expect(quoteCharge(50, "EUR", "EUR", seed)).toEqual({
      charged: { amount: 50, currency: "EUR" },
      credited: { amount: 50, currency: "EUR" },
      fx: null,
    });
  });
  it("بالموحّدة: يُحصَّل ما كُتب، ويُقيَّد معادله بسعره وتاريخه", () => {
    const q = quoteCharge(50, "USD", "EUR", seed)!;
    expect(q.charged).toEqual({ amount: 50, currency: "USD" });
    expect(q.credited).toEqual({ amount: 46.29, currency: "EUR" });
    expect(q.fx).toMatchObject({ from: "USD", to: "EUR", asOf: "2026-11-21", indicative: true });
  });
  it("المتبقّي بعملة الدفع يسدّ الفجوة ولا يقصر عنها", () => {
    for (const gap of [1, 7, 80, 87, 99, 120, 1234]) {
      const pay = payAmountFor(gap, "EUR", "USD", seed)!;
      expect(Number.isInteger(pay)).toBe(true);
      expect(quoteCharge(pay, "USD", "EUR", seed)!.credited.amount).toBeGreaterThanOrEqual(gap);
      // and never a whole unit more than needed
      expect(quoteCharge(pay - 1, "USD", "EUR", seed)!.credited.amount).toBeLessThan(gap);
    }
    expect(payAmountFor(80, "EUR", "USD", seed)).toBe(87);
    expect(payAmountFor(80, "EUR", "EUR", seed)).toBe(80);
  });
  it("لا سعر أو مبلغٌ فاسد ⇒ null", () => {
    expect(quoteCharge(50, "GBP", "EUR", seed)).toBeNull();
    expect(quoteCharge(Number.NaN, "USD", "EUR", seed)).toBeNull();
    expect(quoteCharge(-1, "USD", "EUR", seed)).toBeNull();
    expect(payAmountFor(80, "EUR", "GBP", seed)).toBeNull();
  });
});

describe("العرض", () => {
  it("المعادل بكسوره وبأرقامٍ لاتينية", () => {
    expect(strip(formatMoneyExact(46.3, "EUR", "en"))).toBe("€46.30");
    expect(strip(formatMoneyExact(50, "USD", "en"))).toBe("$50");
    expect(strip(formatMoneyExact(46.3, "EUR", "ar"))).toMatch(/46\.30/);
    expect(strip(approxMoney(46.3, "EUR", "en"))).toBe("≈ €46.30");
  });
  it("السعر كما طُبّق", () => {
    const fx = findRate("USD", "EUR", FX_SEED)!;
    expect(strip(formatRate(fx, "en"))).toBe("1 USD = 0.9259 EUR");
  });
});

describe("البذرة والهجرة متطابقتان", () => {
  const sql = readFileSync(
    resolve(__dirname, "../../supabase/migrations/20261121100000_unified_currency.sql"),
    "utf8",
  );
  it("الأسعار الاسترشادية نفسها في جدول fx_rates", () => {
    for (const r of FX_SEED) {
      expect(r.indicative).toBe(true);
      expect(sql).toContain(
        `('${r.base}', '${r.quote}', ${r.rate}, DATE '${r.asOf}', '${r.source}', true)`,
      );
    }
  });
  it("دول اليورو في الدالّة هي دول الخريطة، والبقية بالموحّدة", () => {
    const m = /_code = ANY \(string_to_array\(\s*'([A-Z ]+)'/.exec(sql);
    expect(m).not.toBeNull();
    const inSql = m![1]!.trim().split(/\s+/).sort();
    const inMap = COUNTRY_CODES.filter((c) => operatingCurrency(c) === "EUR").sort();
    expect(inSql).toEqual(inMap);
    // one non-unified currency only: the SQL CASE has a single branch
    expect(new Set(Object.values(REGION_CURRENCY))).toEqual(new Set(["EUR", UNIFIED_CURRENCY]));
    expect(new Set(Object.values(COUNTRY_CURRENCY))).toEqual(new Set(["EUR"]));
    expect(sql).toContain(`ELSE '${UNIFIED_CURRENCY}' END`);
  });
});
