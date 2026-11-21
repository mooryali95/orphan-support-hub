/**
 * العملة الموحّدة وعملة تشغيل كل دولة — حسابٌ خالص، بلا شبكة ولا قاعدة.
 *
 * ثلاث عملاتٍ يلتقي عندها كل عطاء:
 *   • عملة الحاجة: التي كُتب بها احتياج الطفل (عملة دولته عند الإدخال).
 *   • عملة التشغيل: التي تعمل بها دولة الطفل (يورو لأوروبا، دولار لأفريقيا…).
 *   • العملة الموحّدة: واحدةٌ للمنصّة كلّها، يدفع بها أيّ داعمٍ لأيّ دولة.
 *
 * الداعم يكتب المبلغ بالعملة التي يدفع بها، فيُحصَّل منه كما كتبه بلا تقريب،
 * ويُقيَّد لحاجة الطفل ما يعادله بعملة الحاجة بسعرٍ مسجَّل بتاريخه ومصدره.
 * السعر يُحفظ مع العطاء، فلا يتبدّل المقيَّد إن تبدّل السعر لاحقاً.
 */
import { continentOf, type Continent } from "@/lib/countries";

/**
 * العملة الموحّدة للمنصّة — سطرٌ واحد يغيّره المالك.
 * الدولار: هو افتراض `platform_settings.currency` وعملة منتج مزوّد الدفع
 * (`CREEM_PRODUCT_CURRENCY`). البديل «EUR» (عملة ملفّات التجربة الحالية).
 * في القاعدة المرجع هو `platform_settings.currency`؛ ويجب أن يطابق هذا السطر.
 */
export const UNIFIED_CURRENCY = "USD";

/** عملة التشغيل لكل قارة: أوروبا باليورو، وما عداها بالدولار. */
export const REGION_CURRENCY: Record<Continent, string> = {
  EU: "EUR",
  AF: "USD",
  AS: "USD",
  NA: "USD",
  SA: "USD",
  OC: "USD",
  AN: "USD",
};

/**
 * استثناءات الدول من قاعدة القارة. في القاعدة يقابلها `countries.currency`
 * (تغيّره الإدارة لكل دولة)؛ وهجرة العملة الموحّدة تملؤه من هذه الخريطة،
 * والاختبار يثبت تطابقهما.
 */
export const COUNTRY_CURRENCY: Readonly<Record<string, string>> = {
  // قبرص عضوٌ في منطقة اليورو وإن عُدّت جغرافياً في آسيا.
  CY: "EUR",
};

const CODE = /^[A-Z]{3}$/;
const norm = (c: string | null | undefined) => (c ?? "").trim().toUpperCase();

function knownOperating(countryCode: string | null | undefined): string | null {
  const code = norm(countryCode);
  const own = COUNTRY_CURRENCY[code];
  if (own) return own;
  const continent = code ? continentOf(code) : null;
  return continent ? REGION_CURRENCY[continent] : null;
}

/** عملة تشغيل الدولة: استثناؤها، ثم قارّتها، ثم الموحّدة لما لا يُعرف. */
export function operatingCurrency(countryCode: string | null | undefined): string {
  return knownOperating(countryCode) ?? UNIFIED_CURRENCY;
}

export type PayableKind = "need" | "operating" | "unified";
export type Payable = { currency: string; kind: PayableKind };

/**
 * العملات التي يُدفع بها لطفلٍ في دولة: عملة تشغيلها ثم الموحّدة، بلا تكرار.
 * إن كُتبت حاجة الطفل بعملةٍ ثالثة (ملفٌّ قديم) تتقدّمهما: الدفع بعملة الحاجة
 * لا تحويل فيه، فلا يُحجب. دولةٌ غير معروفة لا عملة تشغيل لها: عملة الحاجة
 * والموحّدة وحدهما.
 */
export function payableOptions(
  countryCode: string | null | undefined,
  needCurrency?: string | null,
): Payable[] {
  const out: Payable[] = [];
  const add = (currency: string, kind: PayableKind) => {
    if (CODE.test(currency) && !out.some((p) => p.currency === currency)) {
      out.push({ currency, kind });
    }
  };
  const need = norm(needCurrency);
  const operating = knownOperating(countryCode);
  if (need && need !== operating) add(need, "need");
  if (operating) add(operating, "operating");
  add(UNIFIED_CURRENCY, "unified");
  return out;
}

