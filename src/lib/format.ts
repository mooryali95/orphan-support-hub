export function formatMoney(amount: number | string | null | undefined, currency = "USD") {
  const value = Number(amount ?? 0);
  return new Intl.NumberFormat("ar", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
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

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium" }).format(d);
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
