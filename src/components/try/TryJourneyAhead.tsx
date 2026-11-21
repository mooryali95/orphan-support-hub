import { Link } from "@tanstack/react-router";
import { ArrowLeft, FastForward, FileCheck2, MessageSquareText, Send } from "lucide-react";

import { MilestonesCard } from "@/components/impact/MilestonesCard";
import { Button } from "@/components/ui/button";
import type { MyImpact } from "@/lib/my-impact";
import { defineCopy, dirOf, pluralOf, useCopy, useLocale } from "@/lib/locale";
import { localTryChild, monthStory, nextTryChild, tryChild, type TryGift } from "@/lib/try-demo";
import { cn } from "@/lib/utils";

const ICON = { transfer: Send, delivery: FileCheck2, note: MessageSquareText } as const;
const MAX_AHEAD = 12;

const COPY = defineCopy("components/try/TryJourneyAhead", {
  ar: {
    title: "رحلتك عبر الأشهر",
    simulated: "محاكاة",
    lead: "قدّم الزمن شهراً لترى ما يصلك بعد الكفالة، ومحطّاتك وهي تتحقّق.",
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
      `كفالتك لـ${name} جارية. اضغط «قدّم شهراً» لترى ما يحمله الشهر القادم.`,
    next: "الخطوة التالية",
    nextLine: (name: string, country: string, days: number) =>
      `${name} في ${country} ينتظر منذ ${days} يوماً`,
    nextHint: "هو الأطول انتظاراً ممّن لم تكفلهم بعد.",
  },
  en: {
    title: "Your journey through the months",
    simulated: "Simulated",
    lead: "Advance time by a month to see what reaches you after sponsoring, and your milestones as they are met.",
    today: "Today",
    after: pluralOf({ one: "In {0} month", other: "In {0} months" }),
    backToday: "Back to today",
    forward: "Advance a month",
    needMonthly:
      "Advancing time applies to monthly sponsorships: start one to see its reports arrive.",
    running: (name: string) =>
      `Your sponsorship of ${name} is under way. Press “Advance a month” to see what next month brings.`,
    next: "Next step",
    nextLine: (name: string, country: string, days: number) =>
      `${name} in ${country} has been waiting ${days} days`,
    nextHint: "The longest wait among the children you have not yet sponsored.",
  },
});

/**
 * «رحلتك عبر الأشهر»: الداعم يقدّم الزمن شهراً فيرى ما سيصله فعلاً (التحويل، مستند التسليم،
 * كلمة المشرف)، وتتقدّم محطّاته. محاكاةٌ صريحة فوق عطاءات التجربة؛ لا تُحفظ ولا تغيّر شيئاً.
 */
export function TryJourneyAhead({
  gifts,
  impact,
  ahead,
  onAhead,
}: {
  gifts: TryGift[];
  impact: MyImpact;
  ahead: number;
  onAhead: (n: number) => void;
}) {
  const locale = useLocale();
  const c = useCopy(COPY);
  const local = (k: ReturnType<typeof tryChild>) => (k ? localTryChild(k, locale) : undefined);
  const monthly = gifts.find((g) => g.cadence === "monthly");
  const child = local(monthly ? tryChild(monthly.childId) : undefined);
  const suggestion = local(nextTryChild(gifts));

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

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="font-display text-2xl font-bold">
              {ahead === 0 ? c.today : c.after(ahead)}
            </p>
            <div className="flex gap-2">
              {ahead > 0 && (
                <Button variant="outline" size="sm" onClick={() => onAhead(0)}>
                  {c.backToday}
                </Button>
              )}
              <Button
                size="sm"
                disabled={!child || ahead >= MAX_AHEAD}
                onClick={() => onAhead(Math.min(MAX_AHEAD, ahead + 1))}
              >
                <FastForward className="size-4" aria-hidden="true" />
                {c.forward}
              </Button>
            </div>
          </div>
          {!child ? (
            <p className="mt-4 text-sm leading-7 text-muted-foreground">{c.needMonthly}</p>
          ) : ahead === 0 ? (
            <p className="mt-4 text-sm leading-7 text-muted-foreground">{c.running(child.name)}</p>
          ) : (
            <ol key={ahead} className="try-rise mt-4 space-y-3">
              {monthStory(child, monthly!.amount, ahead, locale).map((s) => {
                const Icon = ICON[s.key];
                return (
                  <li key={s.key} className="flex gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-sm font-bold">{s.title}</span>
                      <span className="block text-sm leading-6 text-muted-foreground">
                        {s.text}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div>
          <MilestonesCard impact={impact} />
        </div>
      </div>

      {suggestion && (
        <Link
          to="/try/$childId"
          params={{ childId: suggestion.id }}
          className="mt-4 flex items-center gap-4 rounded-3xl border border-border bg-card p-5 shadow-soft transition-colors hover:bg-secondary"
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
          <ArrowLeft className="size-5 shrink-0 text-primary ltr:-scale-x-100" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