export function payableCurrencies(
  countryCode: string | null | undefined,
  needCurrency?: string | null,
): string[] {
  return payableOptions(countryCode, needCurrency).map((p) => p.currency);
}

export function isPayable(
  currency: string,
  countryCode: string | null | undefined,
  needCurrency?: string | null,
): boolean {
  return payableCurrencies(countryCode, needCurrency).includes(norm(currency));
}

/* ------------------------------------------------------------------ */
/* أسعار الصرف                                                         */
/* ------------------------------------------------------------------ */

/** وحدةٌ من `base` تساوي `rate` من `quote`، بتاريخٍ ومصدر. */
export type FxRate = {
  base: string;
  quote: string;
  rate: number;
  /** تاريخ السعر (YYYY-MM-DD) — يُعرض للداعم ويُحفظ مع العطاء. */
  asOf: string;
  source: string;
  /** استرشادي: ليس سعر سوقٍ لحظياً، ولا يُعرض على أنه كذلك. */
  indicative: boolean;
};

/**
 * بذرة الأسعار: قيمةٌ استرشادية ثابتة تُستبدل بسعرٍ معتمد قبل التحصيل الفعلي.
 * مطابقةٌ لبذرة جدول `fx_rates` في الهجرة (والاختبار يثبت ذلك). لا يُجلب سعرٌ
 * من الشبكة في المتصفّح.
 */
export const FX_SEED: readonly FxRate[] = [
  {
    base: "EUR",
    quote: "USD",
    rate: 1.08,
    asOf: "2026-11-21",
    source: "seed:indicative",
    indicative: true,
  },
];

/** السعر المستعمل في تحويلٍ بعينه: وحدةٌ من `from` = `rate` من `to`. */
export type AppliedRate = {
  from: string;
  to: string;
  rate: number;
  asOf: string;
  source: string;
  indicative: boolean;
};

/**
 * أحدث سعرٍ بين عملتين: المباشر، ثم معكوسه، ثم عبر العملة الموحّدة.
 * العملة نفسها سعرها 1 بلا مصدر. ما لا سعر له يعود null — لا تخمين.
 */
export function findRate(
  from: string,
  to: string,
  rates: readonly FxRate[] = FX_SEED,
): AppliedRate | null {
  const a = norm(from);
  const b = norm(to);
  if (!CODE.test(a) || !CODE.test(b)) return null;
  if (a === b) {
    return { from: a, to: b, rate: 1, asOf: "", source: "identity", indicative: false };
  }
  const direct = latest(a, b, rates);
  if (direct) return direct;
  if (a !== UNIFIED_CURRENCY && b !== UNIFIED_CURRENCY) {
    const first = latest(a, UNIFIED_CURRENCY, rates);
    const second = latest(UNIFIED_CURRENCY, b, rates);
    if (first && second) {
      return {
        from: a,
        to: b,
        rate: first.rate * second.rate,
        // الأقدم من التاريخين: السعر المركّب لا يكون أحدث من أقدم طرفيه.
        asOf: first.asOf < second.asOf ? first.asOf : second.asOf,
        source: first.source === second.source ? first.source : `${first.source}+${second.source}`,
        indicative: first.indicative || second.indicative,
      };
    }
  }
  return null;
}

