import * as React from "react";

import { BrandButton, BrandEmail, BrandFallbackLink, BrandText } from "./_brand";
import { emailCopy, type EmailLocale } from "./copy";

interface EmailChangeEmailProps {
  siteName: string;
  siteUrl: string;
  oldEmail: string;
  email: string;
  newEmail: string;
  confirmationUrl: string;
  locale?: EmailLocale;
}

export const EmailChangeEmail = ({
  siteName,
  siteUrl,
  oldEmail,
  newEmail,
  confirmationUrl,
  locale = "ar",
}: EmailChangeEmailProps) => {
  const c = emailCopy(locale).change;
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
      <BrandText>
        {c.bodyA} <strong dir="ltr">{oldEmail}</strong> {c.bodyB}{" "}
        <strong dir="ltr">{newEmail}</strong>
        {c.bodyC}
      </BrandText>
      <BrandButton href={confirmationUrl}>{c.cta}</BrandButton>
      <BrandFallbackLink url={confirmationUrl} locale={locale} />
    </BrandEmail>
  );
};

export default EmailChangeEmail;
