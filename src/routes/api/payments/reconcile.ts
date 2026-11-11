import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * المطابقة الدورية للمال — يستدعيها المجدول كل ساعة (ويصحّ يومياً):
 *   POST /api/payments/reconcile  Authorization: Bearer $LOVABLE_CRON_SECRET
 *
 * تُنفذ الإلغاء عند نهاية المدّة المدفوعة، وتستأنف الإيقاف المنقضي، وترسل
 * الإشعار الثاني بعد خروج الطفل، وتُنهي جلسات الدفع المهجورة، وتُلغي لدى
 * المزوّد ما ينتظر إلغاءه. التفاصيل في `@/lib/payments/reconcile`.
 *
 * كمسارات المجدول الأخرى: حدّ معدّلٍ قبل السرّ، والخطأ يُسجَّل في سجلّ الخادم
 * بمعرّف الطلب والردّ يحمل الرمز والمرجع وحدهما (APP-11)، وينقر نبض
 * HEARTBEAT_URL_RECONCILE بعد كلّ تشغيل (ARC-06).
 */
async function guard(request: Request): Promise<Response | null> {
  const { hitRateLimit, identityOf, tooManyRequests } = await import("@/lib/rate-limit");
  const verdict = await hitRateLimit("cron", await identityOf(request));
  if (!verdict.allowed) return tooManyRequests(verdict);
  return authenticateCronRequest(request);
}

export const Route = createFileRoute("/api/payments/reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await guard(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { paymentProvider } = await import("@/lib/payments");
        const { runMoneyReconcile } = await import("@/lib/payments/reconcile");
        const { logServerError, logServerEvent } = await import("@/lib/server-log");
        const { pingHeartbeat } = await import("@/lib/heartbeat.server");
        type Db = Parameters<typeof runMoneyReconcile>[0];
        try {
          const summary = await runMoneyReconcile(
            supabaseAdmin as unknown as Db,
            paymentProvider(),
          );
          logServerEvent("info", "payments.reconcile.run", { summary });
          pingHeartbeat("HEARTBEAT_URL_RECONCILE", true);
          return Response.json({ ok: true, ...summary });
        } catch (error) {
          const ref = logServerError("payments.reconcile.failed", error);
          pingHeartbeat("HEARTBEAT_URL_RECONCILE", false);
          return Response.json({ ok: false, error: "reconcile_failed", ref }, { status: 503 });
        }
      },
    },
  },
});
