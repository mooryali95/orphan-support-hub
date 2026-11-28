import * as React from "react";
import { render } from "@react-email/render";
import { createFileRoute } from "@tanstack/react-router";
import { emailLocale, type EmailLocale } from "@/lib/email-templates/copy";
import { TEMPLATES } from "@/lib/email-templates/registry";
import { safeEqual } from "@/lib/integrations/auth";

// Renders all registered templates with their previewData.
// Gated by LOVABLE_API_KEY — only the Go API calls this.

export const Route = createFileRoute("/lovable/email/transactional/preview")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        // Verify the caller is authorized with LOVABLE_API_KEY
        const authHeader = request.headers.get("Authorization");
        const token = authHeader?.replace(/^Bearer\s+/i, "");
        if (!safeEqual(token, apiKey)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        // لغة المعاينة اختيارية في الجسم: «ar» افتراضاً، و«en» لمستلمٍ اختار الإنجليزية.
        let locale: EmailLocale = "ar";
        try {
          const body = (await request.json()) as { locale?: unknown } | null;
          locale = emailLocale(body?.locale);
        } catch {
          locale = "ar";
        }

        const templateNames = Object.keys(TEMPLATES);
        const results: Array<{
          templateName: string;
          displayName: string;
          subject: string;
          html: string;
          status: "ready" | "preview_data_required" | "render_failed";
          errorMessage?: string;
        }> = [];

        for (const name of templateNames) {
          const entry = TEMPLATES[name];
          if (!entry) continue;
          const displayName = entry.displayName || name;

          if (!entry.previewData) {
            results.push({
              templateName: name,
              displayName,
              subject: "",
              html: "",
              status: "preview_data_required",
            });
            continue;
          }

          try {
            const data = {
              ...entry.previewData,
              ...(entry.previewByLocale?.[locale] ?? {}),
              locale,
            };
            const html = await render(React.createElement(entry.component, data));
            const resolvedSubject =
              typeof entry.subject === "function" ? entry.subject(data) : entry.subject;

            results.push({
              templateName: name,
              displayName,
              subject: resolvedSubject,
              html,
              status: "ready",
            });
          } catch (err) {
            console.error("Failed to render template for preview", {
              template: name,
              error: err,
            });
            results.push({
              templateName: name,
              displayName,
              subject: "",
              html: "",
              status: "render_failed",
              errorMessage: err instanceof Error ? err.message : String(err),
            });
          }
        }

        return Response.json({ templates: results });
      },
    },
  },
});
