import * as React from "react";

import { BrandCode, BrandEmail, BrandText } from "./_brand";
import { emailCopy, type EmailLocale } from "./copy";

interface ReauthenticationEmailProps {
  siteName: string;
  siteUrl: string;
  token: string;
  locale?: EmailLocale;
}

export const ReauthenticationEmail = ({
  siteName,
  siteUrl,
  token,
  locale = "ar",
}: ReauthenticationEmailProps) => {
  const c = emailCopy(locale).reauth;
  return (
    <BrandEmail
      locale={locale}
      siteName={siteName}
      siteUrl={siteUrl}
      preview={c.preview}
      eyebrow={c.eyebrow}
      heading={c.heading}
      footNote={c.foot}
    >
      <BrandText>{c.body}</BrandText>
      <BrandCode token={token} />
    </BrandEmail>
  );
};

export default ReauthenticationEmail;
