/**
 * عملات الدفع لطفلٍ بعينه كما تعرضها الواجهة — حسابٌ خالص يصلح للمتصفّح.
 *
 * المصدر في المسار الحقيقي دالّة القاعدة `sponsorship_pay_options` (عملة الحاجة،
 * وعملة تشغيل الدولة، والموحّدة — بأسعارها المخزَّنة)، وفي «جرّب المنصّة» خريطة
 * `currency.ts` وبذرتها. الشكل واحد، فالنموذجان يعرضان الاختيار نفسه.
 */
import { amountPresets } from "@/lib/amount-presets";
import {
  ceilUnit,
  FX_SEED,
  payableOptions,
  payAmountFor,
  quoteCharge,
  type ChargeQuote,
  type FxRate,
  type Payable,
  type PayableKind,
} from "@/lib/currency";

export type PayOptions = {
  /** عملة حاجة الطفل: ما يُقيَّد له مهما كانت عملة الدفع. */
  needCurrency: string;
  /** بالترتيب المعروض؛ الأولى هي الافتراضية. */
  options: Payable[];
  rates: FxRate[];
};

const CODE = /^[A-Z]{3}$/;
const KINDS: readonly PayableKind[] = ["need", "operating", "unified"];

/** عملة الحاجة وحدها: ما كان قبل العملة الموحّدة، وما يُعرض إن غاب المصدر. */
export function needOnly(needCurrency: string): PayOptions {
  return { needCurrency, options: [{ currency: needCurrency, kind: "need" }], rates: [] };
}

/**
 * صفوف `sponsorship_pay_options` ← خيارات الواجهة. ما لا يُفهم يُهمل، وعملةٌ
 * غير عملة الحاجة بلا سعرٍ صالح لا تُعرض: لا يُختار ما لا يُسعَّر.
 */
export function parsePayOptions(rows: unknown, needCurrency: string): PayOptions {
  const out = needOnly(needCurrency);
  if (!Array.isArray(rows)) return out;
  const options: Payable[] = [];
  const rates: FxRate[] = [];
  for (const raw of rows as Array<Record<string, unknown>>) {
    const currency = String(raw?.["currency"] ?? "");
    const kind = raw?.["kind"] as PayableKind;
    if (!CODE.test(currency) || !KINDS.includes(kind)) continue;
    if (options.some((o) => o.currency === currency)) continue;
    if (currency === needCurrency) {
      options.push({ currency, kind });
      continue;
    }
    const [base, quote] = String(raw["pair"] ?? "").split("/");
    const rate = Number(raw["rate"]);
    const asOf = String(raw["as_of"] ?? "");
    if (!base || !quote || !CODE.test(base) || !CODE.test(quote)) continue;
    if (!(rate > 0) || !Number.isFinite(rate) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) continue;
    const fx: FxRate = {
      base,
      quote,
      rate,
      asOf,
      source: String(raw["source"] ?? ""),
      // غياب الوسم يُعدّ استرشادياً: لا يُعرض سعرٌ على أنه معتمد بلا تصريح.
      indicative: raw["indicative"] !== false,
    };
    if (!quoteCharge(1, currency, needCurrency, [fx])) continue;
    options.push({ currency, kind });
    rates.push(fx);
  }
  if (!options.some((o) => o.currency === needCurrency)) return out;
  // عملة الحاجة أولاً: الافتراضي بلا تحويل.
  options.sort((a, b) => Number(b.currency === needCurrency) - Number(a.currency === needCurrency));
  return { needCurrency, options, rates };
}

/** خيارات «جرّب المنصّة»: من خريطة الدول وبذرة الأسعار، بلا خادم. */
export function demoPayOptions(countryCode: string, needCurrency: string): PayOptions {
  const rates = [...FX_SEED];
  const options = payableOptions(countryCode, needCurrency).filter(
    (o) => quoteCharge(1, o.currency, needCurrency, rates) !== null,
  );
  options.sort((a, b) => Number(b.currency === needCurrency) - Number(a.currency === needCurrency));
  return { needCurrency, options, rates };
}

export function canPayIn(o: PayOptions, currency: string): boolean {
  return o.options.some((p) => p.currency === currency);
}

/** تسعير مبلغٍ كتبه الداعم بعملة الدفع المختارة؛ null إن لم تكن ممّا يُدفع به. */
export function quoteFor(o: PayOptions, amount: number, payCurrency: string): ChargeQuote | null {
  if (!canPayIn(o, payCurrency)) return null;
  return quoteCharge(amount, payCurrency, o.needCurrency, o.rates);
}

/** المبالغ المقترحة كما تُكتب بعملة الدفع. */
export type PayPresets = {
  /** «المتبقّي كاملاً»: وحداتٌ كاملة صعوداً، فما يُقيَّد منها يسدّ الفجوة. */
  gap: number | null;
  /** كسور الحاجة مقرَّبةً تقريباً لطيفاً بعملة الدفع نفسها. */
  amounts: number[];
};

/**
 * المقترحات بعملة الدفع من حاجة الطفل وفجوته (وهما بعملة الحاجة). بعملة
 * الحاجة نفسها تعود كما كانت قبل العملة الموحّدة.
 */
export function presetsIn(
  o: PayOptions,
  payCurrency: string,
  need: number,
  gap: number,
): PayPresets {
  const inPay = (n: number) =>
    payCurrency === o.needCurrency ? n : payAmountFor(n, o.needCurrency, payCurrency, o.rates);
  // وحداتٌ كاملة حتى بعملة الحاجة: فجوةٌ بكسور (بعد عطاءٍ محوَّل) تُسدّ بما فوقها.
  const gapIn = gap > 0 ? inPay(gap) : null;
  const gapPay = gapIn === null ? null : ceilUnit(gapIn);
  const needPay = inPay(need) ?? 0;
  return {
    gap: gapPay,
    amounts: gapPay === null && gap > 0 ? [] : amountPresets(needPay, gapPay ?? 0),
  };
}

/** أيّ مقترحٍ هو المبلغ الحالي؟ يُحفظ ليُعاد اختياره نفسه حين تتبدّل العملة. */
export type PresetKey = "gap" | number | null;

export function presetKeyOf(p: PayPresets, amount: number): PresetKey {
  if (p.gap !== null && amount === p.gap) return "gap";
  const at = p.amounts.indexOf(amount);
  return at >= 0 ? at : null;
}

/**
 * المبلغ بعد تبديل عملة الدفع. ما كتبه الداعم بيده يبقى رقمه كما كتبه (والمعادل
 * المعروض يتبدّل أمامه)؛ وما اختاره من المقترحات يصير المقترح نفسه بالعملة
 * الجديدة («المتبقّي كاملاً» يبقى المتبقّي كاملاً).
 */
export function amountAfterSwitch(key: PresetKey, typed: string, next: PayPresets): string {
  if (key === "gap" && next.gap !== null) return String(next.gap);
  if (typeof key === "number" && next.amounts[key] !== undefined) return String(next.amounts[key]);
  return typed;
}

/**
 * قيمة وحدةٍ واحدة من عملة الدفع بعملة الحاجة: المبلغ يُكتب وحداتٍ كاملة، فما
 * يزيد عن الفجوة بأقلّ منها أثرُ تقريبٍ لا تجاوزٌ يُسأل عنه الداعم.
 */
export function unitInNeed(o: PayOptions, payCurrency: string): number {
  return quoteFor(o, 1, payCurrency)?.credited.amount || 1;
}
