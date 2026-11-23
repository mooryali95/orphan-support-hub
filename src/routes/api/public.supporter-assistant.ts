import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/supporter-assistant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleAssistant } = await import("@/lib/assistant/handler.server");
        return handleAssistant(request);
      },
      DELETE: async ({ request }) => {
        const { handleAssistant } = await import("@/lib/assistant/handler.server");
        return handleAssistant(request, true);
      },
    },
  },
});
