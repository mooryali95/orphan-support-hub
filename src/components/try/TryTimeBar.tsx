import { FastForward } from "lucide-react";

import { Button } from "@/components/ui/button";
import { defineCopy, pluralOf, useCopy } from "@/lib/locale";

/** how far «قدّم شهراً» reaches, for every kind of support */
export const TRY_MAX_AHEAD = 12;

const COPY = defineCopy("components/try/TryTimeBar", {
  ar: {
    simulated: "محاكاة",
    sampleNote: "تجربةٌ للزمن على بيانات نموذجية، لا تُحفظ ولا تغيّر شيئاً.",
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
    sampleNote: "A time preview on sample data. Nothing is saved or changed.",
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
  disabled = false,
}: {
  ahead: number;
  onAhead: (n: number) => void;
  /** what advancing will show for this kind, said once at «اليوم» */
  hint?: string;
  /** nothing to advance yet (the hint then says why) */
  disabled?: boolean;
}) {
  const c = useCopy(COPY);
  /* a quiet, dashed sample tool: the page's primary actions stay the child's, never the clock's */
  return (
    <div
      role="group"
      aria-label={c.simulated}
      className="mt-5 rounded-xl border border-dashed border-bridge/40 bg-bridge/5 px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-full bg-bridge/10 px-2.5 py-0.5 text-xs font-bold text-bridge-ink">
            {c.simulated}
          </span>
          <span aria-live="polite" className="text-base font-bold tabular-nums">
            {ahead === 0 ? c.today : c.after(ahead)}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {ahead > 0 && (
            <Button variant="ghost" size="sm" className="min-h-11" onClick={() => onAhead(0)}>
              {c.backToday}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 bg-transparent"
            disabled={disabled || ahead >= TRY_MAX_AHEAD}
            onClick={() => onAhead(Math.min(TRY_MAX_AHEAD, ahead + 1))}
          >
            <FastForward className="size-4 rtl:-scale-x-100" aria-hidden="true" />
            {c.forward}
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">
        {hint && ahead === 0 ? `${hint} ` : ""}
        {c.sampleNote}
      </p>
    </div>
  );
}
