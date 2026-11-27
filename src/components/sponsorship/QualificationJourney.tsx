import { Check, GraduationCap, Lock, Sparkles } from "lucide-react";

import { monthLabel } from "@/components/sponsorship/sponsor-format";
import type { QualificationStage } from "@/integrations/supabase/types.extra";
import { isolate } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { CORE_TRAIT_THRESHOLD, stageReached } from "@/lib/qualification.functions";
import type { SponsorQualification } from "@/lib/scopes.functions";
import { cn } from "@/lib/utils";

const STAGES: readonly QualificationStage[] = [
  "concept",
  "trait",
  "system",
  "actions",
  "measurement",
  "qualified",
];

const COPY = defineCopy("components/sponsorship/QualificationJourney", {
  ar: {
    title: "رحلة التأهيل",
    emptyTitle: "لم يبدأ مسار التأهيل بعد",
    emptyText: (name: string) =>
      `حين يلتحق ${name} ببرنامج تأهيل، تظهر هنا محطّته من ستّ والجلسات التي اجتازها.`,
    stages: {
      concept: "المفهوم",
      trait: "السمة",
      system: "النظام",
      actions: "الأفعال",
      measurement: "القياس",
      qualified: "الأهلية",
    } as Record<QualificationStage, string>,
    questions: {
      concept: "ما المعنى الحاكم الذي نبدأ منه؟",
      trait: "أيّ بنيةٍ داخلية نريد أن نبنيها؟",
      system: "كيف نُشغّل المفهوم ليبني السمة؟",
      actions: "ما الأفعال التي صارت تصدر عنه؟",
      measurement: "كيف نقيس التحوّل؟",
      qualified: "ما القابلية التي استقرّت؟",
    } as Record<QualificationStage, string>,
    stepOf: (n: number, label: string, state: string) => `المحطّة ${n} من 6: ${label}، ${state}`,
    reached: "بلغها",
    current: "المحطّة الحالية",
    ahead: "لم يبلغها بعد",
    stations: "محطّات التأهيل الستّ",
    sessions: (done: number, total: number) => `${done} من ${total} جلسات اجتازها`,
    workingOn: "يعمل الآن على:",
    passedIn: (month: string) => `اجتازها في ${month}`,
    submitted: "سلّمها، وهي قيد تقويم المشرف",
    traits: "السمات",
    traitsLead: "هل بلغت كلّ سمةٍ حدّها الأساسي في آخر قياس، كما يرصده المشرف.",
    traitPassed: "بلغت الحدّ الأساسي",
    traitBuilding: "قيد البناء",
    private:
      "مخرجات الجلسات وملاحظات المشرف وتفاصيل السمات تبقى للدائرة القريبة من الطفل، وتُطلب بإذن.",
  },
  en: {
    title: "Qualification journey",
    emptyTitle: "The qualification track has not started yet",
    emptyText: (name: string) =>
      `When ${name} joins a qualification programme, their stage of six and the sessions they have passed appear here.`,
    stages: {
      concept: "Concept",
      trait: "Trait",
      system: "System",
      actions: "Actions",
      measurement: "Measurement",
      qualified: "Qualified",
    } as Record<QualificationStage, string>,
    questions: {
      concept: "What guiding meaning do we start from?",
      trait: "Which inner quality do we want to build?",
      system: "How do we run the concept so it builds the trait?",
      actions: "Which actions now come from the child?",
      measurement: "How do we measure the change?",
      qualified: "Which ability has settled?",
    } as Record<QualificationStage, string>,
    stepOf: (n: number, label: string, state: string) => `Step ${n} of 6: ${label}, ${state}`,
    reached: "reached",
    current: "current step",
    ahead: "not reached yet",
    stations: "The six qualification steps",
    sessions: (done: number, total: number) => `${done} of ${total} sessions passed`,
    workingOn: "Working on now:",
    passedIn: (month: string) => `Passed in ${month}`,
    submitted: "Handed in, awaiting the supervisor's review",
    traits: "Traits",
    traitsLead:
      "Whether each trait reached its core level at the latest measure, as the supervisor records it.",
    traitPassed: "Reached the core level",
    traitBuilding: "Still building",
    private:
      "Session outputs, supervisor notes and trait details stay with the child's close circle and are shared only with permission.",
  },
});

/**
 * المحطّات الستّ كما تبلغها الرحلة فعلاً (`stageReached`): أفقيّةٌ تتبع اتجاه الصفحة، وعموديّةٌ
 * تحت 400px. لا نسبة داخل محطّة ولا تقدّمٌ مفترض؛ وكلّ محطّةٍ تُعلن موضعها لقارئ الشاشة.
 */
