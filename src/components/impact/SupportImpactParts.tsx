import { Check } from "lucide-react";

import { formatDate, formatMoney } from "@/lib/format";
import { defineCopy, pluralOf, useCopy, useLocale } from "@/lib/locale";
import type { PledgeCard, SupportScope } from "@/lib/support-impact";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/impact/SupportImpactParts", {
  ar: {
    sample: "بيانات نموذجية",
    scopes: {
      orphan: "طفل",
      group: "مجموعة",
      region: "منطقة",
      country: "دولة",
      institution: "مؤسسة",
    } satisfies Record<SupportScope, string>,
    monthly: (amount: string) => `${amount} كل شهر`,
    since: (date: string) => `منذ ${date}`,
    justBegan: "بدأ للتوّ",
    months: pluralOf(
      {
        one: "شهرٌ واحد",
        two: "شهران",
        few: "{0} أشهر",
        many: "{0} شهراً",
        other: "{0} شهر",
      },
      0,
      "ar",
    ),
  },
  en: {
    sample: "Sample data",
    scopes: {
      orphan: "A child",
      group: "A group",
      region: "A region",
      country: "A country",
      institution: "An organization",
    } satisfies Record<SupportScope, string>,
    monthly: (amount: string) => `${amount} a month`,
    since: (date: string) => `Since ${date}`,
    justBegan: "Just begun",
    months: pluralOf({ one: "{0} month", other: "{0} months" }),
  },
});

/** the champagne «بيانات نموذجية» mark the trial puts on every figure it invents */
export function SampleBadge({ className }: { className?: string }) {
  const c = useCopy(COPY);
  return (
    <span
      className={cn(
        "rounded-full bg-bridge/10 px-3 py-1 text-xs font-bold text-bridge-ink",
        className,
      )}
    >
      {c.sample}
    </span>
  );
}

/**
 * رأس بطاقة التعهّد: لمن هو (الاسم ونطاقه ومكانه)، وكم كل شهر، ومنذ متى. بلا صورةٍ ولا
 * موضعٍ دقيق: الاسم المعروض والدولة وحدهما.
 */
export function PledgeHead({ item }: { item: PledgeCard }) {
  const c = useCopy(COPY);
  const locale = useLocale();
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-lg font-bold">{item.label}</span>
          <span className="rounded-full border border-bridge/60 px-2.5 py-0.5 text-xs font-bold text-bridge-ink">
            {c.scopes[item.scope]}
          </span>
        </p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
          {item.place && <span>{item.place}</span>}
          {item.code && (
            <span dir="ltr" className="tabular-nums">
              {item.code}
            </span>
          )}
        </p>
      </div>
      <p className="text-sm leading-6 text-muted-foreground sm:text-end">
        <b className="block font-display text-xl tabular-nums text-foreground">
          {c.monthly(formatMoney(item.amount, item.currency, locale))}
        </b>
        {c.since(formatDate(item.at, locale))} ·{" "}
        {item.months === 0 ? c.justBegan : c.months(item.months)}
      </p>
    </div>
  );
}

export type ChainStep = { label: string; done: boolean; current: boolean };

/**
 * سلسلة محطّات بخطٍّ رفيع، كسلسلة «سجلّ الأثر الموثّق»: المكتملة بلون الهوية وعلامة، والجارية
 * بنقطةٍ شمبانية، والباقية فارغة.
 */
export function StepChain({ steps, label }: { steps: ChainStep[]; label: string }) {
  return (
    <ol aria-label={label} className="flex items-start">
      {steps.map((s, n) => (
        <li key={s.label} className="relative min-w-0 flex-1">
          {n > 0 && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute end-1/2 top-3 -z-0 h-px w-full transition-colors duration-[var(--dur-3)] motion-reduce:transition-none",
                s.done ? "bg-primary" : "bg-border",
              )}
            />
          )}
          <span
            aria-hidden="true"
            className={cn(
              "relative z-10 mx-auto grid size-6 place-items-center rounded-full transition-colors duration-[var(--dur-3)] motion-reduce:transition-none",
              s.done
                ? "bg-primary text-primary-foreground"
                : s.current
                  ? "border border-bridge bg-card"
                  : "border border-border bg-card",
            )}
          >
            {s.done ? (
              <Check className="size-3.5" />
            ) : (
              s.current && <span className="size-1.5 rounded-full bg-bridge" />
            )}
          </span>
          <span
            className={cn(
              "mt-1.5 block px-1 text-center text-xs leading-5",
              s.done ? "font-bold text-foreground" : "text-muted-foreground",
            )}
          >
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** رقمٌ كبير فوق وصفه، على شريطٍ مسطّر: كأرقام «سجلّ الأثر الموثّق». */
export function ImpactFigure({
  label,
  unit,
  value,
  strong,
  className,
}: {
  label: string;
  unit: string;
  value: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 py-4", className)}>
      <dt className="text-xs font-bold text-muted-foreground">{label}</dt>
      <dd className="mt-1">
        <span
          className={cn(
            "block font-display text-3xl font-bold tabular-nums leading-tight",
            strong ? "text-primary" : "text-foreground",
          )}
        >
          {value}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{unit}</span>
      </dd>
    </div>
  );
}
