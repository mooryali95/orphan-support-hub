import * as React from "react";
import { render } from "@react-email/render";
import { createFileRoute } from "@tanstack/react-router";
import { safeEqual } from "@/lib/integrations/auth";
import { SignupEmail } from "@/lib/email-templates/signup";
import { InviteEmail } from "@/lib/email-templates/invite";
import { MagicLinkEmail } from "@/lib/email-templates/magic-link";
import { RecoveryEmail } from "@/lib/email-templates/recovery";
import { EmailChangeEmail } from "@/lib/email-templates/email-change";
import { ReauthenticationEmail } from "@/lib/email-templates/reauthentication";
import { BRAND } from "@/config/brand";

// Configuration
const SITE_NAME = `${BRAND.name}`;
const ROOT_DOMAIN = "ioco.sunkvalue.com";

// Sample data for preview mode ONLY (not used in actual email sending).
// URLs are baked in at scaffold time from the project's real data.
// The sample email uses a fixed placeholder (RFC 6761 .test TLD) so the Go backend
// can always find-and-replace it with the actual recipient when sending test emails,
// even if the project's domain has changed since the template was scaffolded.
const SAMPLE_PROJECT_URL = "https://orphan-support-link.lovable.app";
const SAMPLE_EMAIL = "user@example.test";

// كل مدخلة تُركّب قالبها بخصائصه هي، فتبقى الخصائص تحت فحص المُترجم.
// لو فُصلت المكوّنات عن بياناتها في خريطتين متوازيتين لضاع هذا الفحص،
// إذ لا يعرف المُترجم أيّ بيانات تخصّ أيّ قالب.
const EMAIL_PREVIEWS: Record<string, () => React.ReactElement> = {
  signup: () =>
    React.createElement(SignupEmail, {
      siteName: SITE_NAME,
      siteUrl: SAMPLE_PROJECT_URL,
      recipient: SAMPLE_EMAIL,
      confirmationUrl: SAMPLE_PROJECT_URL,
    }),
  invite: () =>
    React.createElement(InviteEmail, {
      siteName: SITE_NAME,
      siteUrl: SAMPLE_PROJECT_URL,
      confirmationUrl: SAMPLE_PROJECT_URL,
    }),
  magiclink: () =>
    React.createElement(MagicLinkEmail, {
      siteName: SITE_NAME,
      siteUrl: SAMPLE_PROJECT_URL,
      confirmationUrl: SAMPLE_PROJECT_URL,
    }),
  recovery: () =>
    React.createElement(RecoveryEmail, {
      siteName: SITE_NAME,
      siteUrl: SAMPLE_PROJECT_URL,
      confirmationUrl: SAMPLE_PROJECT_URL,
    }),
  email_change: () =>
    React.createElement(EmailChangeEmail, {
      siteName: SITE_NAME,
      siteUrl: SAMPLE_PROJECT_URL,
      oldEmail: SAMPLE_EMAIL,
      email: SAMPLE_EMAIL,
      newEmail: SAMPLE_EMAIL,
      confirmationUrl: SAMPLE_PROJECT_URL,
    }),
  reauthentication: () =>
    React.createElement(ReauthenticationEmail, {
      siteName: SITE_NAME,
      siteUrl: SAMPLE_PROJECT_URL,
      token: "123456",
    }),
};

export const Route = createFileRoute("/lovable/email/auth/preview")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];

        if (!apiKey) {
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        // Verify the caller is authorized with LOVABLE_API_KEY
        const authHeader = request.headers.get("Authorization");
        if (!safeEqual(authHeader, `Bearer ${apiKey}`)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let type: string;
        try {
          const body = await request.json();
          if (typeof body?.type !== "string") {
            return Response.json({ error: "Field 'type' must be a string" }, { status: 400 });
          }
          type = body.type;
        } catch {
          return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
        }

        // hasOwn لا الفهرسة وحدها: `type` يأتي من الطلب، و`EMAIL_PREVIEWS["constructor"]`
        // يُرجع دالة موروثة من Object.prototype فتمرّ فحص الصدق ثم تنفجر عند العرض.
        const buildPreview = Object.hasOwn(EMAIL_PREVIEWS, type) ? EMAIL_PREVIEWS[type] : undefined;

        if (!buildPreview) {
          return Response.json({ error: `Unknown email type: ${type}` }, { status: 400 });
        }

        const html = await render(buildPreview());

        return new Response(html, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
    },
  },
});
