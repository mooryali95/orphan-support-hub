import * as React from "react";

import { BrandButton, BrandEmail, BrandText } from "./_brand";
import { emailCopy, emailLocale } from "./copy";
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

export type NotificationEmailProps = {
  siteName: string;
  siteUrl: string;
  kind: string;
  title: string;
  body?: string;
  /** مسار داخل المنصّة (`/dashboard`)، يُحوَّل إلى رابط مطلق هنا. */
  link?: string;
  unsubscribeUrl: string;
  /** لغة المستلم من حسابه؛ العنوان والنصّ يأتيان جاهزين، والغلاف والزرّ بلغته. */
  locale?: string;
};

export const NotificationEmail = ({
  siteName,
  siteUrl,
  kind,
  title,
  body,
  link,
  unsubscribeUrl,
  locale,
}: NotificationEmailProps) => {
  const lang = emailLocale(locale);
  const kinds = emailCopy(lang).kinds;
  const [eyebrow, cta] = kinds[kind] ?? kinds["other"]!;
  const frame = { eyebrow: eyebrow!, cta: cta! };
  // الرابط في القاعدة مسارٌ نسبي؛ والبريد يُقرأ خارج المنصّة.
  const href = resolveEmailLink(siteUrl, link);

  return (
    <BrandEmail
      locale={lang}
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
