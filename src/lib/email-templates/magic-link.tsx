import * as React from "react";

import { BrandButton, BrandCode, BrandEmail, BrandFallbackLink, BrandText } from "./_brand";
import { emailCopy, type EmailLocale } from "./copy";

interface MagicLinkEmailProps {
  siteName: string;
  siteUrl: string;
  confirmationUrl: string;
  /** رمزٌ من ستّة أرقام (طوله من إعداد المصادقة) يُكتب في الصفحة نفسها، فلا يغادر الزائر ما كان فيه. */
  token?: string;
  locale?: EmailLocale;
}

export const MagicLinkEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
  token,
  locale = "ar",
}: MagicLinkEmailProps) => {
  const c = emailCopy(locale).magic;
  return (
    <BrandEmail
      locale={locale}
      siteName={siteName}
      siteUrl={siteUrl}
      preview={token ? c.previewCode(siteName, token) : c.previewLink(siteName)}
      eyebrow={c.eyebrow}
      heading={c.heading}
      footNote={c.foot}
    >
      {token && (
        <>
          <BrandText>{c.codeLead}</BrandText>
          <BrandCode token={token} />
          <BrandText>{c.orButton}</BrandText>
        </>
      )}
      {!token && <BrandText>{c.noCode(siteName)}</BrandText>}
      <BrandButton href={confirmationUrl}>{c.cta}</BrandButton>
      <BrandFallbackLink url={confirmationUrl} locale={locale} />
    </BrandEmail>
  );
};

export default MagicLinkEmail;
