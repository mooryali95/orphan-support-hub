import { Link } from "@tanstack/react-router";
import { ArrowLeft, Lock } from "lucide-react";

import {
  ImpactFigure,
  PledgeHead,
  SampleBadge,
  StepChain,
} from "@/components/impact/SupportImpactParts";
import { defineCopy, useCopy, useLocale, intlOf } from "@/lib/locale";
import {
  IMPACT_COHORT_MIN,
  journeySteps,
  sessionShare,
  traitDelta,
  type AreaDevelopment,
  type JourneyStepKey,
  type QualificationImpact,
  type QualificationJourney,
} from "@/lib/support-impact";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/impact/QualificationImpactView", {
  ar: {
    title: "أثر التأهيل",
    lead: "ما تقيّده المنصّة عن التأهيل الذي تموّله: للطفل تقدّم رحلته، وللمجموعة أو المنطقة أو الدولة ما تحقّق فيها مجتمعاً.",
    target: (trait: string) => `السمة المستهدفة: ${trait}`,
    steps: {
      supervisor: "مشرفٌ معيَّن",
      before: "قياسٌ قبلي",
      sessions: "الجلسات",
      after: "قياسٌ بعدي",
    } satisfies Record<JourneyStepKey, string>,
    chain: (done: number) => `${done} من 4 محطّات اكتملت`,
    state: {
      supervisor: "سُجّل التعهّد، وبانتظار تعيين مشرف.",
      before: "المشرف معيَّن، والتالي قياس السمات قبل الرحلة.",
      sessions: "قيست السمات قبل الرحلة، والجلسات جارية.",
      after: "اكتملت الجلسات، والتالي قياس السمات بعد الرحلة.",
    } satisfies Record<JourneyStepKey, string>,
    complete: "تمّت الرحلة: قيست السمات قبلها وبعدها.",
    sessions: (held: number, planned: number) => `${held} من ${planned} جلسة قُبل مخرَجها`,
    sessionsLabel: "جلسات البرنامج",
    privacy:
      "درجات الطفل نفسها لا تُعرض هنا: يراها من أذنت له الإدارة وحده. ما تراه هو أنّ القياس وقع.",
    model: "نموذج السمات",
    areaTitle: (label: string) => `التطوّر في ${label}`,
    fewer: (n: number) => `أقل من ${n}`,
    enrolled: ["أطفالٌ في التأهيل", "ملتحقون ببرنامج"],
    started: ["بدأوا الرحلة", "لهم قياسٌ قبلي"],
    completed: ["أتمّوا الرحلة", "لهم قياسٌ بعدي"],
    held: "جلساتٌ قُبلت",
    planned: (n: string) => `من ${n} مقرّرة`,
    traitsTitle: "حركة السمات",
    traitsLead: "متوسّط كل سمةٍ عند أوّل قياسٍ وعند آخر قياس، من 100.",
    traitRow: (label: string, before: number, latest: number) =>
      `${label}: من ${before} إلى ${latest} من 100`,
    noChange: "لا تغيّر بعد",
    legend: ["أوّل قياس", "ما أُضيف حتى آخر قياس"],
    traitsHidden: (n: number) =>
      `تظهر المتوسّطات حين يكون لـ${n} أطفال أو أكثر قياسٌ قبلي، حمايةً لهم من أن يُعرَفوا.`,
    shareNote: "هذه أرقام المكان كلّه، وتعهّدك أحد ما يموّلها؛ فلا تُنسب إليك وحدك.",
  },
  en: {
    title: "Qualification impact",
    lead: "What the platform records about the qualification you fund: for a child, the journey's progress; for a group, a region or a country, what has been achieved there in aggregate.",
    target: (trait: string) => `Target trait: ${trait}`,
    steps: {
      supervisor: "Supervisor assigned",
      before: "Baseline measured",
      sessions: "Sessions",
      after: "Final measurement",
    } satisfies Record<JourneyStepKey, string>,
    chain: (done: number) => `${done} of 4 stages complete`,
    state: {
      supervisor: "The pledge is recorded; a supervisor is yet to be assigned.",
      before: "A supervisor is assigned; next, the traits are measured before the journey.",
      sessions: "Traits were measured before the journey; the sessions are under way.",
      after: "All sessions are complete; next, the traits are measured after the journey.",
    } satisfies Record<JourneyStepKey, string>,
    complete: "The journey is complete: traits were measured before and after.",
    sessions: (held: number, planned: number) => `${held} of ${planned} sessions accepted`,
    sessionsLabel: "Programme sessions",
    privacy:
      "The child's own scores are not shown here: only those the administration authorizes see them. What you see is that the measurement took place.",
    model: "Trait model",
    areaTitle: (label: string) => `Development in ${label}`,
    fewer: (n: number) => `Fewer than ${n}`,
    enrolled: ["Children in qualification", "enrolled in a programme"],
    started: ["Journeys begun", "with a baseline measurement"],
    completed: ["Journeys completed", "with a final measurement"],
    held: "Sessions accepted",
    planned: (n: string) => `of ${n} planned`,
    traitsTitle: "Trait movement",
    traitsLead: "Each trait's average at the first and at the latest measurement, out of 100.",
    traitRow: (label: string, before: number, latest: number) =>
      `${label}: from ${before} to ${latest} out of 100`,
    noChange: "No change yet",
    legend: ["First measurement", "Added by the latest measurement"],
    traitsHidden: (n: number) =>
      `Averages appear once ${n} or more children have a baseline measurement, so that no child can be identified.`,
    shareNote:
      "These are the figures for the whole place. Your pledge is one of the contributions that fund it, so they are not attributed to you alone.",
  },
});

