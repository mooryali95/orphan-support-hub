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
    <div className={cn("rounded-3xl border border-border bg-card p-5 shadow-soft", className)}>
      <h3 className="font-bold">محطّاتك</h3>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {list.map((m) => (
          <li
            key={m.key}
            className={cn(
              "flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm",
              m.done
                ? "border-primary/25 bg-primary/8 font-bold text-primary"
                : m === next
                  ? "border-bridge/50 text-foreground"
                  : "border-border text-muted-foreground",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full",
                m.done ? "bg-primary text-primary-foreground" : "border border-current",
              )}
            >
              {m.done && <Check className="size-3" />}
            </span>
            {m.title}
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
