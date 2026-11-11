// نظام الأرقام مثبّت على اللاتينية: «ar» وحدها تُنتج أرقاماً هندية في بعض
// المتصفحات ولاتينية في غيرها، فيختلف الرقم نفسه بين جهاز وآخر. وهذه واجهة
// يُتّخذ القرار المالي على أرقامها، كما أن `tabular-nums` لا تنطبق على الأرقام
// الهندية في خط Tajawal فتهتزّ الأعمدة. التثبيت يضمن ثباتاً واصطفافاً.
const AR_NUM = "ar-u-nu-latn";

/**
 * العملة إلزامية (UI-01 / UX-07): الافتراض «USD» كان يكتب كفالاتٍ باليورو
 * دولارات. كلّ مبلغٍ يُكتب بعملة سجلّه، فإن غابت فشل البناء لا العرض.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string,
  locale = "ar",
) {
  const value = Number(amount ?? 0);
  // «US$» حروفٌ لاتينية تقلبها خوارزمية الاتجاه في سطرٍ عربي فتظهر «$US».
  // الرمز وحده لا يُقلب، والعزل (FSI…PDI) يُبقي المبلغ كتلةً واحدة وسط النصّ.
  const text = new Intl.NumberFormat(locale === "ar" ? AR_NUM : locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  })
    .format(value)
    .replace("US$", "$");
  return `\u2068${text}\u2069`;
}

export type CurrencyTotal = { currency: string; amount: number };

/**
 * مجاميع بعملاتها — لا يُجمع يورو مع دولار (UI-01 / UX-07 / PRD-14).
 * الترتيب بالأكبر ثم برمز العملة، فيثبت بين تحميلٍ وآخر.
 */
export function totalsByCurrency(
  items: ReadonlyArray<{ amount: number | string | null | undefined; currency: string | null }>,
): CurrencyTotal[] {
  const sums = new Map<string, number>();
  for (const it of items) {
    const cur = (it.currency ?? "").trim().toUpperCase();
    if (!cur) continue;
    sums.set(cur, (sums.get(cur) ?? 0) + Number(it.amount ?? 0));
  }
  return [...sums.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency));
}

/** «€ 800 + $ 1,000» — وبلا مبالغ «0» بعملة المنصّة الاحتياطية. */
export function formatMoneyTotals(
  totals: ReadonlyArray<CurrencyTotal>,
  fallbackCurrency: string,
  locale = "ar",
) {
  if (totals.length === 0) return formatMoney(0, fallbackCurrency, locale);
  return totals.map((t) => formatMoney(t.amount, t.currency, locale)).join(" + ");
}

/**
 * عددٌ كتلةً معزولة (FSI…PDI) كالمبلغ: لا يتفكّك وسط سطرٍ عربي.
 * `compact` يكتب الكبير مختصراً («4.3 مليون»/«4.3M») حيث تكفي الرتبة.
 */
export function formatCount(
  value: number,
  locale = "ar",
  opts: { compact?: boolean; percent?: boolean } = {},
) {
  const text = new Intl.NumberFormat(locale === "ar" ? AR_NUM : locale, {
    ...(opts.compact && Math.abs(value) >= 10_000
      ? { notation: "compact" as const, maximumFractionDigits: Math.abs(value) >= 1e6 ? 1 : 0 }
      : { maximumFractionDigits: 1 }),
  }).format(value);
  return `\u2068${text}${opts.percent ? "%" : ""}\u2069`;
}

export function ageFromBirthDate(birthDate: string | null | undefined) {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;
  const diff = Date.now() - born.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

export function fundingPercent(need: number | string, funded: number | string) {
  const n = Number(need ?? 0);
  const f = Number(funded ?? 0);
  if (n <= 0) return 0;
  return Math.min(100, Math.round((f / n) * 100));
}

/**
 * عزلُ نصٍّ من البيانات (اسم، رمز، بريد) داخل جملة: FSI…PDI — «أوّل حرفٍ
 * قويّ» يحدّد اتجاهه، فلا تنقلب نقطة «Arta S.» ولا تتفكّك الأرقام بعده. وهو
 * نظير `<Name>` حيث يلزم نصٌّ لا عنصر (aria-label، عنوان الصفحة، سطرٌ مركّب).
 */
export function isolate(text: string | null | undefined): string {
  return text ? `⁨${text}⁩` : "";
}

export function formatDate(value: string | null | undefined, locale = "ar") {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  // كتلةٌ معزولة كالمبلغ: «2026/11/02» بعد اسمٍ لاتيني في سطرٍ عربي كانت
  // تتشابك معه («2026/11/Elda K. · 02»).
  return isolate(
    new Intl.DateTimeFormat(locale === "ar" ? AR_NUM : locale, { dateStyle: "medium" }).format(d),
  );
}

export const ORPHAN_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  submitted: "بانتظار المراجعة",
  under_review: "قيد المراجعة",
  approved: "معتمد",
  rejected: "مرفوض",
  fully_sponsored: "مكفول بالكامل",
  archived: "مؤرشف",
};

export const SPONSORSHIP_STATUS_LABELS: Record<string, string> = {
  pending_payment: "بانتظار الدفع",
  active: "نشطة",
  paused: "موقوفة مؤقّتاً",
  cancelled: "ملغاة",
  completed: "مكتملة",
};

export const NEED_CATEGORY_LABELS: Record<string, string> = {
  education: "تعليم",
  health: "صحة",
  food: "غذاء",
  housing: "سكن",
  clothing: "ملبس",
  other: "أخرى",
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "الإدارة",
  sponsor: "كافل",
  care_org: "جهة رعاية",
  guardian: "ولي أمر",
};
