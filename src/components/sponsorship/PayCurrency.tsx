import { useId, type KeyboardEvent } from "react";

import {
  approxMoney,
  currencyName,
  formatMoneyExact,
  formatRate,
  type ChargeQuote,
  type Payable,
  type PayableKind,
} from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/sponsorship/PayCurrency", {
  ar: {
    label: "عملة الدفع",
    need: "عملة الاحتياج",
    operating: "عملة بلد الطفل",
    unified: "العملة الموحّدة",
    charged: "يُخصم منك",
    credited: (name: string) => `يُقيَّد لحاجة ${name}`,
    rate: (rate: string, date: string) => `السعر: ${rate}، بتاريخ ${date}.`,
    indicative: "سعرٌ استرشادي لا سعر السوق اللحظي.",
    fixed: "يُحفظ السعر المطبَّق مع عطائك، فلا يتغيّر ما قُيِّد للطفل بعده.",
  },
  en: {
    label: "Payment currency",
    need: "Need currency",
    operating: "Child's country currency",
    unified: "Unified currency",
    charged: "You are charged",
    credited: (name: string) => `Credited to ${name}'s need`,
    rate: (rate: string, date: string) => `Rate: ${rate}, dated ${date}.`,
    indicative: "An indicative rate, not a live market rate.",
    fixed:
      "The rate applied is stored with your gift, so the amount credited does not change later.",
  },
});

/**
 * اختيار عملة الدفع: عملة بلد الطفل أو العملة الموحّدة. مجموعة اختيارٍ واحد
 * (راديو) كأزرار نوع العطاء؛ ولا تُرسم إن لم يكن ثمّة إلا عملة واحدة.
 */
export function PayCurrencyChoice({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly Payable[];
  value: string;
  onChange: (currency: string) => void;
  className?: string;
}) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const labelId = useId();
  const list = options;
  if (list.length < 2) return null;
  const kindLabel: Record<PayableKind, string> = {
    need: c.need,
    operating: c.operating,
    unified: c.unified,
  };
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const at = Math.max(
      0,
      list.findIndex((o) => o.currency === value),
    );
    const forward =
      e.key === "ArrowDown" || e.key === (locale === "ar" ? "ArrowLeft" : "ArrowRight");
    const next = list[(at + (forward ? 1 : list.length - 1)) % list.length]!;
    onChange(next.currency);
    e.currentTarget.querySelector<HTMLElement>(`[data-currency="${next.currency}"]`)?.focus();
  }
  return (
    <div className={className}>
      <p id={labelId} className="text-sm font-medium">
        {c.label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={onKey}
        className="mt-2 grid gap-1 rounded-xl bg-secondary p-1"
        style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}
      >
        {list.map((o) => {
          const on = o.currency === value;
          return (
            <button
              key={o.currency}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              data-currency={o.currency}
              onClick={() => onChange(o.currency)}
              className={cn(
                "flex min-h-14 min-w-0 flex-col items-center justify-center rounded-lg px-2 py-1.5 text-center transition-colors",
                on
                  ? "bg-card text-foreground shadow-soft dark:bg-foreground/10"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="text-sm font-bold">
                <bdi>{currencyName(o.currency, locale)}</bdi>{" "}
                <span className="font-normal tabular-nums" dir="ltr">
                  {o.currency}
                </span>
              </span>
              <span className="text-xs leading-5">{kindLabel[o.kind]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * ما يُخصم وما يُقيَّد حين تختلف عملة الدفع عن عملة الحاجة: المبلغان، والسعر
 * بتاريخه، وأنه استرشادي إن كان كذلك. لا يُرسم حين لا تحويل.
 */
export function FxNote({
  quote,
  childName,
  className,
}: {
  quote: ChargeQuote | null;
  childName: string;
  className?: string;
}) {
  const c = useCopy(COPY);
  const locale = useLocale();
  if (!quote?.fx) return null;
  const { charged, credited, fx } = quote;
  return (
    <div
      data-fx-note
      aria-live="polite"
      className={cn("rounded-xl border border-border p-3 text-sm leading-7", className)}
    >
      <dl className="space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{c.charged}</dt>
          <dd className="font-bold tabular-nums">
            {formatMoneyExact(charged.amount, charged.currency, locale)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="min-w-0 text-muted-foreground">{c.credited(childName)}</dt>
          <dd className="shrink-0 font-bold tabular-nums">
            {approxMoney(credited.amount, credited.currency, locale)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">
        {c.rate(formatRate(fx, locale), formatDate(fx.asOf, locale))}{" "}
        {fx.indicative ? `${c.indicative} ` : ""}
        {c.fixed}
      </p>
    </div>
  );
}
