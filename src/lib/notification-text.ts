import { copyOf, defineCopy, type Locale } from "@/lib/locale";

/**
 * نصّ الإشعار بلغة قارئه.
 *
 * القاعدة تكتب عنوان الإشعار ونصّه بالعربية (`notify()`)، والمستلم قد اختار الإنجليزية.
 * فيُعرض له نصٌّ بلغته بحسب نوع الإشعار، في البريد (`drainOutbox`) وفي الجرس معاً. التفاصيل
 * الخاصّة بالملفّ تبقى خلف الرابط داخل المنصّة، فلا تُخمَّن ترجمتها ولا يصل نصٌّ عربي في غلافٍ
 * إنجليزي. وما كُتب أصلاً بغير العربية يبقى كما هو.
 */
export const NOTIFICATION_TEXT_COPY = defineCopy("notifications/kinds", {
  ar: {
    kinds: {} as Record<string, { title: string; body: string }>,
    other: { title: "إشعارٌ جديد", body: "افتح المنصّة لقراءة التفاصيل." },
  },
  en: {
    kinds: {
      welcome: {
        title: "Welcome aboard",
        body: "Your account is ready. Open the platform to choose who to support.",
      },
      orphan_approved: {
        title: "A file you uploaded was approved",
        body: "The admin team approved the file. Open it on the platform for details.",
      },
      orphan_rejected: {
        title: "A file you uploaded needs changes",
        body: "The admin team returned the file for correction. Open it to see what to change.",
      },
      organization_approved: {
        title: "Your organization was approved",
        body: "You can now add files and follow them on the platform.",
      },
      organization_rejected: {
        title: "Your organization request was not approved",
        body: "Open the platform to read the reason and what you can do next.",
      },
      sponsorship_started: {
        title: "Your sponsorship has started",
        body: "Thank you. Open the platform to follow what reaches the child.",
      },
      payment_succeeded: {
        title: "Payment received",
        body: "Your payment went through. Open the platform for the receipt.",
      },
      payment_failed: {
        title: "A payment did not go through",
        body: "Please check your payment method soon, or your sponsorship may end.",
      },
      report_published: {
        title: "A new impact report is published",
        body: "A report on a file you support is ready to read on the platform.",
      },
      report_rejected: {
        title: "A report was returned for correction",
        body: "Open the platform to see what needs changing.",
      },
      pledge_preparing: {
        title: "Your support is being prepared",
        body: "The office started preparing your in-kind or training support.",
      },
      pledge_delivered: {
        title: "Your support was delivered",
        body: "The office delivered your support with a verified document. Open it on the platform.",
      },
    } as Record<string, { title: string; body: string }>,
    other: { title: "New notice", body: "Open the platform to read the details." },
  },
});

const ARABIC = /[؀-ۿ]/;

export function localizeNotification<
  N extends { kind: string; title: string; body?: string | null | undefined },
>(n: N, locale: string): N {
  if (locale === "ar" || !ARABIC.test(`${n.title} ${n.body ?? ""}`)) return n;
  const c = copyOf(NOTIFICATION_TEXT_COPY, locale as Locale);
  const text = c.kinds[n.kind] ?? c.other;
  return { ...n, title: text.title, body: text.body };
}
