import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * تصريف صندوق البريد — مدخل المجدول.
 *
 * غلافٌ رقيق حول الطريق الواحد (src/lib/email-outbox.server.ts): المطالبة
 * من claim_email_batch التي تعيد فحص إلغاء الاشتراك والأنواع المكتومة وحجب
 * بريد المنصّة لحظة الإرسال، وقالب Lovable برابط إلغاء الاشتراك، والوسم
 * بعد كلّ محاولة. كان هنا قبل ذلك مسارٌ ثانٍ (Resend) يقرأ الطابور مباشرةً
 * ويتخطّى ذلك كلّه، ويخترع نطاقاً احتياطياً لروابطه (ARC-02/APP-05).
 *
 * الجدولة المقترحة: كلّ ٥ دقائق، POST بـ`Authorization: Bearer $LOVABLE_CRON_SECRET`
 * (docs/runbook.ar.md). وكلّ تشغيلٍ يُسجَّل في dispatch_runs، وينقر نبض
 * HEARTBEAT_URL_DISPATCH إن ضُبط.
 */
export const Route = createFileRoute("/api/notifications/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { hitRateLimit, identityOf, tooManyRequests } = await import("@/lib/rate-limit");
        const verdict = await hitRateLimit("cron", await identityOf(request));
        if (!verdict.allowed) return tooManyRequests(verdict);
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { withDispatch } = await import("@/integrations/supabase/types.extra");
        const { logServerError } = await import("@/lib/server-log");
        const { pingHeartbeat } = await import("@/lib/heartbeat.server");
        const runs = withDispatch(supabaseAdmin);
        const PROVIDER = "lovable";

        // فحص المخطط قبل أي عمل: قاعدة متأخّرة عن الهجرات تُفشل كل صفّ
        // على حدة وتستهلك محاولاته، فالتوقّف المبكر أنظف من الفشل البطيء.
        const { checkDispatchSchema } = await import("@/lib/schema-preflight.server");
        const schema = await checkDispatchSchema(supabaseAdmin);
        if (!schema.ready) {
          const ref = logServerError("dispatch.schema_not_ready", schema.missing.join(" | "));
          await runs.from("dispatch_runs").insert({
            ok: false,
            schema_ready: false,
            provider: PROVIDER,
            error_kind: "database",
            error: `مخطط ناقص (${schema.missing.length})`,
          });
          pingHeartbeat("HEARTBEAT_URL_DISPATCH", false);
          return Response.json({ ok: false, error: "schema_not_ready", ref }, { status: 503 });
        }

        const { drainOutbox, liveOutboxDeps } = await import("@/lib/email-outbox.server");
        const out = await drainOutbox(await liveOutboxDeps(), 25);

        if (out.halted === "email_unconfigured" || out.halted === "base_url_missing") {
          // لا مفتاح أو لا عنوان أصل: لا يُعدّ فشلاً ولا تُستهلك محاولات. الطابور
          // ينتظر، والإشعارات داخل التطبيق وصلت أصلاً.
          await runs.from("dispatch_runs").insert({
            ok: true,
            provider: PROVIDER,
            error_kind: "unconfigured",
            error: out.halted,
          });
          pingHeartbeat("HEARTBEAT_URL_DISPATCH", true);
          return Response.json({ ok: true, provider: PROVIDER, sent: 0, skipped: out.halted });
        }
        if (out.halted === "claim_failed") {
          await runs.from("dispatch_runs").insert({
            ok: false,
            provider: PROVIDER,
            error_kind: "database",
            error: "claim_failed",
          });
          pingHeartbeat("HEARTBEAT_URL_DISPATCH", false);
          return Response.json({ ok: false, error: "claim_failed" }, { status: 500 });
        }

        await runs.from("dispatch_runs").insert({
          ok: out.failed === 0,
          provider: PROVIDER,
          sent: out.sent,
          failed: out.failed,
          skipped: out.suppressed,
          attempts: out.claimed,
          ...(out.failed > 0 ? { error_kind: "provider", error: `${out.failed} فشل` } : {}),
        });
        pingHeartbeat("HEARTBEAT_URL_DISPATCH", out.failed === 0);
        return Response.json({
          ok: true,
          provider: PROVIDER,
          sent: out.sent,
          failed: out.failed,
          skipped: out.suppressed,
        });
      },
    },
  },
});
