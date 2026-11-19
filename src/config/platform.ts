/**
 * وضع المنصّة — مفتاحٌ واحد يقرّر أين تقود أزرار الكفالة العامّة.
 *
 * - `trial` (حتى الاعتماد): زرّ «اكفل يتيماً» والصفحة الأولى والقاعة تقود إلى
 *   وضع التجربة `/try`: أطفالٌ افتراضيون ودفعٌ محاكى، منفصلون عن الدليل والدفع.
 * - `live` (بعد الاعتماد وربط المنصّة التشغيلية): الأزرار نفسها تقود إلى الدليل
 *   الحقيقي، والقاعة إلى أعداد الدليل في كلّ دولة.
 *
 * الرحلة الحقيقية تعمل في الوضعين لمن يفتح روابطها مباشرةً؛ المفتاح يغيّر
 * الوجهات العامّة وحدها، فلا يُعدَّل يوم الاعتماد إلا هذا السطر.
 */
export type PlatformMode = "trial" | "live";

export const PLATFORM_MODE: PlatformMode = "trial";

/** بعد الاعتماد: يبقى وضع التجربة مرئياً في الصفحة الأولى للعروض على العملاء؟ */
export const KEEP_TRIAL_PUBLIC = true;

export const isTrial = (mode: PlatformMode = PLATFORM_MODE) => mode === "trial";

/** وجهة «اكفل يتيماً» العامّة */
export const sponsorEntry = (mode: PlatformMode = PLATFORM_MODE) =>
  isTrial(mode) ? ("/try" as const) : ("/orphans" as const);

/** هل يظهر رابط التجربة الهادئ تحت أزرار الصفحة الأولى */
export const showTrialLink = (mode: PlatformMode = PLATFORM_MODE, keep = KEEP_TRIAL_PUBLIC) =>
  !isTrial(mode) && keep;
