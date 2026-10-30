import { CircleCheck, Circle, Ruler, ShieldCheck, UserCheck, ArrowDownLeft } from "lucide-react";

import { QUALIFICATION_JOURNEY, stageReached } from "@/lib/qualification.functions";
import type { PublicQualification } from "@/integrations/supabase/types.extra";
import { formatMoney } from "@/lib/format";
import { LEVEL_LABELS } from "@/lib/supervisor.functions";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/qualification/QualificationPanel", {
  ar: {
    levels: {
      foundational: "المستوى التأسيسي",
      applied: "المستوى التطبيقي",
      advanced: "المستوى المتقدّم",
    } as Record<string, string>,
    supLevels: Object.fromEntries(
      Object.entries(LEVEL_LABELS).map(([k, v]) => [k, `المستوى ${v}`]),
    ) as Record<string, string>,
    journey: Object.fromEntries(
      QUALIFICATION_JOURNEY.map((s) => [s.stage, { label: s.label, question: s.question }]),
    ) as Record<string, { label: string; question: string }>,
    h: "بناء الأهلية",
    lead: "الكفالة هنا اشتراكٌ في بناء أهليّة هذا الطفل، لا سدُّ احتياجٍ شهري.",
    eq: "الأهلية = القدرة على تفهّم الخطاب + اكتساب الفعل.",
    perMonth: " / شهرياً",
    concept: "المفهوم — ما نُعلِّمه",
    trait: "السمة — ما نريد أن نبنيه",
    journeyH: "رحلة التشغيل",
    current: "المرحلة الحالية",
    sessions: "ورش الجلسات",
    of: "من",
    accepted: "مقبولة",
    sessionsAria: (a: number, t: number) => `${a} من ${t} جلسة مقبولة`,
    sessionsNote:
      "لا تُقبل جلسةٌ إلا بمخرَجٍ يُقوّمه مشرفٌ معتمَد، ولا تُقبل قبل قبول ما دونها. وما سلّمه الطفل لا يُعرض: يعنيك أنه بُني، لا ما كتبه.",
    inputs: "المدخلات",
    processes: "العمليات",
    outputs: "المخرجات",
    consentYes: "إذن الولي أو الوصي موثَّق",
    consentNo: "بانتظار توثيق إذن الولي",
    supYes: "مشرف معتمَد مُسنَد",
    supNo: "بانتظار إسناد مشرف",
    beforeYes: "قِيسَ قبل البرنامج",
    beforeNo: "بانتظار القياس الأوّلي",
    afterYes: "قِيسَ بعد البرنامج",
    afterNo: "القياس الختامي في آخر الرحلة",
    measureNote:
      "وقوعُ القياس يُعرض، ونتيجتُه لا: خريطة سمات طفلٍ حكمٌ عليه لا أثرٌ يُعرض على غريب.",
    supH: "أهلية المشرف",
    independent: "مشرف مستقلّ",
    training: "قيد التأهيل — إشرافه مقرونٌ بمتابعة الإدارة",
    supNote:
      "لا يُسنَد الإشراف إلا لمعتمَدٍ من الإدارة — لا من جهة الرعاية. واسمه لا يُعرض: ما يعنيك أنه مؤهَّل، لا مَن هو.",
    privacy:
      "قياس السمات يبقى بين الطفل ومشرفه وجهة رعايته — لا يُعرض هنا صوناً لكرامته. وكذلك رقم مؤشّر المشرف: قاعدةٌ تُطبَّق على الطفل وتُخرَق على مشرفه قاعدةٌ ضعيفة.",
  },
  en: {
    levels: {
      foundational: "Foundational level",
      applied: "Applied level",
      advanced: "Advanced level",
    } as Record<string, string>,
    supLevels: {
      foundational: "Foundational level",
      applied: "Applied level",
      advanced: "Advanced level",
    } as Record<string, string>,
    journey: {
      concept: { label: "Concept", question: "What governing meaning do we start from?" },
      trait: { label: "Trait", question: "What inner structure do we want to build?" },
      system: {
        label: "System",
        question: "How do we put the concept to work to build the trait?",
      },
      actions: { label: "Actions", question: "What actions now come from the child?" },
      measurement: { label: "Measurement", question: "How do we measure the change?" },
      qualified: { label: "Capability", question: "What capacity has taken root?" },
    } as Record<string, { label: string; question: string }>,
    h: "Building capability",
    lead: "Sponsorship here means taking part in building this child's capability, not just covering a monthly need.",
    eq: "Capability = the ability to understand what is asked + acquire action.",
    perMonth: " / month",
    concept: "Concept — what we teach",
    trait: "Trait — what we want to build",
    journeyH: "The program journey",
    current: "Current stage",
    sessions: "Session workshops",
    of: "of",
    accepted: "accepted",
    sessionsAria: (a: number, t: number) => `${a} of ${t} sessions accepted`,
    sessionsNote:
      "A session is accepted only with work assessed by a certified supervisor, and only after the ones before it. What the child handed in isn't shown: what matters to you is that it was built, not what they wrote.",
    inputs: "Inputs",
    processes: "Processes",
    outputs: "Outcomes",
    consentYes: "Guardian consent documented",
    consentNo: "Awaiting guardian consent",
    supYes: "Certified supervisor assigned",
    supNo: "Awaiting a supervisor",
    beforeYes: "Measured before the program",
    beforeNo: "Awaiting the baseline measurement",
    afterYes: "Measured after the program",
    afterNo: "Final measurement at the end of the journey",
    measureNote:
      "We show that measurement happened, not its result: a child's trait map is a judgment about them, not an impact to show a stranger.",
    supH: "Supervisor qualification",
    independent: "Independent supervisor",
    training: "In training — supervision paired with administrative follow-up",
    supNote:
      "Supervision is assigned only to someone certified by the administration — not by the care organization. Their name isn't shown: what matters to you is that they're qualified, not who they are.",
    privacy:
      "Trait measurements stay between the child, their supervisor and their care organization — they aren't shown here, out of respect for the child's dignity. The same goes for the supervisor's score: a rule applied to the child but broken for the supervisor would be a weak rule.",
  },
});

