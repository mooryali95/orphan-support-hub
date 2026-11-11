import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * صحّة التشغيل — محميّةٌ بسرّ المجدول في الطريقين، ولا تُعيد تفاصيل داخلية.
 *
 * POST — الفحص الدوري (يومياً، ويصحّ كل ساعة). القاعدة تحسب الفحوص وتسجّل
 *        التشغيل وتقرّر هل يُنبَّه المشرفون؛ التنبيه إشعارٌ داخل التطبيق
 *        والبريد يتبعه من صندوق الإرسال. وينقر نبض HEARTBEAT_URL_OPS.
 * GET  — لمراقب التوفّر الخارجي (ARC-06): هل يردّ التطبيق، وهل تصل القاعدة،
 *        وهل اكتمل إعداد كلّ ميزة — قيمٌ منطقية لا أسماء ولا رسائل.
 *
 * والخطأ يُسجَّل في سجلّ الخادم بمعرّف الطلب، والردّ يحمل الرمز والمرجع
 * وحدهما (APP-11).
 */
async function guard(request: Request): Promise<Response | null> {
  const { hitRateLimit, identityOf, tooManyRequests } = await import("@/lib/rate-limit");
  const verdict = await hitRateLimit("cron", await identityOf(request));
  if (!verdict.allowed) return tooManyRequests(verdict);
  return authenticateCronRequest(request);
}

type Rpc = {
  rpc: (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export const Route = createFileRoute("/api/ops/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await guard(request);
        if (denied) return denied;
        const { configSummary } = await import("@/lib/env.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { logServerError } = await import("@/lib/server-log");
        const { error } = await (supabaseAdmin as unknown as Rpc).rpc("is_admin");
        const ref = error ? logServerError("ops.health.db_unreachable", error) : null;
        const config = configSummary();
        const ok = !error && config.ok;
        return Response.json(
          {
            ok,
            database: !error,
            config_ok: config.ok,
            features: config.features,
            ...(ref ? { ref } : {}),
          },
          { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
        );
      },

      POST: async ({ request }) => {
        const denied = await guard(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { logServerError } = await import("@/lib/server-log");
        const { pingHeartbeat } = await import("@/lib/heartbeat.server");
        const { data, error } = await (supabaseAdmin as unknown as Rpc).rpc("ops_record_run");
        if (error) {
          const ref = logServerError("ops.health.record_failed", error);
          pingHeartbeat("HEARTBEAT_URL_OPS", false);
          return Response.json({ ok: false, error: "ops_check_failed", ref }, { status: 503 });
        }
        const r = data as { level: string; notified: number };
        pingHeartbeat("HEARTBEAT_URL_OPS", true);
        // لا تُعاد تفاصيل الفحوص: المسار محميّ، لكن سجلّات المجدول ليست مكان الحال.
        return Response.json({ ok: true, level: r.level, notified: r.notified });
      },
    },
  },
});
