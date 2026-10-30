import * as React from "react";

import { BrandButton, BrandCode, BrandEmail, BrandFallbackLink, BrandText } from "./_brand";

interface SignupEmailProps {
  siteName: string;
  siteUrl: string;
  recipient: string;
  confirmationUrl: string;
  /** حين بدأ التسجيل برمزٍ في الصفحة: يكتبه ويكمل حيث كان. */
  token?: string;
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
  token,
}: SignupEmailProps) => (
  <BrandEmail
    siteName={siteName}
    siteUrl={siteUrl}
    preview={`تأكيد بريدك للانضمام إلى ${siteName}`}
    eyebrow="تفعيل الحساب"
    heading="خطوة واحدة ويبدأ عبورك معنا"
    footNote="إن لم تُنشئ هذا الحساب فلا حاجة لأي إجراء؛ يكفي تجاهل الرسالة."
  >
    <BrandText>
      سجّلنا طلب إنشاء حساب باستخدام البريد <strong dir="ltr">{recipient}</strong>. أكّد ملكيتك لهذا
      البريد لتفعيل الحساب والوصول إلى ملفّات الأيتام الموثّقة.
    </BrandText>
    {token && (
      <>
        <BrandText>اكتب هذا الرمز في الصفحة التي طلبته منها:</BrandText>
        <BrandCode token={token} />
        <BrandText>أو أكّد بالزر:</BrandText>
      </>
    )}
    <BrandButton href={confirmationUrl}>تأكيد البريد</BrandButton>
    <BrandFallbackLink url={confirmationUrl} />
  </BrandEmail>
);

export default SignupEmail;
