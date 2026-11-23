/**
 * توثيق ملفّ اليتيم — من بياناتٍ قائمة فقط (`orphan_verification` في القاعدة):
 * مستندٌ موثَّق بنوعه، وموافقة الوليّ، وتقرير متابعة معتمد حديث.
 */
export type Verification = {
  death: boolean;
  identity: boolean;
  guardianship: boolean;
  consent: boolean;
  followup: boolean;
  documents: number;
  verified_documents: number;
};

export type VerificationCheck = keyof Pick<
  Verification,
  "death" | "identity" | "guardianship" | "consent" | "followup"
>;

export const VERIFICATION_CHECKS: VerificationCheck[] = [
  "death",
  "identity",
  "guardianship",
  "consent",
  "followup",
];

export type VerificationLevel = "full" | "partial" | "none";

/** موثّق: كلّ الشروط. جزئي: بعضها. غير موثّق: لا شيء منها. */
export function verificationLevel(v: Verification | null | undefined): VerificationLevel {
  if (!v) return "none";
  const met = VERIFICATION_CHECKS.filter((k) => v[k]).length;
  if (met === VERIFICATION_CHECKS.length) return "full";
  return met > 0 ? "partial" : "none";
}

/** ما ينقص الملفّ، بالترتيب. */
export const missingChecks = (v: Verification | null | undefined): VerificationCheck[] =>
  VERIFICATION_CHECKS.filter((k) => !v?.[k]);

/** انتقالات حالة التعهّد المسموحة — مطابقةٌ لـ `admin_set_pledge_status`. */
export const PLEDGE_TRANSITIONS: Record<string, Array<"active" | "fulfilled" | "cancelled">> = {
  pending: ["active", "cancelled"],
  active: ["fulfilled", "cancelled"],
  fulfilled: [],
  cancelled: [],
};
