import * as React from "react";

import { BrandButton, BrandCode, BrandEmail, BrandFallbackLink, BrandText } from "./_brand";

interface MagicLinkEmailProps {
  siteName: string;
  siteUrl: string;
  confirmationUrl: string;
  /** رمزٌ من ستّة أرقام (طوله من إعداد المصادقة) يُكتب في الصفحة نفسها — فلا يغادر الزائر ما كان فيه. */
  token?: string;
}

export const MagicLinkEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
  token,
}: MagicLinkEmailProps) => (
  <BrandEmail
    siteName={siteName}
    siteUrl={siteUrl}
    preview={token ? `رمز دخولك إلى ${siteName}: ${token}` : `رابط دخولك إلى ${siteName}`}
    eyebrow="رابط دخول"
    heading="ادخل بنقرة واحدة، دون كلمة مرور"
    footNote="الرابط صالح لمدة قصيرة ولمرّة واحدة. إن لم تطلبه، تجاهل الرسالة ولن يتغيّر شيء."
  >
    {token && (
      <>
        <BrandText>اكتب هذا الرمز في الصفحة التي طلبته منها:</BrandText>
        <BrandCode token={token} />
        <BrandText>أو اضغط الزر للدخول مباشرة:</BrandText>
      </>
    )}
    {!token && <BrandText>اضغط الزر أدناه للدخول إلى حسابك في {siteName}.</BrandText>}
    <BrandButton href={confirmationUrl}>تسجيل الدخول</BrandButton>
    <BrandFallbackLink url={confirmationUrl} />
  </BrandEmail>
);

export default MagicLinkEmail;
