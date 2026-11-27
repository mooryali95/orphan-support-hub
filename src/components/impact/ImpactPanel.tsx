import { useQuery } from "@tanstack/react-query";
import { useDataFn, useDataKey } from "@/lib/data-port";
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
import { listReports, listTimeline } from "@/lib/impact.functions";
import { eventLabel } from "@/lib/event-labels";
import { openPrivateFile } from "@/hooks/usePrivateFile";
import { formatDate } from "@/lib/format";
import { Name } from "@/components/kit/Name";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";

const COPY = defineCopy("components/impact/ImpactPanel", {
  ar: {
    openFailed: "تعذّر فتح الوثيقة",
    loading: "جارٍ تحميل الأثر…",
    reports: "تقارير الأثر",
    noReports:
      "لم يصدر تقرير بعد. تُصدر الجهة الميدانية تقريراً دورياً، ولا يظهر لك إلا بعد اعتماد الإدارة له.",
    approved: "معتمد",
    published: (date: string) => `نُشر ${date}`,
    education: "التعليم",
    health: "الصحة",
    living: "المعيشة",
    attachment: (n: number) => `مرفق ${n}`,
    timeline: "الخط الزمني",
    timelineOf: "الخط الزمني لملف",
  },
  en: {
    openFailed: "Couldn't open the document",
    loading: "Loading impact…",
    reports: "Impact reports",
    noReports:
      "No report yet. The field organization issues a periodic report, and you see it only after the administration approves it.",
    approved: "Approved",
    published: (date: string) => `Published ${date}`,
    education: "Education",
    health: "Health",
    living: "Living conditions",
    attachment: (n: number) => `Attachment ${n}`,
    timeline: "Timeline",
    timelineOf: "Timeline for the file of",
  },
});

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
  const fetchReports = useDataFn("impact.reports", listReports);
  const fetchTimeline = useDataFn("impact.timeline", listTimeline);
  const c = useCopy(COPY);
  const locale = useLocale();

  const { data: rep, isLoading } = useQuery({
    queryKey: useDataKey(["reports", orphanId]),
    queryFn: () => fetchReports({ data: { orphanId } }),
  });
  const { data: tl } = useQuery({
    queryKey: useDataKey(["timeline", orphanId]),
    queryFn: () => fetchTimeline({ data: { orphanId } }),
  });

  const reports = (rep?.reports ?? []).filter((r) => r.status === "approved");
  const events = tl?.events ?? [];

  async function open(path: string) {
    // يُنزَّل بجلسة القارئ لحظة الفتح؛ لا رابط موقَّعاً يبقى بعد سحب الإذن.
    if (!(await openPrivateFile("orphan-documents", path))) toast.error(c.openFailed);
  }

  if (isLoading) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 p-4 text-xs">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" /> {c.loading}
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-5">
      <section>
        <h4 className="text-sm font-bold">{c.reports}</h4>
        {reports.length === 0 ? (
          <p className="text-muted-foreground border-border mt-2 rounded-lg border border-dashed p-4 text-xs leading-6">
            {c.noReports}
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="border-border bg-card rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <CalendarDays className="text-muted-foreground size-4" aria-hidden="true" />
                  <bdi className="text-sm font-bold tabular-nums">{r.period}</bdi>
                  <Badge className="bg-shore-thrive text-white">{c.approved}</Badge>
                  {r.published_at && (
                    <span className="text-muted-foreground text-xs">
                      {c.published(formatDate(r.published_at, locale))}
                    </span>
                  )}
                </div>

                {r.summary && <p className="mt-2 text-sm leading-7">{r.summary}</p>}

                <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Note icon={GraduationCap} label={c.education} value={r.education_note} />
                  <Note icon={Heart} label={c.health} value={r.health_note} />
                  <Note icon={Home} label={c.living} value={r.living_note} />
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
                        {c.attachment(i + 1)}
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
          <h4 className="text-sm font-bold">{c.timeline}</h4>
          <p className="sr-only">
            {c.timelineOf} <Name>{orphanName}</Name>
          </p>
          <ol className="border-border mt-2 border-s ps-4">
            {events.map((e) => (
              <li key={e.id} className="relative py-2">
                <span
                  className="bg-bridge absolute -start-[1.3rem] top-3.5 size-2 rounded-full"
                  aria-hidden="true"
                />
                <p className="text-sm">
                  {eventLabel(e.event_type, locale)}
                  {e.detail && <span className="text-muted-foreground"> — {e.detail}</span>}
                </p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {formatDate(e.created_at, locale)}
                </p>
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