/**
 * لوحة بناء الأهلية في ملفّ اليتيم.
 *
 * تعرض ما اشتُرِي وأين وصل: المفهوم والسمة المستهدفة، والمدخلات
 * والعمليات والمخرجات، ورحلة التشغيل الست.
 *
 * ولا تعرض خريطة السمات ولا السمة الجوهرية: تلك حكمٌ على طفل لا أثرٌ
 * يُعرض على غريب — والقاعدة نفسها لا تُرجعها أصلاً في العرض العام.
 */
export function QualificationPanel({ programs }: { programs: PublicQualification[] }) {
  const locale = useLocale();
  const t = useCopy(COPY);
  if (programs.length === 0) return null;

  return (
    <section className="space-y-6" aria-labelledby="qualification-heading">
      <div>
        <h2 id="qualification-heading" className="text-xl font-extrabold">
          {t.h}
        </h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          {t.lead}
          <span className="mt-1 block font-medium text-foreground">{t.eq}</span>
        </p>
      </div>

      {programs.map((p) => (
        <article key={p.enrollment_id} className="rounded-2xl border border-border bg-card p-5">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-bold">{p.program}</h3>
              {p.level && (
                <p className="mt-1 text-xs text-muted-foreground">{t.levels[p.level] ?? p.level}</p>
              )}
            </div>
            <p className="text-sm font-bold text-primary">
              {formatMoney(p.monthly_price, p.currency, locale)}
              <span className="font-normal text-muted-foreground">{t.perMonth}</span>
            </p>
          </header>

          <p className="mt-3 text-sm leading-7 text-muted-foreground">{p.summary}</p>

          {/* المفهوم والسمة — «المفهوم وسيلة، والسمة غاية» */}
          {(p.concept || p.target_trait) && (
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              {p.concept && (
                <div className="rounded-xl bg-secondary/50 p-4">
                  <p className="text-[11px] font-bold text-muted-foreground">{t.concept}</p>
                  <p className="mt-1 font-bold text-shore-need">{p.concept}</p>
                  {p.concept_intent && (
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      {p.concept_intent}
                    </p>
                  )}
                </div>
              )}
              <ArrowDownLeft
                className="mx-auto hidden size-5 shrink-0 text-bridge sm:block"
                aria-hidden="true"
              />
              {p.target_trait && (
                <div className="rounded-xl bg-shore-thrive/10 p-4">
                  <p className="text-[11px] font-bold text-muted-foreground">{t.trait}</p>
                  <p className="mt-1 font-bold text-shore-thrive">{p.target_trait}</p>
                  {p.target_trait_summary && (
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      {p.target_trait_summary}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* رحلة التشغيل */}
          <div className="mt-6">
            <p className="text-[11px] font-bold text-muted-foreground">{t.journeyH}</p>
            <ol className="mt-3 space-y-0">
              {QUALIFICATION_JOURNEY.map((step, i) => {
                const done = stageReached(p.stage, step.stage);
                const current = p.stage === step.stage;
                const last = i === QUALIFICATION_JOURNEY.length - 1;
                return (
                  <li key={step.stage} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      {done ? (
                        <CircleCheck
                          className={cn(
                            "size-5 shrink-0",
                            current ? "text-bridge-ink" : "text-shore-thrive",
                          )}
                          aria-hidden="true"
                        />
                      ) : (
                        <Circle className="size-5 shrink-0 text-border" aria-hidden="true" />
                      )}
                      {!last && (
                        <span
                          className={cn("w-px flex-1", done ? "bg-shore-thrive/40" : "bg-border")}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className={cn("pb-5", last && "pb-0")}>
                      <p
                        className={cn(
                          "text-sm font-bold",
                          done ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {t.journey[step.stage]?.label ?? step.label}
                        {current && (
                          <span className="ms-2 rounded-full bg-bridge/15 px-2 py-0.5 text-[11px] font-medium text-bridge-ink">
                            {t.current}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs leading-6 text-muted-foreground">
                        {t.journey[step.stage]?.question ?? step.question}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* ورش الجلسات — عدداً لا مضموناً: ما سلّمه الطفل وملاحظات مشرفه
              عليه من جنس الدرجات، حكمٌ عليه لا أثرٌ يُعرض على غريب. */}
          {typeof p.units_total === "number" && p.units_total > 0 && (
            <div className="mt-6 rounded-xl bg-secondary/50 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[11px] font-bold text-muted-foreground">{t.sessions}</p>
                <p className="text-sm font-bold">
                  <span className="text-shore-thrive">{p.units_accepted ?? 0}</span> {t.of}{" "}
                  {p.units_total} {t.accepted}
                </p>
              </div>
              <ol
                className="mt-3 flex gap-1"
                aria-label={t.sessionsAria(p.units_accepted ?? 0, p.units_total)}
              >
                {Array.from({ length: p.units_total }, (_, i) => (
                  <li
                    key={i}
                    aria-hidden="true"
                    className={cn(
                      "h-1.5 flex-1 rounded-full",
                      i < (p.units_accepted ?? 0) ? "bg-shore-thrive" : "bg-border",
                    )}
                  />
                ))}
              </ol>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">{t.sessionsNote}</p>
            </div>
          )}

          {/* المدخلات والعمليات والمخرجات */}
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Column title={t.inputs} items={p.inputs} tone="text-shore-need" />
            <Column title={t.processes} items={p.processes} tone="text-bridge-ink" />
            <Column title={t.outputs} items={p.deliverables} tone="text-shore-thrive" />
          </div>

          {/* الضمانتان — وجودهما لا أسماء أصحابهما */}
          <div className="mt-6 flex flex-wrap gap-2 border-t border-border/70 pt-4">
            <Guarantee ok={p.has_consent} icon={ShieldCheck} yes={t.consentYes} no={t.consentNo} />
            <Guarantee ok={p.has_supervisor} icon={UserCheck} yes={t.supYes} no={t.supNo} />
            {/* «خريطة سمات مقيسة قبل وبعد» مخرَجٌ موعود، والخريطة نفسها
                محجوبة بحقّ. فيُعرض وقوعُ القياس لا نتيجته: يصير الوعد
                قابلاً للتحقّق والطفل غير مكشوف. */}
            <Guarantee
              ok={Boolean(p.measured_before)}
              icon={Ruler}
              yes={t.beforeYes}
              no={t.beforeNo}
            />
            <Guarantee
              ok={Boolean(p.measured_after)}
              icon={Ruler}
              yes={t.afterYes}
              no={t.afterNo}
            />
          </div>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">{t.measureNote}</p>

          {/* أهلية المشرف — ثقة الكافل في البرنامج ثقةٌ في مَن يحمله */}
          {p.supervisor?.assigned && (
            <div className="mt-4 rounded-xl bg-secondary/50 p-4">
              <p className="text-[11px] font-bold text-muted-foreground">{t.supH}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold text-shore-need">
                  {t.supLevels[p.supervisor.level] ?? p.supervisor.level}
                </span>
                {p.supervisor.independent ? (
                  <span className="rounded-full bg-shore-thrive/12 px-2.5 py-1 text-xs font-medium text-shore-thrive">
                    {t.independent}
                  </span>
                ) : (
                  <span className="rounded-full bg-bridge-bright/12 px-2.5 py-1 text-xs font-medium text-bridge-ink">
                    {t.training}
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">{t.supNote}</p>
            </div>
          )}

          <p className="mt-3 text-xs leading-6 text-muted-foreground">{t.privacy}</p>
        </article>
      ))}
    </section>
  );
}

function Column({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={cn("text-[11px] font-bold", tone)}>{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-xs leading-6 text-muted-foreground">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-bridge" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Guarantee({
  ok,
  icon: Icon,
  yes,
  no,
}: {
  ok: boolean;
  icon: typeof ShieldCheck;
  yes: string;
  no: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        ok ? "bg-shore-thrive/12 text-shore-thrive" : "bg-bridge-bright/12 text-bridge-ink",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {ok ? yes : no}
    </span>
  );
}