const BAR =
  "h-full transition-[width] duration-[var(--dur-4)] ease-[var(--ease-settle)] motion-reduce:transition-none";

/** طفلٌ بعينه: محطّات رحلته الأربع، وجلساته المقبولة من المقرّرة. لا درجات. */
function Journey({ journey }: { journey: QualificationJourney }) {
  const c = useCopy(COPY);
  const steps = journeySteps(journey);
  const open = steps.find((s) => s.current);
  const done = steps.filter((s) => s.done).length;
  return (
    <>
      <p className="mt-4 text-sm leading-6">
        <b>{journey.program}</b>
        {journey.trait && (
          <span className="text-muted-foreground"> · {c.target(journey.trait)}</span>
        )}
      </p>
      <div className="mt-4">
        <StepChain
          label={c.chain(done)}
          steps={steps.map((s) => ({ label: c.steps[s.key], done: s.done, current: s.current }))}
        />
      </div>
      <p aria-live="polite" className="mt-3 text-sm leading-6">
        {open ? c.state[open.key] : c.complete}
      </p>
      <div className="mt-4">
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
          <span className="font-bold">{c.sessionsLabel}</span>
          <span className="tabular-nums text-muted-foreground">
            {c.sessions(journey.sessionsHeld, journey.sessionsPlanned)}
          </span>
        </p>
        {/* one tick per session: accepted ones in the identity colour */}
        <div
          role="img"
          aria-label={c.sessions(journey.sessionsHeld, journey.sessionsPlanned)}
          className="mt-2 flex gap-1"
        >
          {Array.from({ length: journey.sessionsPlanned }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-2.5 min-w-0 flex-1 rounded-full transition-colors duration-[var(--dur-3)] motion-reduce:transition-none",
                i < journey.sessionsHeld ? "bg-primary" : "bg-secondary",
              )}
            />
          ))}
        </div>
      </div>
      <p className="mt-4 flex items-start gap-2 text-xs leading-6 text-muted-foreground">
        <Lock className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
        {c.privacy}
      </p>
    </>
  );
}

