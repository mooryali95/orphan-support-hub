import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * تصريف صندوق البريد.
 *
 * الإشعار يُكتب في نفس معاملة الحدث الذي أنتجه، والبريد يُرسل من هنا
 * لاحقاً. الفصل مقصود: نداء HTTP إلى مزوّد خارجي داخل معاملة قاعدة
 * بيانات يربط عمر القفل بزمن شبكة لا نتحكّم فيه — فبطء المزوّد يصير
 * بطأً في القاعدة كلّها.
 *
 * وأثره العملي أن غياب مفتاح الإرسال لا يُسقط شيئاً: الإشعارات داخل
 * التطبيق تصل كما هي، والبريد يبقى معلّقاً حتى يُضبط المفتاح ثم يخرج.
 */

/** حدّ الدفعة الواحدة: يُبقي زمن الطلب معقولاً ويُجزّئ الفشل. */
const BATCH = 25;

/** بعد ثلاث محاولات يُعدّ الفشل دائماً لا عارضاً. */
const MAX_ATTEMPTS = 3;

export const Route = createFileRoute("/api/notifications/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { emailProvider, renderNotificationEmail } = await import("@/lib/email");
        const provider = emailProvider();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { withPhase4 } = await import("@/integrations/supabase/types.extra");
        const db = withPhase4(supabaseAdmin);

        if (!provider.isConfigured()) {
          // لا مفتاح: لا يُعدّ هذا فشلاً ولا تُستهلك محاولات. الطابور
          // ينتظر، والإشعارات داخل التطبيق وصلت أصلاً.
          return Response.json({
            ok: true,
            provider: provider.id,
            sent: 0,
            skipped: "unconfigured",
          });
        }

        const { data: pending, error } = await db
          .from("notifications")
          .select("id, user_id, kind, title, body, link, email_attempts")
          .eq("email_state", "pending")
          .lt("email_attempts", MAX_ATTEMPTS)
          .order("created_at", { ascending: true })
          .limit(BATCH);

        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        if (!pending || pending.length === 0) {
          return Response.json({ ok: true, provider: provider.id, sent: 0 });
        }

        const { data: recipients } = await db.rpc("notification_recipients", {
          _ids: pending.map((n) => n.id),
        });
        const emailOf = new Map(
          ((recipients ?? []) as Array<{ id: string; email: string | null }>).map((r) => [
            r.id,
            r.email,
          ]),
        );

        const baseUrl = process.env["PUBLIC_BASE_URL"] ?? "https://ioco.app";
        let sent = 0;
        let failed = 0;

        for (const n of pending) {
          const to = emailOf.get(n.id);
          if (!to) {
            // مستخدم بلا بريد: لا شيء يُرسَل، ولا معنى لإبقائه معلّقاً.
            await db
              .from("notifications")
              .update({ email_state: "skipped", email_error: "لا بريد للمستلم" })
              .eq("id", n.id);
            continue;
          }

          const mail = renderNotificationEmail({
            to,
            kind: n.kind,
            title: n.title,
            body: n.body,
            link: n.link,
            baseUrl,
          });

          const res = await provider.send(mail);
          const attempts = (n.email_attempts ?? 0) + 1;

          if (res.ok) {
            sent += 1;
            await db
              .from("notifications")
              .update({
                email_state: "sent",
                email_attempts: attempts,
                email_sent_at: new Date().toISOString(),
                email_error: null,
              })
              .eq("id", n.id);
          } else {
            failed += 1;
            // غير القابل للإعادة يُغلَق فوراً؛ والقابل يبقى معلّقاً حتى
            // يستنفد محاولاته، فلا يدور الطابور على رسالة ميّتة.
            const exhausted = !res.retryable || attempts >= MAX_ATTEMPTS;
            await db
              .from("notifications")
              .update({
                email_state: exhausted ? "failed" : "pending",
                email_attempts: attempts,
                email_error: res.error.slice(0, 500),
              })
              .eq("id", n.id);
          }
        }

        return Response.json({ ok: true, provider: provider.id, sent, failed });
      },
    },
  },
});
