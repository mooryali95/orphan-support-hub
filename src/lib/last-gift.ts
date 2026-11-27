/**
 * آخر مبلغٍ وعملةٍ أكّدهما الداعم في هذا المتصفّح، ليبدأ النموذج التالي منهما بدل
 * أن يعيد الاختيار. تفضيلٌ لا سجلّ: يُقرأ بعد التركيب (فلا يختلف الرسم الأوّل عن
 * الخادم)، ويُمحى عند الخروج مع بيانات العمل (`USER_DATA_PREFIXES`).
 */
export const LAST_GIFT_KEY = "kh:last-gift";

export type LastGift = { amount: number; currency: string };

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readLastGift(): LastGift | null {
  try {
    const raw = store()?.getItem(LAST_GIFT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<LastGift>;
    if (
      typeof v.amount === "number" &&
      Number.isFinite(v.amount) &&
      v.amount >= 1 &&
      typeof v.currency === "string" &&
      /^[A-Z]{3}$/.test(v.currency)
    )
      return { amount: Math.floor(v.amount), currency: v.currency };
  } catch {
    /* قيمةٌ تالفة أو تخزينٌ محجوب: يبدأ النموذج من مقترحه */
  }
  return null;
}

export function saveLastGift(gift: LastGift): void {
  try {
    store()?.setItem(LAST_GIFT_KEY, JSON.stringify(gift));
  } catch {
    /* لا شيء يُفعل */
  }
}
