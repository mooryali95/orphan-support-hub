/**
 * حال العودة من بوابة الدفع كما تُعرض للكافل: أربع حالات لا غير.
 *
 * تُحسب من صفّ الدفعة كما قرأه الخادم، لا من معاملات الرابط: رابط العودة يمكن أن يُكتب
 * باليد، فلا يقول «نجح» إلا القيد المسجّل.
 */
export type PaymentReturnState = "success" | "pending" | "failed" | "expired";

export type PaymentReturn = {
  state: PaymentReturnState;
  /** اسم البطاقة المعروض للطفل وحده: لا صورة ولا موضع. */
  childName: string | null;
  amount: number | null;
  currency: string | null;
  /** مرجع الدفعة كما يراه الكافل في كشفه (DEMO- في التجربة). */
  reference: string | null;
};

/** جلسة دفعٍ لم تكتمل خلال يومٍ تُعدّ منتهية: البوابة لا تقبلها بعده. */
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export function paymentReturnState(
  row: { status: string; created_at: string } | null,
  now: number = Date.now(),
): PaymentReturnState {
  if (!row) return "expired";
  if (row.status === "paid") return "success";
  if (row.status === "pending") {
    const at = Date.parse(row.created_at);
    return Number.isFinite(at) && now - at > PENDING_TTL_MS ? "expired" : "pending";
  }
  if (row.status === "expired" || row.status === "cancelled") return "expired";
  return "failed";
}

/** فترات الانتظار بين قراءات الحالة المعلّقة: تتضاعف حتى حدٍّ، وتتوقّف بعد عددٍ محدود. */
export const POLL_DELAYS_MS: readonly number[] = [2000, 4000, 8000, 15000, 30000, 30000];
