/**
 * رسائل دورة الكفالة كما يفهمها الكافل، من رمز القاعدة لا من نصّها. مشتركةٌ بين دوالّ
 * الخادم (`sponsorships.functions`) ونسخة التجربة، فتقول التجربة ما تقوله المنصّة حرفاً.
 */
export const LIFECYCLE_ERRORS = {
  card: "الكفالة بالبطاقة لا تُوقَف ولا يُعدَّل مبلغها من هنا بعد. يمكنك إنهاؤها ثم البدء بمبلغٍ جديد.",
  state: "حال الكفالة لا تسمح بهذا الآن.",
  range: "القيمة خارج الحدود المسموحة.",
  missing: "لا توجد كفالة بهذا المعرّف.",
  other: "تعذّر التنفيذ، حاول لاحقاً.",
} as const;

const BY_CODE: Record<string, keyof typeof LIFECYCLE_ERRORS> = {
  "0A000": "card",
  "55000": "state",
  "22023": "range",
  P0002: "missing",
};

export function lifecycleError(error: { message: string; code?: string }): string {
  return LIFECYCLE_ERRORS[BY_CODE[error.code ?? ""] ?? "other"];
}
