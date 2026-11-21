import { FastForward } from "lucide-react";

import { Button } from "@/components/ui/button";
import { defineCopy, pluralOf, useCopy } from "@/lib/locale";

/** how far «قدّم شهراً» reaches, for every kind of support */
export const TRY_MAX_AHEAD = 12;

const COPY = defineCopy("components/try/TryTimeBar", {
  ar: {
    simulated: "محاكاة",
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
  },
  en: {
    simulated: "Simulated",
    today: "Today",
    after: pluralOf({ one: "In {0} month", other: "In {0} months" }),
    backToday: "Back to today",
    forward: "Advance a month",
  },
});

/**
 * شريط «قدّم شهراً» لمنظرَي التأهيل والعيني: الزمن نفسه الذي يقدّمه سجلّ الكفالة المادية،
 * فما تقدّم في لسانٍ تقدّم في الألسنة كلّها. محاكاةٌ صريحة، لا تُحفظ ولا تغيّر شيئاً.
 */
export function TryTimeBar({
  ahead,
  onAhead,
  hint,
}: {
  ahead: number;
  onAhead: (n: number) => void;
  /** what advancing will show for this kind, said once at «اليوم» */
  hint?: string;
}) {
  const c = useCopy(COPY);
  return (
    <div className="mt-5 rounded-xl border border-border bg-background px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-3">
          <span aria-live="polite" className="font-display text-2xl font-bold">
            {ahead === 0 ? c.today : c.after(ahead)}
          </span>
          <span className="rounded-full bg-bridge/10 px-3 py-1 text-xs font-bold text-bridge-ink">
            {c.simulated}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {ahead > 0 && (
            <Button variant="outline" onClick={() => onAhead(0)}>
              {c.backToday}
            </Button>
          )}
          <Button
            disabled={ahead >= TRY_MAX_AHEAD}
            onClick={() => onAhead(Math.min(TRY_MAX_AHEAD, ahead + 1))}
          >
            <FastForward className="size-4" aria-hidden="true" />
            {c.forward}
          </Button>
        </div>
      </div>
      {hint && ahead === 0 && (
        <p className="mt-2 text-sm leading-7 text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