export function QualificationStepper({ stage }: { stage: QualificationStage | null }) {
  const c = useCopy(COPY);
  return (
    <ol aria-label={c.stations} className="grid gap-2 min-[400px]:grid-cols-6 min-[400px]:gap-1">
      {STAGES.map((s, i) => {
        const done = stage !== null && stageReached(stage, s);
        const now = stage === s;
        return (
          <li
            key={s}
            aria-label={c.stepOf(i + 1, c.stages[s], now ? c.current : done ? c.reached : c.ahead)}
            aria-current={now ? "step" : undefined}
            className="flex items-center gap-3 min-[400px]:block min-[400px]:text-center"
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full min-[400px]:hidden",
                done ? "bg-primary text-primary-foreground" : "bg-secondary",
              )}
            >
              {done && <Check className="size-3.5" strokeWidth={3} />}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "hidden h-1.5 rounded-full min-[400px]:block",
                done ? (now ? "bg-bridge" : "bg-primary") : "bg-secondary",
              )}
            />
            <span
              className={cn(
                "text-sm min-[400px]:mt-1.5 min-[400px]:block min-[400px]:text-xs min-[400px]:leading-4",
                now
                  ? "font-bold text-foreground"
                  : done
                    ? "text-foreground"
                    : "text-muted-foreground",
              )}
            >
              {c.stages[s]}
              {/* الحالة بالنصّ لا باللون وحده */}
              {done && !now && <span className="sr-only"> ({c.reached})</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * رحلة التأهيل — ما يُبنى بالكفالة: البرنامج، والمحطّة من ستّ وسؤالها، والجلسات التي اجتازها
 * الطفل ومتى، وهل بلغت كلّ سمةٍ حدّها الأساسي. لا مخرجات ولا ملاحظات مشرف ولا درجات:
 * هذه للدائرة القريبة وبإذن، ولا يُعرض إلا ما يعيده `sponsor_qualification`.
 */
export function QualificationJourney({
  q,
  name,
}: {
  q: SponsorQualification | undefined;
  name: string;
}) {
  const c = useCopy(COPY);
  const locale = useLocale();
  if (!q || !q.allowed) return null;
  if (q.programs.length === 0 && q.growth.length === 0) {
    return (
      <section
        className="rounded-3xl border border-dashed border-border p-6 text-center sm:p-8"
        aria-labelledby="qj-empty"
      >
        <GraduationCap
          className="mx-auto size-8 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <h2 id="qj-empty" className="mt-3 font-semibold">
          {c.emptyTitle}
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-7 text-pretty text-muted-foreground">
          {c.emptyText(isolate(name))}
        </p>
        <div className="mx-auto mt-5 max-w-lg text-start">
          <QualificationStepper stage={null} />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6" aria-labelledby="qj-h">
      <h2 id="qj-h" className="flex items-center gap-2 text-lg font-bold">
        <GraduationCap className="size-5 text-primary" strokeWidth={1.5} aria-hidden="true" />
        {c.title}
      </h2>

      {q.programs.map((p, pi) => {
        const stage = (STAGES as readonly string[]).includes(p.stage)
          ? (p.stage as QualificationStage)
          : null;
        const current = p.units.find((u) => u.status !== "accepted");
        return (
          <article
            key={pi}
            className="rounded-3xl bg-card p-5 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)] sm:p-6"
          >
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-bold text-balance">{p.program}</h3>
              {p.total > 0 && (
                <p className="text-sm text-muted-foreground tabular-nums">
                  {c.sessions(p.accepted, p.total)}
                </p>
              )}
            </header>

            <div className="mt-5">
              <QualificationStepper stage={stage} />
            </div>
            {stage && (
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                <span className="font-semibold text-foreground">{c.stages[stage]}:</span>{" "}
                {c.questions[stage]}
              </p>
            )}

            {current && (
              <p className="mt-5 flex items-start gap-2 rounded-2xl bg-accent/60 p-4 text-sm leading-7">
                <Sparkles className="mt-1 size-4 shrink-0 text-bridge-ink" aria-hidden="true" />
                <span>
                  <strong>{c.workingOn}</strong> {current.title}
                  <span className="block text-xs text-muted-foreground">{current.focus}</span>
                </span>
              </p>
            )}

            {p.units.length > 0 && (
              <ol className="mt-5" aria-label={c.sessions(p.accepted, p.total)}>
                {p.units.map((u) => {
                  const done = u.status === "accepted";
                  const now = u === current;
                  return (
                    <li
                      key={u.ordinal}
                      className={cn(
                        "relative flex items-start gap-3 border-s-2 py-2 ps-5",
                        done ? "border-primary" : "border-border",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute -start-[9px] top-2.5 grid size-4 place-items-center rounded-full ring-4 ring-card",
                          done
                            ? "bg-primary text-primary-foreground"
                            : now
                              ? "bg-card shadow-[0_0_0_2px_var(--color-bridge)]"
                              : "bg-secondary",
                        )}
                      >
                        {done && <Check className="size-2.5" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block text-sm",
                            done || now ? "font-medium" : "text-muted-foreground",
                          )}
                        >
                          <span className="tabular-nums text-muted-foreground">{u.ordinal}.</span>{" "}
                          {u.title}
                        </span>
                        {done && u.accepted_month && (
                          <span className="block text-xs text-primary">
                            {c.passedIn(monthLabel(u.accepted_month, locale))}
                          </span>
                        )}
                        {!done && u.status === "submitted" && (
                          <span className="block text-xs text-bridge-ink">{c.submitted}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </article>
        );
      })}

      {q.growth.length > 0 && (
        <article className="rounded-3xl bg-card p-5 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)] sm:p-6">
          <h3 className="font-bold">{c.traits}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{c.traitsLead}</p>
          <ul className="mt-4 divide-y divide-border">
            {q.growth.map((g) => {
              const passed = g.latest >= CORE_TRAIT_THRESHOLD;
              return (
                <li key={g.dimension} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-sm font-medium">{g.dimension}</span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-semibold",
                      passed ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {passed && <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />}
                    {passed ? c.traitPassed : c.traitBuilding}
                  </span>
                </li>
              );
            })}
          </ul>
        </article>
      )}

      <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
        <Lock className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
        {c.private}
      </p>
    </section>
  );
}
