import * as React from "react";

import { BrandButton, BrandEmail, BrandText } from "./_brand";
import { resolveEmailLink } from "./links";

/**
 * القالب المعامَلاتي الموحّد — رسالةٌ واحدة لكل أنواع الإشعارات.
 *
 * والتوحيد قرارٌ لا كسل: الإشعار في القاعدة يحمل `title` و`body` و`link`
 * جاهزةً بالعربية، كتبتها الدالة التي أنشأته وهي أعلم بسياقها. فقالبٌ
 * لكل نوع يعني نسخ النصّ في مكانين ثم افتراقهما عند أول تعديل.
 *
 * ما يختلف بين الأنواع هو **التصنيف** (`eyebrow`) ونصّ الزرّ، وكلاهما
 * يُشتقّ من النوع هنا في مكان واحد.
 */

/** تصنيف الرسالة ونصّ زرّها — بحسب نوع الإشعار. */
const KIND_FRAME: Record<string, { eyebrow: string; cta: string }> = {
  welcome: { eyebrow: "أهلاً بك", cta: "تصفّح الملفات" },
  orphan_approved: { eyebrow: "قرار اعتماد", cta: "عرض الملف" },
  orphan_rejected: { eyebrow: "الملف يحتاج تصحيحاً", cta: "فتح الملف" },
  organization_approved: { eyebrow: "اعتماد الجهة الميدانية", cta: "لوحة الجهة" },
  organization_rejected: { eyebrow: "طلب الجهة يحتاج تصحيحاً", cta: "لوحة الجهة" },
  sponsorship_started: { eyebrow: "بدأت الكفالة", cta: "عرض الكفالة" },
  payment_succeeded: { eyebrow: "إيصال دفعة", cta: "عرض الكفالة" },
  payment_failed: { eyebrow: "تعثّرت دفعة", cta: "معالجة الدفع" },
  report_published: { eyebrow: "تقرير أثر", cta: "قراءة التقرير" },
  report_rejected: { eyebrow: "التقرير يحتاج تصحيحاً", cta: "فتح التقرير" },
  other: { eyebrow: "إشعار", cta: "فتح المنصّة" },
};

export type NotificationEmailProps = {
  siteName: string;
  siteUrl: string;
  kind: string;
  title: string;
  body?: string;
  /** مسار داخل المنصّة (`/dashboard`)، يُحوَّل إلى رابط مطلق هنا. */
  link?: string;
  unsubscribeUrl: string;
};

export const NotificationEmail = ({
  siteName,
  siteUrl,
  kind,
  title,
  body,
  link,
  unsubscribeUrl,
}: NotificationEmailProps) => {
  const frame = KIND_FRAME[kind] ?? KIND_FRAME["other"]!;
  // الرابط في القاعدة مسارٌ نسبي؛ والبريد يُقرأ خارج المنصّة.
  const href = resolveEmailLink(siteUrl, link);

  return (
    <BrandEmail
      siteName={siteName}
      siteUrl={siteUrl}
      preview={title}
      eyebrow={frame.eyebrow}
      heading={title}
      unsubscribeUrl={unsubscribeUrl}
    >
      {body && <BrandText>{body}</BrandText>}
      <BrandButton href={href}>{frame.cta}</BrandButton>
    </BrandEmail>
  );
};
