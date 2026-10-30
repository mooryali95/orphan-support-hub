import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertOctagon, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { getOpsHealth, type OpsLevel } from "@/lib/monitoring.functions";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const LEVEL: Record<OpsLevel, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: "سليم", tone: "text-shore-thrive", Icon: CheckCircle2 },
  warn: { label: "يحتاج انتباهاً", tone: "text-bridge-ink", Icon: AlertTriangle },
  critical: { label: "حرج", tone: "text-destructive", Icon: AlertOctagon },
};
const ORDER: Record<OpsLevel, number> = { critical: 0, warn: 1, ok: 2 };

/**
 * صحّة التشغيل — ثمانية فحوص في مكانٍ واحد: سلسلة السلامة، وأحداث الدفع،
 * والدفعات المعلّقة، والتعارضات، وطلبات فكّ القفل، والبريد، والمزامنة،
 * ونصاب المشرفين. غير السليم أوّلاً، لأن السليم لا يحتاج قراءة.
 */
export function OpsHealthPanel() {
  const fetchHealth = useServerFn(getOpsHealth);
  const { data, isLoading } = useQuery({
    queryKey: ["ops-health"],
    queryFn: () => fetchHealth(),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data?.allowed) {
    return (
      <p className="mt-8 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {data?.missing
          ? "فحوص صحّة التشغيل تعمل بعد تطبيق حزمة الإصدار على القاعدة."
          : "لا يمكن قراءة صحّة التشغيل."}
      </p>
    );
  }

  const h = data.health;
  const head = LEVEL[h.level];
  const checks = [...h.checks].sort((a, b) => ORDER[a.level] - ORDER[b.level]);

  return (
    <section className="mt-8 space-y-4" aria-labelledby="ops-h">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ops-h" className={cn("flex items-center gap-2 text-lg font-bold", head.tone)}>
          <head.Icon className="size-5" aria-hidden="true" />
          صحّة التشغيل: {head.label}
        </h2>
        <p className="text-xs text-muted-foreground">
          {h.last_run
            ? `آخر فحصٍ دوري ${formatDate(h.last_run.at)}`
            : "لم يعمل الفحص الدوري بعد — اضبط المجدول على ‎/api/ops/health"}
        </p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {checks.map((c) => {
          const l = LEVEL[c.level];
          return (
            <li
              key={c.key}
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-4 text-sm leading-6",
                c.level === "critical"
                  ? "border-destructive/40 bg-destructive/5"
                  : c.level === "warn"
                    ? "border-bridge/40 bg-accent/50"
                    : "border-border bg-card",
              )}
            >
              <l.Icon className={cn("mt-0.5 size-4 shrink-0", l.tone)} aria-hidden="true" />
              <span>
                {c.title}
                <span className="sr-only"> — {l.label}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
