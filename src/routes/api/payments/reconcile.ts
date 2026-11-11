import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * المطابقة الدورية للمال — يستدعيها المجدول كل ساعة (ويصحّ يومياً):
 *   POST /api/payments/reconcile  Authorization: Bearer $LOVABLE_CRON_SECRET
 *
 * تُنفذ الإلغاء عند نهاية المدّة المدفوعة، وتستأنف الإيقاف المنقضي، وترسل
 * الإشعار الثاني بعد خروج الطفل، وتُنهي جلسات الدفع المهجورة، وتُلغي لدى
 * المزوّد ما ينتظر إلغاءه. التفاصيل في `@/lib/payments/reconcile`.
 */
export const Route = createFileRoute("/api/payments/reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { paymentProvider } = await import("@/lib/payments");
        const { runMoneyReconcile } = await import("@/lib/payments/reconcile");
        type Db = Parameters<typeof runMoneyReconcile>[0];
        try {
          const summary = await runMoneyReconcile(
            supabaseAdmin as unknown as Db,
            paymentProvider(),
          );
          return Response.json({ ok: true, ...summary });
        } catch (error) {
          console.error("[payments/reconcile]", error instanceof Error ? error.message : error);
          return Response.json({ ok: false, error: "reconcile_failed" }, { status: 503 });
        }
      },
    },
  },
});
