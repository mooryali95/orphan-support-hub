import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CalendarDays,
  ExternalLink,
  FileText,
  GraduationCap,
  Heart,
  Home,
  Loader2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listReports, listTimeline, TIMELINE_LABELS } from "@/lib/impact.functions";
import { createDocumentReadUrl } from "@/lib/intake.functions";
import { formatDate } from "@/lib/format";

/**
 * أثر الكفالة كما يراه الكافل.
 *
 * هذا هو ما يبرّر استمرار الكفالة. الكافل يدفع شهرياً؛ وما لم يرَ أن
 * الطفل انتقل إلى صفّ أعلى أو أن علاجه تمّ، فالكفالة اقتطاع شهري بلا
 * قصّة — وأول مراجعة للحساب تُنهيه.
 *
 * والتقارير هنا **معتمَدة من الإدارة** حصراً: دالّة القاعدة تحجب غير
 * المعتمَد عن الكافل، فما يصله مُراجَع لا مُدَّعى. وملاحظة الصحّة
 * والمرفقات لا تصله أصلاً (تبقى لدائرة الطفل)، فلا تظهر خانتها له.
 */
export function ImpactPanel({ orphanId, orphanName }: { orphanId: string; orphanName: string }) {
  const fetchReports = useServerFn(listReports);
  const fetchTimeline = useServerFn(listTimeline);
  const readUrl = useServerFn(createDocumentReadUrl);

  const { data: rep, isLoading } = useQuery({
    queryKey: ["reports", orphanId],
    queryFn: () => fetchReports({ data: { orphanId } }),
  });
  const { data: tl } = useQuery({
    queryKey: ["timeline", orphanId],
    queryFn: () => fetchTimeline({ data: { orphanId } }),
  });

  const reports = (rep?.reports ?? []).filter((r) => r.status === "approved");
  const events = tl?.events ?? [];

  async function open(path: string) {
    const res = await readUrl({ data: { path } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  if (isLoading) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 p-4 text-xs">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" /> جارٍ تحميل الأثر…
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-5">
      <section>
        <h4 className="text-sm font-bold">تقارير الأثر</h4>
        {reports.length === 0 ? (
          <p className="text-muted-foreground border-border mt-2 rounded-lg border border-dashed p-4 text-xs leading-6">
            لم يصدر تقرير بعد. تُصدر جهة الرعاية تقريراً دورياً، ولا يظهر لك إلا بعد اعتماد الإدارة
            له.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="border-border bg-card rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <CalendarDays className="text-muted-foreground size-4" aria-hidden="true" />
                  <span className="text-sm font-bold tabular-nums">{r.period}</span>
                  <Badge className="bg-shore-thrive text-white">معتمد</Badge>
                  {r.published_at && (
                    <span className="text-muted-foreground text-xs">
                      نُشر {formatDate(r.published_at)}
                    </span>
                  )}
                </div>

                {r.summary && <p className="mt-2 text-sm leading-7">{r.summary}</p>}

                <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Note icon={GraduationCap} label="التعليم" value={r.education_note} />
                  <Note icon={Heart} label="الصحة" value={r.health_note} />
                  <Note icon={Home} label="المعيشة" value={r.living_note} />
                </dl>

                {r.attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.attachments.map((path, i) => (
                      <Button
                        key={path}
                        size="sm"
                        variant="outline"
                        onClick={() => void open(path)}
                      >
                        <FileText className="size-3" aria-hidden="true" />
                        مرفق {i + 1}
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </Button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {events.length > 0 && (
        <section>
          <h4 className="text-sm font-bold">الخط الزمني</h4>
          <p className="sr-only">الخط الزمني لملف {orphanName}</p>
          <ol className="border-border mt-2 border-s ps-4">
            {events.map((e) => (
              <li key={e.id} className="relative py-2">
                <span
                  className="bg-bridge absolute -start-[1.3rem] top-3.5 size-2 rounded-full"
                  aria-hidden="true"
                />
                <p className="text-sm">
                  {TIMELINE_LABELS[e.event_type] ?? e.event_type}
                  {e.detail && <span className="text-muted-foreground"> — {e.detail}</span>}
                </p>
                <p className="text-muted-foreground text-xs">{formatDate(e.created_at)}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function Note({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof GraduationCap;
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div className="bg-secondary/40 rounded-lg p-3">
      <dt className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-6">{value}</dd>
    </div>
  );
}
