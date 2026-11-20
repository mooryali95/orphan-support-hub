import { Check } from "lucide-react";

import { milestones, nextMilestone } from "@/lib/milestones";
import type { MyImpact } from "@/lib/my-impact";
import { cn } from "@/lib/utils";

/**
 * «محطّاتك»: تقديرٌ هادئ لما تحقّق فعلاً من «أثري»، والمحطّة القادمة ظاهرة. تُستعمل في لوحة
 * الداعم الحقيقية وفي التجربة بالمنطق نفسه (`@/lib/milestones`).
 */
export function MilestonesCard({ impact, className }: { impact: MyImpact; className?: string }) {
  const list = milestones(impact);
  const next = nextMilestone(list);
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5 sm:p-6", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-bold">محطّاتك</h3>
        <span
          dir="ltr"
          aria-hidden="true"
          className="font-display text-lg tabular-nums text-muted-foreground"
        >
          <b className="text-foreground">{list.filter((m) => m.done).length}</b>
          <span className="mx-1">/</span>
          {list.length}
        </span>
      </div>
      {/* a ledger of hairline rows, not chips: reached = a wine seal, next = a champagne ring */}
      <ul className="mt-3 grid grid-cols-2 gap-x-5 border-t border-border sm:gap-x-8">
        {list.map((m) => (
          <li
            key={m.key}
            className={cn(
              "flex min-w-0 items-center gap-2.5 border-b border-border py-3 text-sm",
              m.done
                ? "font-bold text-foreground"
                : m === next
                  ? "text-foreground"
                  : "text-muted-foreground",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full",
                m.done
                  ? "bg-primary text-primary-foreground"
                  : m === next
                    ? "border border-bridge"
                    : "border border-border",
              )}
            >
              {m.done ? (
                <Check className="size-3" />
              ) : (
                m === next && <span className="size-1.5 rounded-full bg-bridge" />
              )}
            </span>
            <span className="min-w-0">{m.title}</span>
            <span className="sr-only">{m.done ? ": تحقّقت" : ": لم تتحقّق بعد"}</span>
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="mt-3 text-sm leading-6 text-muted-foreground">
        {next ? (
          <>
            القادمة: <b className="text-foreground">{next.title}</b>. {next.hint}
          </>
        ) : (
          "تحقّقت محطّاتك كلّها. جزاك الله خيراً."
        )}
      </p>
    </div>
  );
}
