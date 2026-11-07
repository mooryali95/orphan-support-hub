import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { getDispatchHealth } from "@/lib/monitoring.functions";
import { formatDate } from "@/lib/format";

/**
 * مراقبة تصريف الإشعارات.
 *
 * الطابور يعمل في الخلفية، فعطبه صامت: لا أحد يشتكي من بريد لم يصل.
 * هذه اللوحة تجعل الصمت مرئياً — جاهزية المخطط، وفشل آخر ٢٤ ساعة، وعدد
 * المحاولات، وتنبيه صريح حين يتكرّر خطأ قاعدة البيانات.
 */
export function DispatchHealthPanel() {
  const fetchHealth = useServerFn(getDispatchHealth);
  const { data, isLoading } = useQuery({
    queryKey: ["dispatch-health"],
    queryFn: () => fetchHealth(),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  if (!data?.allowed) {
    return (
      <p className="border-border bg-card text-muted-foreground mt-8 rounded-2xl border border-dashed p-8 text-center text-sm">
        لا يمكن قراءة سجلّ التصريف.
      </p>
    );
  }

  const h = data.health;

  return (
    <div className="mt-8 space-y-8">
      {h.alerts.length > 0 ? (
        <div className="border-destructive/40 bg-destructive/5 space-y-2 rounded-2xl border p-5">
          {h.alerts.map((a) => (
            <p key={a} className="text-destructive flex items-start gap-2 text-sm leading-7">
              <AlertTriangle className="mt-1 size-4 shrink-0" />
              <span>{a}</span>
            </p>
          ))}
        </div>
      ) : (
        <p className="border-border bg-card text-shore-thrive flex items-center gap-2 rounded-2xl border p-5 text-sm">
          <CheckCircle2 className="size-4" />
          المخطط جاهز ولا أخطاء متكرّرة خلال آخر 24 ساعة.
        </p>
      )}

      <section>
        <h2 className="text-sm font-bold">آخر 24 ساعة</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Box label="دورات تشغيل" value={String(h.runs24h)} />
          <Box label="دورات فاشلة" value={String(h.failedRuns24h)} tone={h.failedRuns24h > 0} />
          <Box
            label="أخطاء قاعدة بيانات"
            value={String(h.dbErrorRuns24h)}
            tone={h.dbErrorRuns24h > 0}
          />
          <Box label="محاولات إرسال" value={String(h.attempts24h)} />
          <Box label="رسائل أُرسلت" value={String(h.sent24h)} />
          <Box label="رسائل فشلت" value={String(h.failedEmails24h)} tone={h.failedEmails24h > 0} />
          <Box label="في الطابور" value={String(h.queue.pending)} />
          <Box label="استنفدت المحاولات" value={String(h.queue.failed)} tone={h.queue.failed > 0} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-bold">آخر دورة</h2>
        <div className="border-border bg-card mt-4 rounded-2xl border p-5 text-sm leading-7">
          {h.lastRun ? (
            <>
              <p>
                {formatDate(h.lastRun.at)} — مزوّد {h.lastRun.provider ?? "—"} — أُرسل{" "}
                {h.lastRun.sent}، فشل {h.lastRun.failed}
              </p>
              {h.lastRun.error && (
                <p className="text-destructive mt-2 text-xs" dir="ltr">
                  [{h.lastRun.errorKind}] {h.lastRun.error}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">لم تُسجَّل أي دورة تصريف بعد.</p>
          )}
        </div>
      </section>

      {!h.schema.ready && (
        <section>
          <h2 className="text-sm font-bold">نواقص المخطط</h2>
          <ul className="text-destructive mt-3 list-disc space-y-1 pe-5 text-xs" dir="ltr">
            {h.schema.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Box({ label, value, tone }: { label: string; value: string; tone?: boolean }) {
  return (
    <div className="border-border bg-card rounded-2xl border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`mt-1 text-xl font-extrabold ${tone ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}