function latest(a: string, b: string, rates: readonly FxRate[]): AppliedRate | null {
  let best: AppliedRate | null = null;
  for (const r of rates) {
    if (!(r.rate > 0) || !Number.isFinite(r.rate)) continue;
    let rate: number;
    if (r.base === a && r.quote === b) rate = r.rate;
    else if (r.base === b && r.quote === a) rate = 1 / r.rate;
    else continue;
    if (!best || r.asOf > best.asOf) {
      best = { from: a, to: b, rate, asOf: r.asOf, source: r.source, indicative: r.indicative };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* التقريب                                                             */
/* ------------------------------------------------------------------ */

// الكسر العشري في الحاسوب يقصّر 50 إلى 49.99999999: هامشٌ دون أصغر كسرٍ يُحفظ.
const EPS = 1e-7;

/** إلى سنتين نزولاً: المقيَّد للطفل لا يزيد عمّا دُفع فعلاً. */
export function floorCents(n: number): number {
  return Math.floor(n * 100 + EPS) / 100;
}

/** إلى وحدةٍ كاملة صعوداً: المبلغ المقترح يسدّ الفجوة ولا يقصر عنها بكسر. */
export function ceilUnit(n: number): number {
  return Math.ceil(n - EPS);
}

export type Money = { amount: number; currency: string };

export type ChargeQuote = {
  /** ما يُحصَّل من الداعم: المبلغ الذي كتبه بعملته، كما هو. */
  charged: Money;
  /** ما يُقيَّد لحاجة الطفل بعملة الحاجة. */
  credited: Money;
  /** null حين لا تحويل (الدفع بعملة الحاجة نفسها). */
  fx: AppliedRate | null;
};

/**
 * تسعير عطاء: الداعم يدفع `amount` بـ`payCurrency`، فيُقيَّد لحاجةٍ بـ`needCurrency`
 * ما يعادله مقرَّباً نزولاً إلى سنتين. لا سعر ⇒ null (لا يُقبل العطاء بتلك العملة).
 */
export function quoteCharge(
  amount: number,
  payCurrency: string,
  needCurrency: string,
  rates: readonly FxRate[] = FX_SEED,
): ChargeQuote | null {
  const pay = norm(payCurrency);
  const need = norm(needCurrency);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const fx = findRate(pay, need, rates);
  if (!fx) return null;
  const charged = { amount, currency: pay };
  if (pay === need) return { charged, credited: { amount, currency: need }, fx: null };
  return { charged, credited: { amount: floorCents(amount * fx.rate), currency: need }, fx };
}

/**
 * مبلغٌ بعملة الحاجة كما يُدفع بعملةٍ أخرى: وحداتٌ كاملة صعوداً، فما يُقيَّد
 * منه لا يقلّ عن المبلغ الأصلي (زرّ «المتبقّي كاملاً» يسدّ الفجوة فعلاً).
 */
export function payAmountFor(
  needAmount: number,
  needCurrency: string,
  payCurrency: string,
  rates: readonly FxRate[] = FX_SEED,
): number | null {
  const fx = findRate(needCurrency, payCurrency, rates);
  if (!fx || !Number.isFinite(needAmount) || needAmount < 0) return null;
  return ceilUnit(needAmount * fx.rate);
}

/* ------------------------------------------------------------------ */
/* العرض                                                               */
/* ------------------------------------------------------------------ */

const AR_NUM = "ar-u-nu-latn";
const tag = (locale: string) => (locale === "ar" ? AR_NUM : locale);

/** مبلغٌ بكسوره (حتى سنتين) — للمعادل المحوَّل، حيث «46.30» ليست «46». */
export function formatMoneyExact(amount: number, currency: string, locale = "ar"): string {
  const text = new Intl.NumberFormat(tag(locale), {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })
    .format(amount)
    .replace("US$", "$");
  return `\u2068${text}\u2069`;
}

/**
 * «≈ €46.30» — المعادل قبل تثبيت السعر مع العطاء. العلامة خارج عزل المبلغ،
 * فتقع في أوّل السطر باتجاهه: يمين المبلغ بالعربية ويساره بالإنجليزية.
 */
export function approxMoney(amount: number, currency: string, locale = "ar"): string {
  return `≈ ${formatMoneyExact(amount, currency, locale)}`;
}

/** «1 USD = 0.9259 EUR» — السعر كما طُبّق، بأربع خاناتٍ تكفي للمراجعة. */
export function formatRate(fx: AppliedRate, locale = "ar"): string {
  const n = new Intl.NumberFormat(tag(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(fx.rate);
  return `\u20681 ${fx.from} = ${n} ${fx.to}\u2069`;
}

/** اسم العملة بلغة الواجهة («دولار أمريكي») — من المتصفّح، وعند الغياب رمزها. */
export function currencyName(currency: string, locale = "ar"): string {
  try {
    return (
      new Intl.DisplayNames([locale], { type: "currency", fallback: "code" }).of(currency) ??
      currency
    );
  } catch {
    return currency;
  }
}
