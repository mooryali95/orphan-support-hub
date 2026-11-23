import * as React from "react";

import { BrandButton, BrandEmail, BrandFallbackLink, BrandText } from "./_brand";

interface InviteEmailProps {
  siteName: string;
  siteUrl: string;
  confirmationUrl: string;
}

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <BrandEmail
    siteName={siteName}
    siteUrl={siteUrl}
    preview={`دعوة للانضمام إلى ${siteName}`}
    eyebrow="دعوة"
    heading="دُعيت للانضمام إلى المنصّة"
    footNote="إن وصلتك هذه الدعوة عن طريق الخطأ، فتجاهلها آمن تماماً."
  >
    <BrandText>
      وُجّهت إليك دعوة للانضمام إلى {siteName}؛ حيث يلتقي الكافلون بمكاتب الندوة وشركائها الميدانيين
      حول ملفّات موثّقة، وتتحوّل الكفالة من إحسانٍ عابر إلى مسار نماء مُتابَع.
    </BrandText>
    <BrandButton href={confirmationUrl}>قبول الدعوة</BrandButton>
    <BrandFallbackLink url={confirmationUrl} />
  </BrandEmail>
);

export default InviteEmail;
