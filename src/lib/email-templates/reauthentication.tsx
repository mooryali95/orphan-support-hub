import * as React from 'react'

import { BrandCode, BrandEmail, BrandText } from './_brand'

interface ReauthenticationEmailProps {
  siteName: string
  siteUrl: string
  token: string
}

export const ReauthenticationEmail = ({
  siteName,
  siteUrl,
  token,
}: ReauthenticationEmailProps) => (
  <BrandEmail
    siteName={siteName}
    siteUrl={siteUrl}
    preview="رمز التحقّق الخاص بك"
    eyebrow="تحقّق"
    heading="رمز التحقّق"
    footNote="لا تُشارك هذا الرمز مع أي شخص، ولا يطلبه منك فريقنا مطلقاً."
  >
    <BrandText>أدخل الرمز التالي لإتمام العملية:</BrandText>
    <BrandCode token={token} />
  </BrandEmail>
)

export default ReauthenticationEmail