/** مجموعةٌ أو منطقةٌ أو دولة: مجاميع المكان، ثم حركة كل سمةٍ من أوّل قياسٍ إلى آخره. */
function Area({ area, label }: { area: AreaDevelopment; label: string }) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const n = (v: number | null) =>
    v == null ? c.fewer(IMPACT_COHORT_MIN) : v.toLocaleString(intlOf(locale));
  return (
    <>
      <h4 className="mt-5 font-bold">{c.areaTitle(label)}</h4>
      <dl className="mt-2 grid grid-cols-2 border-y border-border sm:grid-cols-4">
        <ImpactFigure
          label={c.enrolled[0]!}
          unit={c.enrolled[1]!}
          value={n(area.enrolled)}
          strong
          className="pe-4"
        />
        <ImpactFigure
          label={c.started[0]!}
          unit={c.started[1]!}
          value={n(area.started)}
          className="border-s border-border ps-4"
        />
        <ImpactFigure
          label={c.completed[0]!}
          unit={c.completed[1]!}
          value={n(area.completed)}
          className="border-t border-border pe-4 sm:border-s sm:border-t-0 sm:ps-4"
        />
        <ImpactFigure
          label={c.held}
          unit={c.planned(area.sessionsPlanned.toLocaleString(intlOf(locale)))}
          value={area.sessionsHeld.toLocaleString(intlOf(locale))}
          className="border-s border-t border-border ps-4 sm:border-t-0"
        />
      </dl>
      <div
        role="img"
        aria-label={`${c.held}: ${area.sessionsHeld} ${c.planned(String(area.sessionsPlanned))}`}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"
      >
        <span
          className={cn(BAR, "block bg-primary")}
          style={{ width: `${sessionShare(area.sessionsHeld, area.sessionsPlanned) * 100}%` }}
        />
      </div>

      <h4 className="mt-6 font-bold">{c.traitsTitle}</h4>
      {area.traits ? (
        <>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{c.traitsLead}</p>
          <ul className="mt-2">
            {area.traits.map((t) => {
              const before = Math.round(t.before);
              const latest = Math.round(t.latest);
              const delta = traitDelta(t);
              return (
                <li key={t.key} className="border-t border-border py-3 first:border-t-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-bold">{t.label}</p>
                    <p className="flex items-baseline gap-2 whitespace-nowrap text-sm text-muted-foreground">
                      <b dir="ltr" className="font-display text-lg tabular-nums text-foreground">
                        {before}
                      </b>
                      <span aria-hidden="true" className="h-px w-5 self-center bg-bridge" />
                      <b dir="ltr" className="font-display text-xl tabular-nums text-primary">
                        {latest}
                      </b>
                      {delta > 0 ? (
                        <span dir="ltr" className="font-bold tabular-nums text-primary">
                          +{delta}
                        </span>
                      ) : (
                        <span className="text-xs">{c.noChange}</span>
                      )}
                    </p>
                  </div>
                  <div
                    role="img"
                    aria-label={c.traitRow(t.label, before, latest)}
                    className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-secondary"
                  >
                    <span className={cn(BAR, "bg-bridge")} style={{ width: `${before}%` }} />
                    <span
                      className={cn(BAR, "bg-primary")}
                      style={{ width: `${Math.max(0, latest - before)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            {[
              ["bg-bridge", c.legend[0]],
              ["bg-primary", c.legend[1]],
            ].map(([dot, text]) => (
              <span key={text} className="inline-flex items-center gap-2">
                <span aria-hidden="true" className={cn("size-2.5 rounded-full", dot)} />
                {text}
              </span>
            ))}
          </p>
        </>
      ) : (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-dashed border-bridge/50 p-4 text-sm leading-7 text-muted-foreground">
          <Lock className="mt-1.5 size-3.5 shrink-0" aria-hidden="true" />
          {c.traitsHidden(IMPACT_COHORT_MIN)}
        </p>
      )}
      <p className="mt-3 text-xs leading-6 text-muted-foreground">{c.shareNote}</p>
    </>
  );
}

/**
 * «أثر التأهيل»: منظر تطوّر لا منظر مال. الطفل بعينه يُرى تقدّم رحلته (مشرف، قياسٌ قبلي،
 * جلسات، قياسٌ بعدي) بلا درجات؛ والمجموعة أو المنطقة أو الدولة تُرى مجاميعها وحركة
 * متوسّطات السمات. يُقاد بالخصائص وحدها: التجربة تمرّر نماذج موسومة، واللوحة تمرّر قيودها.
 */
export function QualificationImpactView({
  items,
  sample,
  className,
  children,
}: {
  items: QualificationImpact[];
  /** trial figures: the section is labelled as sample data */
  sample?: boolean;
  className?: string;
  /** an optional control strip under the lead (the trial's «قدّم شهراً») */
  children?: React.ReactNode;
}) {
  const c = useCopy(COPY);
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="qualification-impact"
      className={cn("rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-7", className)}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="qualification-impact" className="font-display text-2xl font-bold">
          {c.title}
        </h3>
        {sample && <SampleBadge />}
        <Link
          to="/traits"
          className="ms-auto inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-primary underline-offset-4 hover:underline"
        >
          {c.model}
          <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
        </Link>
      </div>
      <p className="mt-1 max-w-2xl text-sm leading-7 text-muted-foreground">{c.lead}</p>
      {children}
      <ul className="mt-3">
        {items.map((item, i) => (
          <li
            key={item.id}
            className="mo-rise border-t border-border py-5 last:pb-0"
            style={{ ["--i" as string]: i }}
          >
            <PledgeHead item={item} />
            {item.journey ? (
              <Journey journey={item.journey} />
            ) : (
              <Area area={item.area} label={item.label} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
