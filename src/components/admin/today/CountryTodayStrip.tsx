import { Clock, Hourglass, Upload } from "lucide-react";

import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

import type { CountryAccess } from "@/lib/golden-record";

import { stripCounts, type Filters, type QueueItem } from "./queue";

const COPY = defineCopy("components/admin/today/CountryTodayStrip", {
  ar: {
    label: "ملخّص يومك",
    awaiting: "تنتظر حسمك",
    overdue: "متأخرة",
    last: "آخر رفع",
    none: "لا شيء بعد",
  },
  en: {
    label: "Your day at a glance",
    awaiting: "Awaiting your decision",
    overdue: "Overdue",
    last: "Latest upload",
    none: "Nothing yet",
  },
});

/**
 * ثلاث بلاطاتٍ فوق «اليوم» لفريق الدولة: أعدادٌ من البنود نفسها التي حصرها
 * `country_can` (لا أسماء ولا رموز)، فلا تكشف دولةٌ شيئاً عن غيرها.
 */
export function CountryTodayStrip({
  items,
  access,
  awaiting,
  partial,
  now,
  onFilter,
}: {
  items: readonly QueueItem[];
  access: CountryAccess;
  /** العدد على الخادم (`admin_queue_counts` محصوراً بـ `country_can`)، لا ما وصل من صفحات. */
  awaiting: number;
  /** بقيت صفحاتٌ لم تصل: عدد المتأخّر حدٌّ أدنى. */
  partial: boolean;
  now: number;
  onFilter: (patch: Partial<Filters>) => void;
}) {
  const t = useCopy(COPY);
  const locale = useLocale();
  // كلّ طابورٍ يصل مرتّباً من الأحدث، فأحدث ما في صفحاته الأولى هو أحدث رفعٍ فعلاً.
  const { overdue, latest } = stripCounts(items, access, now);
  const lastText = latest
    ? new Date(latest).toLocaleDateString(locale, { numberingSystem: "latn", dateStyle: "medium" })
    : t.none;
  const tiles: Array<{
    label: string;
    value: string;
    Icon: typeof Clock;
    tone: string;
    f: Partial<Filters> | null;
  }> = [
    { label: t.awaiting, value: String(awaiting), Icon: Hourglass, tone: "text-primary", f: {} },
    {
      label: t.overdue,
      value: partial ? `${overdue}+` : String(overdue),
      Icon: Clock,
      tone: "text-destructive",
      f: { age: "overdue" },
    },
    { label: t.last, value: lastText, Icon: Upload, tone: "text-foreground", f: null },
  ];
  const cls =
    "border-border bg-card flex h-full min-h-20 w-full flex-col gap-1 rounded-2xl border p-3 text-start";
  return (
    <ul aria-label={t.label} className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
      {tiles.map(({ label, value, Icon, tone, f }) => {
        const body = (
          <>
            <Icon className={cn("size-4", tone)} aria-hidden="true" />
            <span className={cn("text-lg leading-7 font-extrabold tabular-nums", tone)}>
              <bdi>{value}</bdi>
            </span>
            <span className="text-muted-foreground text-xs leading-5">{label}</span>
          </>
        );
        return (
          <li key={label}>
            {f ? (
              <button
                type="button"
                onClick={() => onFilter(f)}
                className={cn(
                  cls,
                  "hover:border-primary/50 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                )}
              >
                {body}
              </button>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
