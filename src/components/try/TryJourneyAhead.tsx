import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { EvidenceLedger } from "@/components/impact/EvidenceLedger";
import { MilestonesCard } from "@/components/impact/MilestonesCard";
import { TryTimeBar } from "@/components/try/TryTimeBar";
import type { EvidenceMonth } from "@/lib/impact-evidence";
import type { MyImpact } from "@/lib/my-impact";
import { defineCopy, dirOf, pluralOf, useCopy, useLocale } from "@/lib/locale";
import { localTryChild, nextTryChild, tryChild, type TryGift } from "@/lib/try-demo";

const COPY = defineCopy("components/try/TryJourneyAhead", {
  ar: {
    title: "رحلتك عبر الأشهر",
    simulated: "محاكاة",
    lead: "قدّم الزمن شهراً لترى سجلّك يمتلئ: كلّ شهرٍ بتحويله ومستند تسليمه وسطر تقريره، ومحطّاتك وهي تتحقّق.",
    today: "اليوم",
    after: pluralOf(
      {
        one: "بعد شهر",
        two: "بعد شهرين",
        few: "بعد {0} أشهر",
        many: "بعد {0} شهراً",
        other: "بعد {0} شهراً",
      },
      0,
      "ar",
    ),
    backToday: "عُد إلى اليوم",
    forward: "قدّم شهراً",
    needMonthly: "تقديم الزمن للكفالة الشهرية: ابدأ كفالةً شهرية لترى تقاريرها تتوالى.",
    running: (name: string) =>
      `كفالة ${name} جارية، ودفعتك الأولى مقيّدة. اضغط «قدّم شهراً» لترى مستند تسليمها يصل.`,
    next: "الخطوة التالية",
    nextLine: (name: string, country: string, days: number) =>
      `${name} في ${country}: انتظارٌ منذ ${days} يوماً`,
    nextHint: "الأطول انتظاراً ممّن لم تكفلهم بعد.",
  },
  en: {
    title: "Your journey through the months",
    simulated: "Simulated",
    lead: "Advance time by a month to watch your record fill: each month with its transfer, its delivery record and a line from its report, and your milestones as they are met.",
    today: "Today",
    after: pluralOf({ one: "In {0} month", other: "In {0} months" }),
    backToday: "Back to today",
    forward: "Advance a month",
    needMonthly:
      "Advancing time applies to monthly sponsorships: start one to see its reports arrive.",
    running: (name: string) =>
      `${name}'s sponsorship is under way and your first payment is recorded. Press “Advance a month” to see its delivery record arrive.`,
    next: "Next step",
    nextLine: (name: string, country: string, days: number) =>
      `${name} in ${country} has been waiting ${days} days`,
    nextHint: "The longest wait among the children you have not yet sponsored.",
  },
});

/**
 * «رحلتك عبر الأشهر»: الداعم يقدّم الزمن شهراً فيرى سجلّه يمتلئ شهراً شهراً (التحويل، مستند
 * التسليم، سطر التقرير)، وتتقدّم محطّاته. محاكاةٌ صريحة فوق عطاءات التجربة؛ لا تُحفظ ولا تغيّر شيئاً.
 */
export function TryJourneyAhead({
  gifts,
  impact,
  rows,
  ahead,
  onAhead,
}: {
  gifts: TryGift[];
  impact: MyImpact;
  /** the sample evidence rows as they stand `ahead` months from now */
  rows: EvidenceMonth[];
  ahead: number;
  onAhead: (n: number) => void;
}) {
  const locale = useLocale();
  const c = useCopy(COPY);
  const local = (k: ReturnType<typeof tryChild>) => (k ? localTryChild(k, locale) : undefined);
  const monthly = gifts.find((g) => g.cadence === "monthly");
  const child = local(monthly ? tryChild(monthly.childId) : undefined);
  const suggestion = local(nextTryChild(gifts));
  /* the latest month whose delivery record has not arrived yet: what the donor returns for */
  const pending = [...rows]
    .filter((r) => r.reached < 3)
    .sort((a, b) => b.month.localeCompare(a.month))[0];

  return (
    <section aria-labelledby="journey-ahead" className="mt-10">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="journey-ahead" className="text-xl font-bold">
          {c.title}
        </h2>
        <span className="rounded-full bg-bridge/10 px-3 py-1 text-xs font-bold text-bridge-ink">
          {c.simulated}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{c.lead}</p>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <EvidenceLedger
          sample
          rows={rows}
          next={pending ? { kind: "document", month: pending.month } : null}
        >
          <TryTimeBar
            ahead={ahead}
            onAhead={onAhead}
            disabled={!child}
            hint={child ? c.running(child.name) : c.needMonthly}
          />
        </EvidenceLedger>

        <div className="grid gap-4">
          <MilestonesCard impact={impact} />
          {suggestion && (
            <Link
              to="/try/$childId"
              params={{ childId: suggestion.id }}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft transition-colors hover:bg-secondary"
            >
              <span className="mural-placeholder grid size-14 shrink-0 place-items-center rounded-2xl font-display text-2xl font-bold text-white">
                {suggestion.name.charAt(0)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-bridge-ink">{c.next}</span>
                <span className="block font-bold">
                  {c.nextLine(suggestion.name, suggestion.country, suggestion.waitingDays)}
                </span>
                <span className="block text-sm text-muted-foreground">{c.nextHint}</span>
              </span>
              <ArrowLeft
                className="size-5 shrink-0 text-primary ltr:-scale-x-100"
                aria-hidden="true"
              />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
