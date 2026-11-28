import * as React from "react";

import { BrandButton, BrandEmail, BrandFallbackLink, BrandText } from "./_brand";
import { emailCopy, type EmailLocale } from "./copy";

interface RecoveryEmailProps {
  siteName: string;
  siteUrl: string;
  confirmationUrl: string;
  locale?: EmailLocale;
}

export const RecoveryEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
  locale = "ar",
}: RecoveryEmailProps) => {
  const c = emailCopy(locale).recovery;
  return (
    <BrandEmail
      locale={locale}
      siteName={siteName}
      siteUrl={siteUrl}
      preview={c.preview(siteName)}
      eyebrow={c.eyebrow}
      heading={c.heading}
      footNote={c.foot}
    >
      <BrandText>{c.body(siteName)}</BrandText>
      <BrandButton href={confirmationUrl}>{c.cta}</BrandButton>
      <BrandFallbackLink url={confirmationUrl} locale={locale} />
    </BrandEmail>
  );
};

export default RecoveryEmail;
