import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * الفحص الدوري لصحّة التشغيل — يستدعيه المجدول (يومياً، ويصحّ كل ساعة).
 *
 * القاعدة تحسب الفحوص وتسجّل التشغيل وتقرّر هل يُنبَّه المشرفون: عند
 * تغيّر الحال، أو مرّةً كل يومٍ ما دام غير سليم، أو عند العودة إلى
 * السلامة. التنبيه إشعارٌ داخل التطبيق، والبريد يتبعه من صندوق الإرسال
 * (ويحترم حجب البريد). لذلك هذا المسار قصير عمداً ولا يرسل شيئاً بنفسه.
 */
export const Route = createFileRoute("/api/ops/health")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const client = supabaseAdmin as unknown as {
          rpc: (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
        };
        const { data, error } = await client.rpc("ops_record_run");
        if (error) {
          console.error("[ops/health] ops_record_run failed:", error.message);
          return Response.json({ ok: false, error: "ops_check_failed" }, { status: 503 });
        }
        const r = data as { level: string; notified: number };
        // لا تُعاد تفاصيل الفحوص: المسار محميّ، لكن سجلّات المجدول ليست مكان الحال.
        return Response.json({ ok: true, level: r.level, notified: r.notified });
      },
    },
  },
});
