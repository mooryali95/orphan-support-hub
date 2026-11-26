import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, GraduationCap, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { VerificationBadge } from "@/components/orphans/VerificationBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { listReports, type ProgressReportView } from "@/lib/impact.functions";
import { getOrphanQualification } from "@/lib/qualification.functions";
import type { PublicQualification, QualificationStage } from "@/integrations/supabase/types.extra";
import { formatDate, isolate } from "@/lib/format";
import { defineCopy, pluralOf, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/sponsorship/ChildTimeline", {
  ar: {
    label: (name: string) => `آخر ما في رحلة ${name}`,
    trust: "حالة الملف",
    trustHint: "درجة التحقق وشهره، بلا تفاصيل من الملف.",
    report: "آخر تقرير معتمد",
    reportPeriod: (period: string) => `تقرير ${period}`,
    publishedOn: (date: string) => `نُشر ${date}`,
    noReport: "لم يُعتمد تقريرٌ بعد. يصلك هنا حين تعتمده الإدارة.",
    reportFailed: "تعذّر تحميل التقرير الآن.",
    track: "مسار التأهيل",
    noTrack: "لم يُسجَّل في مسار تأهيلٍ بعد.",
    stageOf: (n: number) => `المحطّة ${n} من 6`,
    moreTracks: pluralOf(
      {
        one: "ومسارٌ آخر",
        two: "ومساران آخران",
        few: "و{0} مسارات أخرى",
        many: "و{0} مساراً آخر",
        other: "و{0} مسار آخر",
      },
      0,
      "ar",
    ),
    stages: {
      concept: "المفهوم",
      trait: "السمة",
      system: "النظام",
      actions: "الأفعال",
      measurement: "القياس",
      qualified: "الأهلية",
    } as Record<QualificationStage, string>,
  },
  en: {
    label: (name: string) => `Latest in ${name}'s journey`,
    trust: "File status",
    trustHint: "Verification level and month, with no file details.",
    report: "Latest approved report",
    reportPeriod: (period: string) => `Report for ${period}`,
    publishedOn: (date: string) => `Published ${date}`,
    noReport: "No report approved yet. It appears here once the administration approves it.",
    reportFailed: "The report couldn't load right now.",
    track: "Qualification track",
    noTrack: "Not enrolled in a qualification track yet.",
    stageOf: (n: number) => `Stage ${n} of 6`,
    moreTracks: pluralOf({ one: "and {0} more track", other: "and {0} more tracks" }),
    stages: {
      concept: "Concept",
      trait: "Trait",
      system: "System",
      actions: "Actions",
      measurement: "Measurement",
      qualified: "Qualified",
    } as Record<QualificationStage, string>,
  },
});

const STAGES: QualificationStage[] = [
  "concept",
  "trait",
  "system",
  "actions",
  "measurement",
  "qualified",
];

function latestReport(reports: ProgressReportView[]): ProgressReportView | null {
  const approved = reports.filter((r) => r.status === "approved");
  approved.sort((a, b) =>
    (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at),
  );
  return approved[0] ?? null;
}

/**
 * خطّ الطفل في لوحة الكافل: حالة الملف، وآخر تقرير معتمد، وموضعه في مسار التأهيل.
 *
 * كلّ ما هنا ممّا يحقّ للكافل أصلاً: التقرير من `orphan_progress_reports` (تحجب
 * الصحّة والمرفقات عنه)، والمسار من البطاقة العامّة للتأهيل، والشارة من
 * `public_verification` (درجةٌ وشهر — لا سبب تنبيهٍ ولا قيمة حقل).
 */
export function ChildTimeline({ orphanId, name }: { orphanId: string; name: string }) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const fetchReports = useServerFn(listReports);
  const fetchQualification = useServerFn(getOrphanQualification);
  const reports = useQuery({
    queryKey: ["reports", orphanId],
    queryFn: () => fetchReports({ data: { orphanId } }),
  });
  const qualification = useQuery({
    queryKey: ["qualification", orphanId],
    queryFn: () => fetchQualification({ data: { orphanId } }),
  });

  const report = latestReport(reports.data?.reports ?? []);
  const programs = qualification.data?.programs ?? [];

  return (
    <ol aria-label={c.label(name)} className="relative mt-4 space-y-4 ps-8">
      {/* الخيط الرأسي: يبدأ من مركز أوّل أيقونة وينتهي بآخرها */}
      <span aria-hidden="true" className="absolute inset-y-3 start-[0.6875rem] w-px bg-border" />
      <Step icon={<ShieldCheck className="size-3.5" strokeWidth={2} />} title={c.trust}>
        <div className="flex flex-wrap items-center gap-2">
          <VerificationBadge orphanId={orphanId} />
          <span className="text-xs text-muted-foreground">{c.trustHint}</span>
        </div>
      </Step>

      <Step icon={<FileText className="size-3.5" strokeWidth={2} />} title={c.report}>
        {reports.isPending ? (
          <div className="space-y-1.5" aria-hidden="true">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full max-w-sm" />
          </div>
        ) : reports.isError || reports.data?.ok === false ? (
          <p className="text-sm text-muted-foreground">{c.reportFailed}</p>
        ) : report ? (
          <div>
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-semibold">{c.reportPeriod(isolate(report.period))}</span>
              {report.published_at && (
                <span className="text-xs text-muted-foreground">
                  {c.publishedOn(formatDate(report.published_at, locale))}
                </span>
              )}
            </p>
            {(report.summary || report.education_note) && (
              <p className="mt-1 line-clamp-3 max-w-prose text-sm leading-7 text-pretty text-muted-foreground">
                {report.summary || report.education_note}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm leading-7 text-muted-foreground">{c.noReport}</p>
        )}
      </Step>

      <Step icon={<GraduationCap className="size-3.5" strokeWidth={2} />} title={c.track}>
        {qualification.isPending ? (
          <Skeleton className="h-8 w-full max-w-sm" aria-hidden="true" />
        ) : programs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{c.noTrack}</p>
        ) : (
          <TrackProgress program={programs[0]!} more={programs.length - 1} />
        )}
      </Step>
    </ol>
  );
}

function TrackProgress({ program, more }: { program: PublicQualification; more: number }) {
  const c = useCopy(COPY);
  const reached = Math.max(1, STAGES.indexOf(program.stage) + 1);
  return (
    <div className="max-w-sm">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <bdi dir="auto" className="font-semibold">
          {program.program}
        </bdi>
        <span className="text-xs text-muted-foreground tabular-nums">
          {c.stageOf(reached)} · {c.stages[program.stage]}
        </span>
      </p>
      <div className="mt-2 grid grid-cols-6 gap-1" aria-hidden="true">
        {STAGES.map((s, i) => (
          <span
            key={s}
            className={cn("h-1.5 rounded-full", i < reached ? "bg-primary" : "bg-secondary")}
          />
        ))}
      </div>
      {more > 0 && <p className="mt-1.5 text-xs text-muted-foreground">{c.moreTracks(more)}</p>}
    </div>
  );
}

function Step({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className="absolute -start-8 top-0 grid size-6 place-items-center rounded-full bg-card text-primary shadow-[0_0_0_1px_rgb(0_0_0/0.1)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.12)]"
      >
        {icon}
      </span>
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      <div className="mt-1">{children}</div>
    </li>
  );
}
