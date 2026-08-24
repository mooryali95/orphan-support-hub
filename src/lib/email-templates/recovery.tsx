import * as React from 'react'

import {
  BrandButton,
  BrandEmail,
  BrandFallbackLink,
  BrandText,
} from './_brand'

interface RecoveryEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <BrandEmail
    siteName={siteName}
    siteUrl={siteUrl}
    preview={`إعادة تعيين كلمة المرور في ${siteName}`}
    eyebrow="أمان الحساب"
    heading="إعادة تعيين كلمة المرور"
    footNote="إن لم تطلب إعادة التعيين فكلمة مرورك الحالية سليمة ولم تتغيّر؛ تجاهل الرسالة."
  >
    <BrandText>
      وصلنا طلب لإعادة تعيين كلمة مرور حسابك في {siteName}. اختر كلمة مرور جديدة من الرابط أدناه.
    </BrandText>
    <BrandButton href={confirmationUrl}>تعيين كلمة مرور جديدة</BrandButton>
    <BrandFallbackLink url={confirmationUrl} />
  </BrandEmail>
)

export default RecoveryEmail
