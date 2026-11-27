import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * استبقاء وسائط تحديثات الطفل — يستدعيها المجدول يومياً:
 *   POST /api/child-updates/retention  Authorization: Bearer $LOVABLE_CRON_SECRET
 *
 * تحذف من خزنة `child-updates` ملفّات المرفوض بعد 30 يوماً، وتحديثات الطفل
 * المؤرشَف بلا كفالةٍ قائمة بعد CHILD_UPDATES_ARCHIVE_DAYS (365 افتراضاً)، ثم
 * تمحو صفوفها. التفاصيل في `@/lib/child-updates-retention`.
 *
 * كمسارات المجدول الأخرى: حدّ معدّلٍ قبل السرّ، والخطأ يُسجَّل بمرجع الطلب،
 * وينقر نبض HEARTBEAT_URL_RETENTION بعد كلّ تشغيل.
 */
async function guard(request: Request): Promise<Response | null> {
  const { hitRateLimit, identityOf, tooManyRequests } = await import("@/lib/rate-limit");
  const verdict = await hitRateLimit("cron", await identityOf(request));
  if (!verdict.allowed) return tooManyRequests(verdict);
  return authenticateCronRequest(request);
}

export const Route = createFileRoute("/api/child-updates/retention")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await guard(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { archiveDaysFrom, runChildUpdatesRetention } =
          await import("@/lib/child-updates-retention");
        const { logServerError, logServerEvent } = await import("@/lib/server-log");
        const { pingHeartbeat } = await import("@/lib/heartbeat.server");
        type Db = Parameters<typeof runChildUpdatesRetention>[0];
        try {
          const summary = await runChildUpdatesRetention(
            supabaseAdmin as unknown as Db,
            archiveDaysFrom(process.env["CHILD_UPDATES_ARCHIVE_DAYS"]),
          );
          logServerEvent("info", "child_updates.retention.run", { summary });
          pingHeartbeat("HEARTBEAT_URL_RETENTION", summary.storageFailed === 0);
          return Response.json({ ok: true, ...summary });
        } catch (error) {
          const ref = logServerError("child_updates.retention.failed", error);
          pingHeartbeat("HEARTBEAT_URL_RETENTION", false);
          return Response.json({ ok: false, error: "retention_failed", ref }, { status: 503 });
        }
      },
    },
  },
});
