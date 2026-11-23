import { Link } from "@tanstack/react-router";
import { Check, FileCheck2, ScrollText } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatDate, formatMoneyTotals } from "@/lib/format";
import {
  evidenceTotals,
  monthLabel,
  sortEvidence,
  type EvidenceMonth,
} from "@/lib/impact-evidence";
import { defineCopy, pluralOf, useCopy, useLocale } from "@/lib/locale";
import { useCountUp } from "@/lib/motion/use-count-up";
import { useInView } from "@/lib/motion/use-in-view";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/impact/EvidenceLedger", {
  ar: {
    title: "سجلّ الأثر الموثّق",
    sample: "بيانات نموذجية",
    lead: "كلّ شهرٍ بسلسلته: دفعتك، ثم تحويلها إلى الجهة الميدانية، ثم تسليمها بمستند. لا يُعدّ هنا إلا ما قُيّد.",
    delivered: ["أشهرٌ وصلت موثّقة", "كلٌّ بمستند تسليم"],
    given: ["مجموع ما قدّمت", "في الأشهر المقيّدة"],
    reports: ["تقارير وصلتك", "من الجهة الميدانية"],
    steps: ["دُفع", "حُوِّل", "سُلِّم"],
    chain: (done: number) => `اكتمل ${done} من 3 في سلسلة الشهر`,
    state: [
      "بانتظار دفعة هذا الشهر",
      "قُيّدت دفعتك، والتالي تحويلها إلى الجهة الميدانية",
      "حُوِّلت إلى الجهة الميدانية، وبانتظار مستند التسليم",
      "سُلِّمت بمستند",
    ],
    issue: "تعذّرت دفعة هذا الشهر",
    deliveredOn: (date: string) => `سُلِّمت بمستند في ${date}`,
    receipt: "مرجع الإيصال",
    report: "من تقرير الشهر",
    open: "السجلّ الكامل",
    openLabel: (child: string, month: string) => `السجلّ الكامل لكفالة ${child}، ${month}`,
    showAll: pluralOf(
      {
        one: "اعرض الشهر الأقدم",
        two: "اعرض الشهرين الأقدم",
        few: "اعرض {0} أشهر أقدم",
        many: "اعرض {0} شهراً أقدم",
        other: "اعرض {0} شهر أقدم",
      },
      0,
      "ar",
    ),
    showLess: "اعرض الأحدث فقط",
    emptyTitle: "سجلّك يبدأ مع أوّل دفعة",
    emptyText:
      "حين تُقيَّد دفعتك الأولى يظهر شهرها هنا، ثم تكتمل سلسلته أمامك: التحويل، فمستند التسليم.",
    nextTitle: "القادم",
    nextDocument: (month: string) =>
      `مستند تسليم ${month} يُضاف إلى هذا السجلّ حين تؤكّد الجهة الميدانية الوصول.`,
    nextCharge: (date: string) => `الدفعة القادمة في ${date}، ويبدأ بها شهرٌ جديد في السجلّ.`,
  },
  en: {
    title: "Documented record",
    sample: "Sample data",
    lead: "Each month with its chain: your payment, its transfer to the field organization, then delivery with a document. Only what has been recorded is counted here.",
    delivered: ["Months delivered", "each with a delivery record"],
    given: ["Total you have given", "in the recorded months"],
    reports: ["Reports received", "from the field organization"],
    steps: ["Paid", "Transferred", "Delivered"],
    chain: (done: number) => `${done} of 3 steps complete this month`,
    state: [
      "Awaiting this month's payment",
      "Your payment is recorded; next, its transfer to the field organization",
      "Transferred to the field organization; awaiting the delivery record",
      "Delivered, with a document",
    ],
    issue: "This month's payment did not go through",
    deliveredOn: (date: string) => `Delivered, with a document, on ${date}`,
    receipt: "Receipt reference",
    report: "From the month's report",
    open: "Full record",
    openLabel: (child: string, month: string) => `Full record of ${child}'s sponsorship, ${month}`,
    showAll: pluralOf({ one: "Show {0} earlier month", other: "Show {0} earlier months" }),
    showLess: "Show the latest only",
    emptyTitle: "Your record begins with the first payment",
    emptyText:
      "Once your first payment is recorded, its month appears here, and its chain completes in front of you: the transfer, then the delivery record.",
    nextTitle: "Coming next",
    nextDocument: (month: string) =>
      `The delivery record for ${month} is added here once the field organization confirms receipt.`,
    nextCharge: (date: string) =>
      `Your next payment is on ${date}; a new month then opens in this record.`,
  },
});

