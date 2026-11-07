// نظام الأرقام مثبّت على اللاتينية: «ar» وحدها تُنتج أرقاماً هندية في بعض
// المتصفحات ولاتينية في غيرها، فيختلف الرقم نفسه بين جهاز وآخر. وهذه واجهة
// يُتّخذ القرار المالي على أرقامها، كما أن `tabular-nums` لا تنطبق على الأرقام
// الهندية في خط Tajawal فتهتزّ الأعمدة. التثبيت يضمن ثباتاً واصطفافاً.
const AR_NUM = "ar-u-nu-latn";

export function formatMoney(
  amount: number | string | null | undefined,
  currency = "USD",
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

export function formatDate(value: string | null | undefined, locale = "ar") {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? AR_NUM : locale, { dateStyle: "medium" }).format(
    d,
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
  paused: "موقوفة مؤقتاً",
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
