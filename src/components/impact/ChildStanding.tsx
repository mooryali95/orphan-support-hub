import { Check } from "lucide-react";

import { formatMoney } from "@/lib/format";
import { defineCopy, pluralOf, useCopy, useLocale } from "@/lib/locale";
import { childStanding, type MyImpact } from "@/lib/my-impact";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/impact/ChildStanding", {
  ar: {
    title: "بحصّتك وبدونها",
    sample: "بيانات نموذجية",
    lead: "حاجة كلّ طفلٍ الشهرية كما تقف اليوم: ما يغطّيه غيرك، وما أضافته حصّتك، وما بقي مفتوحاً.",
    without: "بدون حصّتك",
    withYou: "بحصّتك",
    bar: (name: string, without: number, withYou: number) =>
      `حاجة ${name} الشهرية: ${without}% بدون حصّتك، و${withYou}% بها`,
    yours: (amount: string) => `حصّتك ${amount} كلّ شهر`,
    complete: "اكتملت الحاجة الشهرية",
    open: (amount: string) => `بقي ${amount} كلّ شهر لتكتمل`,
    justBegan: "بدأت للتوّ",
    months: pluralOf(
      {
        one: "شهرٌ متّصل من الرعاية",
        two: "شهران متّصلان من الرعاية",
        few: "{0} أشهر متّصلة من الرعاية",
        many: "{0} شهراً متّصلاً من الرعاية",
        other: "{0} شهر متّصل من الرعاية",
      },
      0,
      "ar",
    ),
    waited: pluralOf(
      {
        one: "انتظر يوماً قبل كفالتك",
        two: "انتظر يومين قبل كفالتك",
        few: "انتظر {0} أيام قبل كفالتك",
        many: "انتظر {0} يوماً قبل كفالتك",
        other: "انتظر {0} يوم قبل كفالتك",
      },
      0,
      "ar",
    ),
    legend: ["يغطّيه غيرك", "حصّتك", "مفتوح"],
  },
  en: {
    title: "With your share, and without it",
    sample: "Sample data",
    lead: "Each child's monthly need as it stands today: what others cover, what your share added, and what is still open.",
    without: "Without you",
    withYou: "With you",
    bar: (name: string, without: number, withYou: number) =>
      `${name}'s monthly need: ${without}% without your share, ${withYou}% with it`,
    yours: (amount: string) => `Your share: ${amount} each month`,
    complete: "Monthly need complete",
    open: (amount: string) => `${amount} a month still open`,
    justBegan: "Just begun",
    months: pluralOf({ one: "{0} unbroken month of care", other: "{0} unbroken months of care" }),
    waited: pluralOf({
      one: "Waited {0} day before your sponsorship",
      other: "Waited {0} days before your sponsorship",
    }),
    legend: ["Covered by others", "Your share", "Open"],
  },
});

const pct = (v: number) => Math.round(v * 100);

/**
 * «بحصّتك وبدونها»: لكلّ طفلٍ في رعايتك شريطٌ واحد بدل الحلقة: ما يغطّيه غيرك (شمبانيا
 * رفيعة)، وحصّتك (لون الهوية)، وما بقي مفتوحاً. كلّه من بطاقة الكفالة المسموح بها
 * (الحاجة الشهرية، الممول منها، مبلغك)؛ وأيام الانتظار تُمرَّر من التجربة وحدها.
 */
export function ChildStanding({
  impact,
  waited,
  sample,
  className,
}: {
  impact: MyImpact;
  /** days each child had waited before this care, by impact child id (trial sample only) */
  waited?: Record<string, number>;
  /** trial children: the card is labelled as sample data */
  sample?: boolean;
  className?: string;
}) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const kids = impact.children.filter((k) => k.active && k.share > 0);
  if (kids.length === 0) return null;
  return (
    <section
      aria-labelledby="child-standing"
      className={cn("rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-7", className)}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="child-standing" className="font-display text-2xl font-bold">
          {c.title}
        </h3>
        {sample && (
          <span className="rounded-full bg-bridge/10 px-3 py-1 text-xs font-bold text-bridge-ink">
            {c.sample}
          </span>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">{c.lead}</p>
      <ul className="mt-3">
        {kids.map((k) => {
          const s = childStanding(k);
          const days = waited?.[k.id];
          return (
            <li key={k.id} className="border-t border-border py-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-lg font-bold">{k.name}</p>
                <p className="flex items-baseline gap-2 whitespace-nowrap text-sm text-muted-foreground">
                  <span>{c.without}</span>
                  <b dir="ltr" className="font-display text-xl tabular-nums text-foreground">
                    {pct(s.without)}%
                  </b>
                  <span aria-hidden="true" className="h-px w-5 self-center bg-bridge" />
                  <span>{c.withYou}</span>
                  <b dir="ltr" className="font-display text-2xl tabular-nums text-primary">
                    {pct(s.withYou)}%
                  </b>
                </p>
              </div>
              <div
                role="img"
                aria-label={c.bar(k.name, pct(s.without), pct(s.withYou))}
                className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-secondary"
              >
                <span
                  className="h-full bg-bridge transition-[width] duration-[var(--dur-4)] ease-[var(--ease-settle)] motion-reduce:transition-none"
                  style={{ width: `${s.without * 100}%` }}
                />
                <span
                  className="h-full bg-primary transition-[width] duration-[var(--dur-4)] ease-[var(--ease-settle)] motion-reduce:transition-none"
                  style={{ width: `${(s.withYou - s.without) * 100}%` }}
                />
              </div>
              <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <span>{c.yours(formatMoney(k.amount, k.currency, locale))}</span>
                {s.complete ? (
                  <span className="inline-flex items-center gap-1.5 font-bold text-primary">
                    <span className="grid size-4.5 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" aria-hidden="true" />
                    </span>
                    {c.complete}
                  </span>
                ) : (
                  s.open > 0 && <span>{c.open(formatMoney(s.open, k.currency, locale))}</span>
                )}
                <span>{k.months === 0 ? c.justBegan : c.months(k.months)}</span>
                {days !== undefined && days > 0 && <span>{c.waited(days)}</span>}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
        {[
          ["bg-bridge", c.legend[0]],
          ["bg-primary", c.legend[1]],
          ["border border-border bg-secondary", c.legend[2]],
        ].map(([dot, text]) => (
          <span key={text} className="inline-flex items-center gap-2">
            <span aria-hidden="true" className={cn("size-2.5 rounded-full", dot)} />
            {text}
          </span>
        ))}
      </p>
    </section>
  );
}
