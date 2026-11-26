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
import { TRIAL_ENABLED, trialRoute } from "@/lib/trial-gate";

export type PlatformMode = "trial" | "live";

export const PLATFORM_MODE: PlatformMode = "trial";

/** بعد الاعتماد: يبقى وضع التجربة مرئياً في الصفحة الأولى للعروض على العملاء؟ */
export const KEEP_TRIAL_PUBLIC = true;

/**
 * التجربة لا تُعدّ إلا إن وُجدت ملفّاتها (`@/lib/trial-gate`): بعد `npm run trial:remove` يقود
 * كلّ شيءٍ إلى الحقيقي ولو بقي الوضع `trial` سهواً.
 */
export const isTrial = (mode: PlatformMode = PLATFORM_MODE, trial = TRIAL_ENABLED) =>
  trial && mode === "trial";

/** وجهة «اكفل يتيماً» العامّة */
export const sponsorEntry = (mode: PlatformMode = PLATFORM_MODE, trial = TRIAL_ENABLED) =>
  isTrial(mode, trial) ? trialRoute("/try") : ("/orphans" as const);

/** هل يظهر رابط التجربة الهادئ تحت أزرار الصفحة الأولى */
export const showTrialLink = (
  mode: PlatformMode = PLATFORM_MODE,
  keep = KEEP_TRIAL_PUBLIC,
  trial = TRIAL_ENABLED,
) => trial && !isTrial(mode, trial) && keep;

/** رابط القاعة العامّ: قاعة التجربة ما دامت التجربة، وإلا القاعة الحيّة */
export const hallEntryHref = (trial = TRIAL_ENABLED) => (trial ? "/hall?try=1" : "/hall");
