import * as React from "react";
import { createAuthEmailHandler } from "@lovable.dev/email-js";
import { createFileRoute } from "@tanstack/react-router";
import { SignupEmail } from "@/lib/email-templates/signup";
import { InviteEmail } from "@/lib/email-templates/invite";
import { MagicLinkEmail } from "@/lib/email-templates/magic-link";
import { RecoveryEmail } from "@/lib/email-templates/recovery";
import { EmailChangeEmail } from "@/lib/email-templates/email-change";
import { ReauthenticationEmail } from "@/lib/email-templates/reauthentication";
import { BRAND } from "@/config/brand";
import { authEmailFrame as frame } from "@/lib/email-templates/copy";

// Configuration
const SITE_NAME = `${BRAND.name}`;
const SENDER_DOMAIN = "notify.ioco.sunkvalue.com";
const ROOT_DOMAIN = "ioco.sunkvalue.com";
const FROM_DOMAIN = "ioco.sunkvalue.com";
const SITE_URL = `https://${ROOT_DOMAIN}`;

// The SDK handler owns verification, dispatch, and retry semantics; this file
// owns only the email decisions: subjects, templates, and per-type props.
export const Route = createFileRoute("/lovable/email/auth/webhook")({
  server: {
    handlers: {
      POST: ({ request }) => {
        const handler = createAuthEmailHandler({
          apiKey: process.env["LOVABLE_API_KEY"]!,
          from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
          senderDomain: SENDER_DOMAIN,
          sendUrl: process.env["LOVABLE_SEND_URL"],
          // لغة المستلم من عنوان العودة (authEmailLocale)، والاسم بلغته (brandFor).
          emails: {
            signup: (data) => {
              const { locale, name, c } = frame(data.url);
              return {
                subject: c.signup.subject,
                element: React.createElement(SignupEmail, {
                  siteName: name,
                  siteUrl: SITE_URL,
                  recipient: data.email,
                  confirmationUrl: data.url,
                  token: data.token ?? "",
                  locale,
                }),
              };
            },
            invite: (data) => {
              const { locale, name, c } = frame(data.url);
              return {
                subject: c.invite.subject(name),
                element: React.createElement(InviteEmail, {
                  siteName: name,
                  siteUrl: SITE_URL,
                  confirmationUrl: data.url,
                  locale,
                }),
              };
            },
            magiclink: (data) => {
              const { locale, name, c } = frame(data.url);
              return {
                subject: c.magic.subject(name),
                element: React.createElement(MagicLinkEmail, {
                  siteName: name,
                  siteUrl: SITE_URL,
                  confirmationUrl: data.url,
                  token: data.token ?? "",
                  locale,
                }),
              };
            },
            recovery: (data) => {
              const { locale, name, c } = frame(data.url);
              return {
                subject: c.recovery.subject,
                element: React.createElement(RecoveryEmail, {
                  siteName: name,
                  siteUrl: SITE_URL,
                  confirmationUrl: data.url,
                  locale,
                }),
              };
            },
            email_change: (data) => {
              const { locale, name, c } = frame(data.url);
              return {
                subject: c.change.subject,
                element: React.createElement(EmailChangeEmail, {
                  siteName: name,
                  siteUrl: SITE_URL,
                  oldEmail: data.old_email ?? "",
                  email: data.email,
                  newEmail: data.new_email ?? "",
                  confirmationUrl: data.url,
                  locale,
                }),
              };
            },
            reauthentication: (data) => {
              const { locale, name, c } = frame(data.url);
              return {
                subject: c.reauth.subject,
                element: React.createElement(ReauthenticationEmail, {
                  siteName: name,
                  siteUrl: SITE_URL,
                  token: data.token ?? "",
                  locale,
                }),
              };
            },
          },
        });
        return handler(request);
      },
    },
  },
});
