import * as React from 'react'

import {
  BrandButton,
  BrandEmail,
  BrandFallbackLink,
  BrandText,
} from './_brand'

interface EmailChangeEmailProps {
  siteName: string
  siteUrl: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  siteUrl,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <BrandEmail
    siteName={siteName}
    siteUrl={siteUrl}
    preview={`تأكيد تغيير البريد في ${siteName}`}
    eyebrow="أمان الحساب"
    heading="تأكيد بريدك الجديد"
    footNote="لن يُنفَّذ التغيير قبل التأكيد. إن لم تطلبه، تجاهل الرسالة وراجع أمان حسابك."
  >
    <BrandText>
      طُلب تغيير بريد الحساب من <strong dir="ltr">{oldEmail}</strong> إلى{' '}
      <strong dir="ltr">{newEmail}</strong>. أكّد العنوان الجديد لإتمام التغيير.
    </BrandText>
    <BrandButton href={confirmationUrl}>تأكيد التغيير</BrandButton>
    <BrandFallbackLink url={confirmationUrl} />
  </BrandEmail>
)

export default EmailChangeEmail
