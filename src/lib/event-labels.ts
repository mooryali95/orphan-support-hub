/**
 * أسماء أحداث الخطّ الزمني و«رحلتي» — مصدرٌ واحد بلغتين (UI-04/A11Y-12).
 *
 * كانت الخرائط في ملفّين بالعربية وحدها، وكان الناقص منها يُعرض مفتاحاً خاماً
 * («report.submitted — أرجان . ج»). الآن: كل نوعٍ تكتبه القاعدة له اسم
 * (اختبارٌ يقرأ الهجرات ويتحقّق)، والمجهول يُعرض باسمٍ عامّ لا بمفتاحه.
 */
import { copyOf, defineCopy, type Locale } from "@/lib/locale";

/** كل ما تكتبه القاعدة في timeline_events أو تُنتجه my_journey_feed. */
export const EVENT_TYPES = [
  "orphan.submitted",
  "orphan.approved",
  "orphan.rejected",
  "report.submitted",
  "report.published",
  "report.rejected",
  "sponsorship.started",
  "disbursement_delivered",
  "pledge.preparing",
  "pledge.delivered",
  "unit.accepted",
  "trait.measured",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

const COPY = defineCopy("lib/event-labels", {
  ar: {
    labels: {
      "orphan.submitted": "رُفع الملف للمراجعة",
      "orphan.approved": "اعتُمد الملف ونُشر",
      "orphan.rejected": "أُعيد الملف للتصحيح",
      "report.submitted": "رُفع تقرير دوري",
      "report.published": "نُشر تقرير أثر",
      "report.rejected": "أُعيد التقرير للتصحيح",
      "sponsorship.started": "بدأت الكفالة",
      disbursement_delivered: "وصلت كفالة الشهر موثّقة",
      "pledge.preparing": "بدأ تجهيز دعمك",
      "pledge.delivered": "سُلّم دعمك موثّقاً",
      "unit.accepted": "اجتاز جلسة",
      "trait.measured": "قياسٌ جديد لسمة",
    } satisfies Record<EventType, string>,
    fallback: "تحديثٌ في الملف",
  },
  en: {
    labels: {
      "orphan.submitted": "File submitted for review",
      "orphan.approved": "File approved and published",
      "orphan.rejected": "File returned for correction",
      "report.submitted": "Progress report submitted",
      "report.published": "Impact report published",
      "report.rejected": "Report returned for correction",
      "sponsorship.started": "Sponsorship started",
      disbursement_delivered: "This month's sponsorship delivered, with a document",
      "pledge.preparing": "Your support is being prepared",
      "pledge.delivered": "Your support was delivered, with a document",
      "unit.accepted": "Completed a session",
      "trait.measured": "New trait measurement",
    } satisfies Record<EventType, string>,
    fallback: "File update",
  },
});

const KNOWN = new Set<string>(EVENT_TYPES);
export const isEventType = (type: string): type is EventType => KNOWN.has(type);

/**
 * اسم الحدث بلغة الواجهة. النوع المجهول لا يُعرض مفتاحاً: اسمٌ عامّ، وتنبيهٌ
 * في سجلّ المتصفّح كي يُضاف اسمه.
 */
export function eventLabel(type: string, locale: Locale = "ar"): string {
  const c = copyOf(COPY, locale);
  if (isEventType(type)) return c.labels[type];
  if (typeof console !== "undefined") console.warn(`[event-labels] unknown event type: ${type}`);
  return c.fallback;
}

/**
 * ما هو عملٌ داخلي بين الجهة والإدارة لا خبرٌ للكافل: رفع تقريرٍ لم يُراجَع،
 * وإعادة ملفٍّ أو تقريرٍ للتصحيح. الكافل يرى ما نُشر ووصل.
 */
const INTERNAL: ReadonlySet<string> = new Set([
  "orphan.submitted",
  "orphan.rejected",
  "report.submitted",
  "report.rejected",
]);
export const isSponsorVisible = (type: string) => !INTERNAL.has(type);
