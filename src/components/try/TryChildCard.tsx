import { Link } from "@tanstack/react-router";
import { Clock, MapPin } from "lucide-react";

import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { MuralImage, registerFor } from "@/components/brand/MuralImage";
import { formatMoney } from "@/lib/format";
import { gapOf, TRY_CURRENCY, type TryChild } from "@/lib/try-demo";

/** a demo child's card: same language as the directory card, linking only inside /try */
export function TryChildCard({ child, delay = 0 }: { child: TryChild; delay?: number }) {
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
            <span>{child.age} سنوات</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden="true" />
              ينتظر منذ {child.waitingDays} يوماً
            </span>
          </p>
        </div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-bold text-foreground tabular-nums">
            {formatMoney(gap, TRY_CURRENCY, "ar")}{" "}
            <span className="font-normal text-muted-foreground">متبقٍّ شهرياً</span>
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <CrossingProgress percent={pct} label={`تغطية حاجة ${child.name}`} />
        <Link
          to="/try/$childId"
          params={{ childId: child.id }}
          className="relative z-10 mt-auto inline-flex min-h-11 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90"
        >
          اكفل {child.name}
        </Link>
      </div>
    </article>
  );
}
