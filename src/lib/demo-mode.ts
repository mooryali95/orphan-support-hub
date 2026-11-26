/**
 * الوضع التجريبي للزائر — جلسةٌ يدخلها بزرّ «ادخل التجربة» ويخرج منها متى شاء.
 *
 * المنصّة واحدة: الشاشات والكود نفسهما. الوضع التجريبي يغيّر مصدر البيانات وحده
 * (عيّنةٌ بدل القاعدة، كما تفعل لوحة الإدارة بـ`sample`) ويفتح التجاوزات المقصودة:
 * دعمٌ بلا دفع، وحسابٌ بلا حساب، ورحلة كل قسمٍ حتى الأثر.
 *
 * ويختلف عن `PLATFORM_MODE` (src/config/platform.ts): ذاك إعدادٌ للموقع كلّه يقرّر
 * الوجهات العامّة، وهذا اختيار الزائر نفسه في هذا التبويب. يُحفظ في sessionStorage:
 * يبقى عبر التنقّل وإعادة التحميل، ويزول بإغلاق التبويب، ولا يصل الخادم أبداً —
 * فلا يمسّ مساراً مالياً حقيقياً.
 */
import { useSyncExternalStore } from "react";

import { TRIAL_ENABLED } from "@/lib/trial-gate";

const KEY = "platform-demo-mode";
const EVENT = "platform-demo-mode";

function read(): boolean {
  // بعد حذف التجربة (`@/lib/trial-gate`) لا جلسة عرض، ولو بقي علمها في تبويبٍ قديم.
  if (!TRIAL_ENABLED) return false;
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function write(on: boolean) {
  try {
    if (on) window.sessionStorage.setItem(KEY, "1");
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // تخزينٌ محجوب: يبقى الوضع لهذه الصفحة وحدها عبر الحدث.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: on }));
}

/** هل الزائر في الوضع التجريبي الآن؟ (على الخادم: لا.) */
export const isDemoSession = read;

/** يدخل الوضع التجريبي — يُستدعى من زرّ «ادخل التجربة» ومن دخول مسارات التجربة. */
export function enterDemo() {
  if (TRIAL_ENABLED && !read()) write(true);
}

/** يعود إلى المنصّة الحقيقية. */
export function exitDemo() {
  write(false);
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** الوضع التجريبي كحالةٍ تُعيد الرسم حين تتغيّر. الخادم يرسم الوضع الحقيقي دائماً. */
export function useDemo(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
