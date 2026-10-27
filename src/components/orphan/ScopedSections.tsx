import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { CheckCircle2, CircleDashed, Clock, Lock, RotateCcw } from "lucide-react";

import { formatDate } from "@/lib/format";
import {
  getOrphanGroup,
  getOrphanJourney,
  getOrphanReports,
  getOrphanTraits,
  STAGE_LABELS,
  UNIT_STATUS_LABELS,
  type GroupView,
  type JourneyView,
  type ReportsView,
  type TraitsView,
} from "@/lib/scopes.functions";
import { cn } from "@/lib/utils";

/**
 * أقسام صفحة الطفل بحسب النطاقات.
 *
 * لكل قسمٍ بابه في القاعدة. ما لم يُمنح يظهر مقفلاً بجملةٍ واحدة تدلّ
 * على طريقه (طلب الاطّلاع)، لا يختفي فيظنّ الداعم أنه غير موجود.
 */
export function ScopedSections({
  orphanId,
  onRequest,
}: {
  orphanId: string;
  onRequest?: (() => void) | undefined;
}) {
  const q = { orphanId };
  const journeyQ = useQuery({
    queryKey: ["scoped-journey", orphanId],
    queryFn: useServerFn(getOrphanJourney).bind(null, { data: q }),
  });
  const traitsQ = useQuery({
    queryKey: ["scoped-traits", orphanId],
    queryFn: useServerFn(getOrphanTraits).bind(null, { data: q }),
  });
  const groupQ = useQuery({
    queryKey: ["scoped-group", orphanId],
    queryFn: useServerFn(getOrphanGroup).bind(null, { data: q }),
  });
  const reportsQ = useQuery({
    queryKey: ["scoped-reports", orphanId],
    queryFn: useServerFn(getOrphanReports).bind(null, { data: q }),
  });

  // الردّ يمرّ مسلسلاً فيفقد نوعه؛ الشكل معروف من الدالّة في القاعدة.
  const journey = { data: parse<JourneyView>(journeyQ.data) };
  const traits = { data: parse<TraitsView>(traitsQ.data) };
  const group = { data: parse<GroupView>(groupQ.data) };
  const reports = { data: parse<ReportsView>(reportsQ.data) };

  return (
    <div className="mt-6 space-y-6">
      <Section title="مجموعته" locked={group.data && !group.data.allowed} onRequest={onRequest}>
        {group.data?.allowed &&
          (group.data.group ? (
            <div className="text-sm">
              <p className="font-semibold">{group.data.group.name}</p>
              <p className="mt-1 text-muted-foreground">
                {[group.data.group.region, group.data.group.institution]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {group.data.group.supervisor && (
                <p className="mt-2">
                  المشرف الأساسي: <span className="font-medium">{group.data.group.supervisor}</span>
                </p>
              )}
              {group.data.group.members.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {group.data.group.members.map((m) => (
                    <span key={m.code} className="rounded-full bg-secondary px-2.5 py-1 text-xs">
                      {m.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">لم يُسنَد إلى مجموعة بعد.</p>
          ))}
      </Section>

      <Section title="رحلته" locked={journey.data && !journey.data.allowed} onRequest={onRequest}>
        {journey.data?.allowed &&
          (journey.data.enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">لم يلتحق ببرنامج بعد.</p>
          ) : (
            journey.data.enrollments.map((e, i) => (
              <div key={i} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{e.program}</p>
                  {e.stage && (
                    <span className="text-xs text-muted-foreground">
                      المرحلة: {STAGE_LABELS[e.stage] ?? e.stage}
                    </span>
                  )}
                </div>
                {e.total != null && e.total > 0 && (
                  <div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.round(((e.accepted ?? 0) / e.total) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {e.accepted} من {e.total} جلسات مقبولة
                    </p>
                  </div>
                )}
                {e.units && (
                  <ol className="space-y-2">
                    {e.units.map((u) => (
                      <li key={u.ordinal} className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">
                            {u.ordinal}. {u.title}
                          </span>
                          <UnitBadge status={u.status} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{u.focus}</p>
                        {u.evidence && (
                          <p className="mt-2 text-sm">
                            <span className="text-muted-foreground">المخرَج: </span>
                            {u.evidence}
                          </p>
                        )}
                        {u.note && (
                          <p className="mt-1 text-sm">
                            <span className="text-muted-foreground">تقويم المشرف: </span>
                            {u.note}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))
          ))}
      </Section>

      <Section title="سماته" locked={traits.data && !traits.data.allowed} onRequest={onRequest}>
        {traits.data?.allowed &&
          (traits.data.traits.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا قياسات بعد.</p>
          ) : (
            <ul className="space-y-3">
              {traits.data.traits.map((t) => (
                <li key={t.trait_id}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span>
                      <span className="font-medium">{t.name}</span>
                      <span className="ms-2 text-xs text-muted-foreground">
                        {t.dimension_label}
                      </span>
                    </span>
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {t.first_percent ?? "—"}% ← {t.latest_percent ?? "—"}%
                    </span>
                  </div>
                  {/* الأول خطٌّ رمادي، والأخير أخضر فوقه: يُقرأ التطوّر لا الحكم. */}
                  <div className="relative mt-1.5 h-2 rounded-full bg-secondary">
                    <div
                      className="absolute inset-y-0 start-0 rounded-full bg-muted-foreground/30"
                      style={{ width: `${t.first_percent ?? 0}%` }}
                    />
                    <div
                      className="absolute inset-y-0 start-0 rounded-full bg-primary/80"
                      style={{ width: `${t.latest_percent ?? 0}%`, height: "50%", top: "25%" }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ))}
      </Section>

      <Section
        title="التقارير"
        locked={reports.data && !reports.data.allowed}
        onRequest={onRequest}
      >
        {reports.data?.allowed &&
          (reports.data.progress.length + reports.data.field.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا تقارير منشورة بعد.</p>
          ) : (
            <ul className="space-y-3">
              {reports.data.progress.map((r) => (
                <li key={`p-${r.period}`} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">تقرير {r.period}</p>
                  {r.summary && <p className="mt-1">{r.summary}</p>}
                  {r.education && (
                    <p className="mt-1 text-muted-foreground">التعليم: {r.education}</p>
                  )}
                  {r.living && <p className="mt-1 text-muted-foreground">المعيشة: {r.living}</p>}
                </li>
              ))}
              {reports.data.field.map((r, i) => (
                <li key={`f-${i}`} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.office}
                    {r.published_at && ` · ${formatDate(r.published_at)}`}
                    {r.attachments > 0 && ` · ${r.attachments} صورة موثّقة`}
                  </p>
                  {r.body && <p className="mt-1 whitespace-pre-line">{r.body}</p>}
                </li>
              ))}
            </ul>
          ))}
      </Section>
    </div>
  );
}

function parse<T>(raw: string | undefined): T | undefined {
  return raw ? (JSON.parse(raw) as T) : undefined;
}

function Section({
  title,
  locked,
  onRequest,
  children,
}: {
  title: string;
  locked: boolean | undefined;
  onRequest?: (() => void) | undefined;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        {title}
        {locked && <Lock className="size-4 text-muted-foreground" aria-label="مقفل" />}
      </h2>
      <div className="mt-4">
        {locked ? (
          <p className="text-sm text-muted-foreground">
            يُفتح بإذنٍ من الإدارة.{" "}
            {onRequest && (
              <button
                type="button"
                onClick={onRequest}
                className="font-medium text-primary underline"
              >
                اطلب الاطّلاع
              </button>
            )}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

const UNIT_ICON = {
  accepted: { icon: CheckCircle2, cls: "text-shore-thrive" },
  submitted: { icon: CircleDashed, cls: "text-bridge-ink" },
  returned: { icon: RotateCcw, cls: "text-bridge-ink" },
  pending: { icon: Clock, cls: "text-muted-foreground" },
} as const;

function UnitBadge({ status }: { status: keyof typeof UNIT_ICON }) {
  const { icon: Icon, cls } = UNIT_ICON[status];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs", cls)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {UNIT_STATUS_LABELS[status]}
    </span>
  );
}
