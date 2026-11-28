import { useQueries } from "@tanstack/react-query";
import { Clock, Hourglass, Upload } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { getTodayStrip } from "@/lib/admin-tools.functions";
import { useDataFn, useDataKey } from "@/lib/data-port";

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
 * «تنتظر حسمك» و«متأخرة» عددان دقيقان من الخادم (`admin_today_strip`، دولةً دولة):
 * ما يملك المتّصل حسمه وحده، فمدخل البيانات والمطّلع يريان صفراً، لا عدد الطابور.
 * ثلاث بلاطاتٍ فوق «اليوم» لفريق الدولة: أعدادٌ من البنود نفسها التي حصرها
 * `country_can` (لا أسماء ولا رموز)، فلا تكشف دولةٌ شيئاً عن غيرها.
 */
export function CountryTodayStrip({
  items,
  access,
  now,
  onFilter,
}: {
  items: readonly QueueItem[];
  access: CountryAccess;
  now: number;
  onFilter: (patch: Partial<Filters>) => void;
}) {
  const t = useCopy(COPY);
  const locale = useLocale();
  // كلّ طابورٍ يصل مرتّباً من الأحدث، فأحدث ما في صفحاته الأولى هو أحدث رفعٍ فعلاً.
  const { latest } = stripCounts(items, access, now);
  const fetchStrip = useDataFn("admin.todayStrip", getTodayStrip);
  const dk = useDataKey([]);
  const strips = useQueries({
    queries: access.countries.map((c) => ({
      queryKey: [...dk, "today-strip", c.code],
      queryFn: () => fetchStrip({ data: { country: c.code } }),
    })),
  });
  const known = strips.every((q) => q.data?.ok);
  const sum = (k: "settle" | "overdue") =>
    known ? String(strips.reduce((a, q) => a + Number(q.data?.ok ? q.data.data[k] : 0), 0)) : null;
  const loading = strips.some((q) => q.isPending);
  const lastText = latest
    ? new Date(latest).toLocaleDateString(locale, { numberingSystem: "latn", dateStyle: "medium" })
    : t.none;
  const tiles: Array<{
    label: string;
    value: string | null;
    Icon: typeof Clock;
    tone: string;
    f: Partial<Filters> | null;
  }> = [
    { label: t.awaiting, value: sum("settle"), Icon: Hourglass, tone: "text-primary", f: {} },
    {
      label: t.overdue,
      value: sum("overdue"),
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
            {value === null ? (
              loading ? (
                <Skeleton className="h-7 w-10" aria-hidden="true" />
              ) : (
                <span className="text-muted-foreground text-lg leading-7 font-extrabold">—</span>
              )
            ) : (
              <span className={cn("text-lg leading-7 font-extrabold tabular-nums", tone)}>
                <bdi>{value}</bdi>
              </span>
            )}
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
