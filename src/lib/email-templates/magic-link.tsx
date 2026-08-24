import * as React from 'react'

import {
  BrandButton,
  BrandEmail,
  BrandFallbackLink,
  BrandText,
} from './_brand'

interface MagicLinkEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <BrandEmail
    siteName={siteName}
    siteUrl={siteUrl}
    preview={`رابط دخولك إلى ${siteName}`}
    eyebrow="رابط دخول"
    heading="ادخل بنقرة واحدة، دون كلمة مرور"
    footNote="الرابط صالح لمدة قصيرة ولمرّة واحدة. إن لم تطلبه، تجاهل الرسالة ولن يتغيّر شيء."
  >
    <BrandText>
      اضغط الزر أدناه للدخول إلى حسابك في {siteName}.
    </BrandText>
    <BrandButton href={confirmationUrl}>تسجيل الدخول</BrandButton>
    <BrandFallbackLink url={confirmationUrl} />
  </BrandEmail>
)

export default MagicLinkEmail
