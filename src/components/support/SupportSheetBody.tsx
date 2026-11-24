import type { ReactNode } from "react";

import { PayCurrencyChoice } from "@/components/sponsorship/PayCurrency";
import {
  ChildPickPanel,
  GivingTrackChoice,
  MonthlyTrackPanel,
} from "@/components/support/GivingTrackChoice";
import { Input } from "@/components/ui/input";
import type { GivingTrack } from "@/config/giving-tracks";
import type { Payable } from "@/lib/currency";
import { defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/support/SupportSheetBody", {
  ar: { whom: "إلى من؟", amount: "المبلغ الشهري", other: "مبلغ آخر" },
  en: { whom: "For whom?", amount: "Monthly amount", other: "Other amount" },
});

/** هدفٌ في الورقة، كما يقدّمه المصدر (حقيقياً أو تجريبياً). */
export type SheetTarget = {
  key: string;
  label: string;
  hint?: string;
  /** «طفلٌ بعينه» يُختار من الدليل: الورقة تعرض طريقه بدل المبلغ والتأكيد */
  pickChild?: boolean;
  /** يوسم به الزرّ كما في الاختبارات القائمة */
  scope?: string;
};

export type SheetAmount = { key: string; label: string; sub?: string | null; value: number };

const sheetChip = (on: boolean) =>
  cn(
    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-[background-color,border-color,transform] active:scale-[0.97]",
    on
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-background hover:border-primary/60",
  );

/**
 * جسم ورقة الدعم الواحد — الحقيقية والتجريبية: إلى من؟ ← نوع العطاء (الثلاثة) ← العملة ←
 * المبلغ ← التأكيد. المصدر يحسب الأهداف والمبالغ وما يفعله التأكيد؛ الجسم يرسمها بالطريقة نفسها.
 * ما يختلف بين المصدرين يمرّ في فتحاتٍ (`beforeTracks`، `reach`، `extra`، `confirm`…).
 */
export function SupportSheetBody({
  lead,
  targets,
  target,
  onTarget,
  afterTargets,
  track,
  onTrack,
  trackDisabled,
  monthly,
  childPick,
  monthlyWhom,
  monthlyChild,
  payList,
  currency,
  onCurrency,
  amountLegend,
  amounts,
  amount,
  onAmount,
  amountMax,
  reach,
  extra,
  confirm,
  footnote,
  after,
}: {
  lead?: ReactNode;
  targets: SheetTarget[];
  target: SheetTarget;
  onTarget: (t: SheetTarget) => void;
  afterTargets?: ReactNode;
  track: GivingTrack;
  onTrack: (t: GivingTrack) => void;
  trackDisabled?: (t: GivingTrack) => boolean;
  /** the way to a child's financial sponsorship from this target */
  monthly: ReactNode;
  /** the way to the directory when the target is «one child» */
  childPick?: ReactNode;
  monthlyWhom: string;
  monthlyChild?: string | null;
  payList: readonly Payable[];
  currency: string;
  onCurrency: (c: string) => void;
  amountLegend?: ReactNode;
  amounts: SheetAmount[];
  amount: number;
  onAmount: (v: number) => void;
  amountMax?: number;
  reach?: ReactNode;
  extra?: ReactNode;
  confirm: ReactNode;
  footnote?: ReactNode;
  after?: ReactNode;
}) {
  const t = useCopy(COPY);
  const max = amountMax ?? 100_000;
  return (
    // عمودٌ بعرض البطاقة: صفّ «إلى من؟» يتمرّر داخلها ولا يمدّها.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      {lead}
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{t.whom}</legend>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {targets.map((x) => (
            <button
              key={x.key}
              type="button"
              aria-pressed={x.key === target.key}
              data-scope={x.scope}
              onClick={() => onTarget(x)}
              className={sheetChip(x.key === target.key)}
            >
              {x.label}
              {x.hint && <span className="text-xs opacity-75">{x.hint}</span>}
            </button>
          ))}
        </div>
        {afterTargets}
      </fieldset>

      <GivingTrackChoice value={track} onChange={onTrack} disabled={trackDisabled} />

      {target.pickChild && childPick ? (
        <ChildPickPanel whom={monthlyWhom} action={childPick} />
      ) : track === "monthly" ? (
        <MonthlyTrackPanel whom={monthlyWhom} childName={monthlyChild} action={monthly} />
      ) : (
        <>
          {/* تبديل العملة لا يمسّ المبلغ: الرقم يبقى كما اختاره الداعم، والزرّ يعرضه بعملته */}
          <PayCurrencyChoice options={payList} value={currency} onChange={onCurrency} />

          <fieldset className="min-w-0">
            <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
              {t.amount}
              {amountLegend}
            </legend>
            <div className="flex flex-wrap items-center gap-1.5">
              {amounts.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  aria-pressed={amount === a.value}
                  onClick={() => onAmount(a.value)}
                  className={cn(sheetChip(amount === a.value), "tabular-nums")}
                >
                  {a.label}
                  {a.sub && <span className="text-xs opacity-80">{a.sub}</span>}
                </button>
              ))}
              <Input
                aria-label={t.other}
                type="number"
                inputMode="numeric"
                min={1}
                max={max}
                className="h-11 w-28 rounded-full"
                value={amount}
                onChange={(e) =>
                  onAmount(Math.min(max, Math.max(1, Math.floor(Number(e.target.value)) || 1)))
                }
              />
            </div>
          </fieldset>

          {reach}
          {extra}
          {confirm}
          {footnote}
        </>
      )}
      {after}
    </div>
  );
}
