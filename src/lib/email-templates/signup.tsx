import * as React from "react";

import { BrandButton, BrandCode, BrandEmail, BrandFallbackLink, BrandText } from "./_brand";
import { emailCopy, type EmailLocale } from "./copy";

interface SignupEmailProps {
  siteName: string;
  siteUrl: string;
  recipient: string;
  confirmationUrl: string;
  /** حين بدأ التسجيل برمزٍ في الصفحة: يكتبه ويكمل حيث كان. */
  token?: string;
  locale?: EmailLocale;
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
  token,
  locale = "ar",
}: SignupEmailProps) => {
  const c = emailCopy(locale).signup;
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
        {c.bodyA} <strong dir="ltr">{recipient}</strong>
        {c.bodyB}
      </BrandText>
      {token && (
        <>
          <BrandText>{c.codeLead}</BrandText>
          <BrandCode token={token} />
          <BrandText>{c.orButton}</BrandText>
        </>
      )}
      <BrandButton href={confirmationUrl}>{c.cta}</BrandButton>
      <BrandFallbackLink url={confirmationUrl} locale={locale} />
    </BrandEmail>
  );
};

export default SignupEmail;
