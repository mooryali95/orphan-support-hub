import { createFileRoute } from "@tanstack/react-router";

import { handle } from "@/lib/sso/launch.server";

/**
 * الدخول من منصّة الندوة — `/api/sso/wamy` (POST نموذجٌ بحقل `token` وحده).
 * المنطق كلّه في src/lib/sso/launch.server.ts (ومختبَرٌ هناك).
 */
export const Route = createFileRoute("/api/sso/wamy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData().catch(() => null);
        const t = form?.get("token");
        return handle(request, typeof t === "string" ? t : null);
      },
    },
  },
});