const LATEST = 4;

/**
 * «سجلّ الأثر الموثّق»: ما وصل فعلاً، شهراً شهراً، وكلّ شهرٍ بسلسلته (دُفع ← حُوِّل ← سُلِّم
 * بمستند) ومرجع إيصاله وسطر تقريره. يُقاد بالخصائص وحدها: اللوحة تمرّر قيود
 * `sponsorship_ledger`، والتجربة تمرّر أشهراً نموذجية موسومة.
 */
export function EvidenceLedger({
  rows,
  sample,
  next,
  hideReports,
  className,
  children,
}: {
  rows: EvidenceMonth[];
  /** trial rows: the card is labelled as sample data */
  sample?: boolean;
  /** what the donor can expect next: a delivery record for a month, or the next charge date */
  next?: { kind: "document"; month: string } | { kind: "charge"; date: string } | null;
  /** when the rows carry no report lines at all (the real ledger), the reports figure is left out */
  hideReports?: boolean;
  className?: string;
  /** an optional control strip above the figures (the trial's «قدّم شهراً») */
  children?: React.ReactNode;
}) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const [all, setAll] = useState(false);
  const [ref, inView] = useInView<HTMLDListElement>();
  const sorted = sortEvidence(rows.filter((r) => !r.upcoming));
  const totals = evidenceTotals(sorted);
  const shown = all ? sorted : sorted.slice(0, LATEST);
  const hidden = sorted.length - LATEST;
  const delivered = useCountUp(totals.delivered, { run: inView });
  const reports = useCountUp(totals.reports, { run: inView });

  return (
    <section
      aria-labelledby="evidence-ledger"
      className={cn("rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-7", className)}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="evidence-ledger" className="font-display text-2xl font-bold">
          {c.title}
        </h3>
        {sample && (
          <span className="rounded-full bg-bridge/10 px-3 py-1 text-xs font-bold text-bridge-ink">
            {c.sample}
          </span>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">{c.lead}</p>

      {children}

      <dl
        ref={ref}
        className={cn(
          "mt-5 grid grid-cols-2 border-y border-border",
          !hideReports && "min-[30rem]:grid-cols-3",
        )}
      >
        <Figure
          label={c.delivered[0]!}
          unit={c.delivered[1]!}
          value={String(delivered)}
          strong
          className="pe-4"
        />
        <Figure
          label={c.given[0]!}
          unit={c.given[1]!}
          value={formatMoneyTotals(totals.given, sorted[0]?.currency ?? "EUR", locale)}
          className={
            hideReports
              ? "border-s border-border ps-4 sm:ps-5"
              : "order-last col-span-2 border-t border-border min-[30rem]:order-none min-[30rem]:col-span-1 min-[30rem]:border-s min-[30rem]:border-t-0 min-[30rem]:px-5"
          }
        />
        {!hideReports && (
          <Figure
            label={c.reports[0]!}
            unit={c.reports[1]!}
            value={String(reports)}
            className="border-s border-border ps-4 sm:ps-5"
          />
        )}
      </dl>

      {sorted.length === 0 ? (
        <div className="mt-5 flex items-start gap-4 rounded-xl border border-dashed border-bridge/50 p-5">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-bridge text-bridge-ink"
          >
            <ScrollText className="size-4.5" />
          </span>
          <div>
            <p className="font-bold">{c.emptyTitle}</p>
            <p className="mt-1 text-sm leading-7 text-muted-foreground">{c.emptyText}</p>
          </div>
        </div>
      ) : (
        <ol className="mt-1">
          {shown.map((r, i) => {
            const label = monthLabel(r.month, locale);
            return (
              <li
                key={r.id}
                className="mo-rise grid gap-x-6 gap-y-3 border-b border-border py-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]"
                style={{ ["--i" as string]: i }}
              >
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold leading-tight">{label}</p>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{r.child}</p>
                </div>
                <div className="min-w-0">
                  <ol aria-label={c.chain(r.issue ? 0 : r.reached)} className="flex items-start">
                    {c.steps.map((step, n) => {
                      const done = !r.issue && r.reached > n;
                      return (
                        <li key={step} className="relative min-w-0 flex-1">
                          {n > 0 && (
                            <span
                              aria-hidden="true"
                              className={cn(
                                "absolute end-1/2 top-3 -z-0 h-px w-full",
                                done ? "bg-primary" : "bg-border",
                              )}
                            />
                          )}
                          <span
                            aria-hidden="true"
                            className={cn(
                              "relative z-10 mx-auto grid size-6 place-items-center rounded-full",
                              done
                                ? "bg-primary text-primary-foreground"
                                : !r.issue && r.reached === n
                                  ? "border border-bridge bg-card"
                                  : "border border-border bg-card",
                            )}
                          >
                            {done ? (
                              <Check className="size-3.5" />
                            ) : (
                              !r.issue &&
                              r.reached === n && (
                                <span className="size-1.5 rounded-full bg-bridge" />
                              )
                            )}
                          </span>
                          <span
                            className={cn(
                              "mt-1.5 block px-1 text-center text-xs leading-5",
                              done ? "font-bold text-foreground" : "text-muted-foreground",
                            )}
                          >
                            {step}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  <p className="mt-3 text-sm leading-6 text-foreground">
                    {r.issue
                      ? c.issue
                      : r.reached === 3 && r.deliveredAt
                        ? c.deliveredOn(formatDate(r.deliveredAt, locale))
                        : c.state[r.reached]}
                  </p>
                  {r.note && (
                    <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-muted-foreground">
                      <ScrollText
                        className="mt-1 size-3.5 shrink-0 text-bridge-ink"
                        aria-hidden="true"
                      />
                      <span>
                        <span className="font-bold text-foreground">{c.report}: </span>
                        {r.note}
                      </span>
                    </p>
                  )}
                  {(r.receipt || r.sponsorshipId) && (
                    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {r.receipt && (
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <FileCheck2
                            className="size-3.5 shrink-0 text-bridge-ink"
                            aria-hidden="true"
                          />
                          {c.receipt}
                          <bdi dir="ltr" className="truncate font-mono text-foreground">
                            {r.receipt}
                          </bdi>
                        </span>
                      )}
                      {r.sponsorshipId && (
                        <Link
                          to="/sponsorships/$sponsorshipId"
                          params={{ sponsorshipId: r.sponsorshipId }}
                          aria-label={c.openLabel(r.child, label)}
                          className="inline-flex min-h-11 items-center font-bold text-primary underline-offset-4 hover:underline"
                        >
                          {c.open}
                        </Link>
                      )}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {hidden > 0 && (
        <Button
          type="button"
          variant="ghost"
          className="mt-2"
          aria-expanded={all}
          onClick={() => setAll(!all)}
        >
          {all ? c.showLess : c.showAll(hidden)}
        </Button>
      )}

      {next && (
        <p className="mt-4 flex flex-col gap-x-3 rounded-xl border border-dashed border-bridge/50 px-4 py-3 text-sm leading-7 sm:flex-row sm:items-start">
          <span className="shrink-0 font-bold text-bridge-ink">{c.nextTitle}</span>
          <span className="text-foreground">
            {next.kind === "document"
              ? c.nextDocument(monthLabel(next.month, locale))
              : c.nextCharge(formatDate(next.date, locale))}
          </span>
        </p>
      )}
    </section>
  );
}

function Figure({
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
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1.5">
        <span
          className={cn(
            "block font-display text-4xl font-bold leading-none tabular-nums",
            strong ? "text-primary" : "text-foreground",
          )}
        >
          {value}
        </span>
        <span className="mt-1.5 block text-xs text-muted-foreground">{unit}</span>
      </dd>
    </div>
  );
}
