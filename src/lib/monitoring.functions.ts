import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * مراقبة تصريف الإشعارات.
 *
 * ثلاثة أسئلة تجيب عنها هذه الدالة: هل المخطط جاهز أصلاً، وكم فشل خلال
 * آخر ٢٤ ساعة، وهل الفشل عارض أم متكرّر من قاعدة البيانات — والحالة
 * الأخيرة هي التي تستحقّ تنبيهاً لأنها تعني قاعدة متأخّرة عن الهجرات
 * لا مزوّد بريد متعثّراً.
 *
 * القراءة بعميل المستخدم فتحرسها سياسة «الإدارة فقط» على `dispatch_runs`.
 */

export type DispatchHealth = {
  schema: { ready: boolean; missing: string[] };
  runs24h: number;
  failedRuns24h: number;
  dbErrorRuns24h: number;
  sent24h: number;
  failedEmails24h: number;
  attempts24h: number;
  queue: { pending: number; failed: number };
  lastRun: {
    at: string;
    ok: boolean;
    provider: string | null;
    sent: number;
    failed: number;
    errorKind: string | null;
    error: string | null;
  } | null;
  alerts: string[];
};

export const getDispatchHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { withDispatch, withPhase4 } = await import("@/integrations/supabase/types.extra");
    const { checkDispatchSchema } = await import("@/lib/schema-preflight.server");

    const db = withDispatch(context.supabase);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: runs, error } = await db
      .from("dispatch_runs")
      .select("ok, provider, sent, failed, attempts, error_kind, error, created_at, schema_ready")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);

    // خطأ القراءة هنا يعني «لست مديراً» غالباً؛ لا تفاصيل تُكشف.
    if (error) return { allowed: false as const };

    const schema = await checkDispatchSchema(context.supabase);

    const notes = withPhase4(context.supabase);
    const { count: pending } = await notes
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("email_state", "pending");
    const { count: failedQueue } = await notes
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("email_state", "failed");

    const rows = runs ?? [];
    const dbErrorRuns = rows.filter((r) => r.error_kind === "database" || !r.schema_ready).length;
    const last = rows[0] ?? null;

    const alerts: string[] = [];
    if (!schema.ready) {
      alerts.push(`المخطط ناقص — التصريف موقوف حتى تُطبَّق الهجرات: ${schema.missing.join("، ")}`);
    }
    if (dbErrorRuns >= 3) {
      alerts.push(`تكرّرت أخطاء قاعدة البيانات في التصريف (${dbErrorRuns} مرة خلال ٢٤ ساعة).`);
    }
    if ((failedQueue ?? 0) > 0) {
      alerts.push(`${failedQueue} إشعاراً استنفد محاولاته ولم يُرسل.`);
    }

    const health: DispatchHealth = {
      schema: { ready: schema.ready, missing: schema.missing },
      runs24h: rows.length,
      failedRuns24h: rows.filter((r) => !r.ok).length,
      dbErrorRuns24h: dbErrorRuns,
      sent24h: rows.reduce((a, r) => a + (r.sent ?? 0), 0),
      failedEmails24h: rows.reduce((a, r) => a + (r.failed ?? 0), 0),
      attempts24h: rows.reduce((a, r) => a + (r.attempts ?? 0), 0),
      queue: { pending: pending ?? 0, failed: failedQueue ?? 0 },
      lastRun: last
        ? {
            at: last.created_at,
            ok: last.ok,
            provider: last.provider,
            sent: last.sent ?? 0,
            failed: last.failed ?? 0,
            errorKind: last.error_kind,
            error: last.error,
          }
        : null,
      alerts,
    };

    return { allowed: true as const, health };
  });
