import { defineCopy, useCopy } from "@/lib/locale";

/** تسميات حالة الكفالة للكافل بلغته؛ الإدارة تبقى على `SPONSORSHIP_STATUS_LABELS`. */
export const STATUS_COPY = defineCopy("components/sponsorship/status", {
  ar: {
    pending_payment: "بانتظار الدفع",
    active: "نشطة",
    paused: "موقوفة مؤقّتاً",
    cancelled: "ملغاة",
    completed: "مكتملة",
  },
  en: {
    pending_payment: "Awaiting payment",
    active: "Active",
    paused: "Paused",
    cancelled: "Cancelled",
    completed: "Completed",
  },
});

/** يعيد دالةً تسمّي الحالة، وتُبقي الحالة المجهولة كما هي. */
export function useStatusLabel(): (status: string) => string {
  const t: Record<string, string> = useCopy(STATUS_COPY);
  return (status) => t[status] ?? status;
}
