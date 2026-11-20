import { Link } from "@tanstack/react-router";
import { Clock, MapPin } from "lucide-react";

import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { MuralImage, registerFor } from "@/components/brand/MuralImage";
import { formatMoney } from "@/lib/format";
import { defineCopy, pluralOf, useCopy, useLocale } from "@/lib/locale";
import { gapOf, localTryChild, TRY_CURRENCY, type TryChild } from "@/lib/try-demo";

const COPY = defineCopy("components/try/TryChildCard", {
  ar: {
    age: pluralOf(
      {
        one: "سنة واحدة",
        two: "سنتان",
        few: "{0} سنوات",
        many: "{0} سنة",
        other: "{0} سنة",
      },
      0,
      "ar",
    ),
    waiting: (days: number) => `ينتظر منذ ${days} يوماً`,
    leftMonthly: "متبقٍّ شهرياً",
    coverage: (name: string) => `تغطية حاجة ${name}`,
    sponsor: (name: string) => `اكفل ${name}`,
  },
  en: {
    age: pluralOf({ one: "{0} year old", other: "{0} years old" }),
    waiting: (days: number) => `Waiting ${days} days`,
    leftMonthly: "still needed each month",
    coverage: (name: string) => `Coverage of ${name}'s need`,
    sponsor: (name: string) => `Sponsor ${name}`,
  },
});

/** a demo child's card: same language as the directory card, linking only inside /try */
export function TryChildCard({ child: data, delay = 0 }: { child: TryChild; delay?: number }) {
  const locale = useLocale();
  const c = useCopy(COPY);
  const child = localTryChild(data, locale);
  const gap = gapOf(child);
  const pct = Math.round((child.funded / child.need) * 100);
  return (
    <article
      className="try-rise lift relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-background"
      style={{ animationDelay: `${delay}s` }}
    >
      <MuralImage
        photoUrl={null}
        displayName={child.name}
        register={registerFor("", pct)}
        className="aspect-[16/7] w-full bg-secondary"
      />
      <div className="flex flex-1 flex-col gap-3.5 p-6">
        <div>
          <h3 className="text-xl font-bold">
            <Link
              to="/try/$childId"
              params={{ childId: child.id }}
              className="outline-none after:absolute after:inset-0 after:content-['']"
            >
              {child.name}
            </Link>
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" />
              {child.country}
            </span>
            <span>{c.age(child.age)}</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden="true" />
              {c.waiting(child.waitingDays)}
            </span>
          </p>
        </div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-bold text-foreground tabular-nums">
            {formatMoney(gap, TRY_CURRENCY, locale)}{" "}
            <span className="font-normal text-muted-foreground">{c.leftMonthly}</span>
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <CrossingProgress percent={pct} label={c.coverage(child.name)} />
        <Link
          to="/try/$childId"
          params={{ childId: child.id }}
          className="relative z-10 mt-auto inline-flex min-h-11 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90"
        >
          {c.sponsor(child.name)}
        </Link>
      </div>
    </article>
  );
}
