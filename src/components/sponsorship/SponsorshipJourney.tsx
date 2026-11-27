import { useState } from "react";
import { toast } from "sonner";
import {
  Award,
  Banknote,
  Check,
  ChevronDown,
  Copy,
  FileText,
  GraduationCap,
  HandHeart,
  Landmark,
  Loader2,
  TriangleAlert,
} from "lucide-react";

import { hijriLabel, monthLabel } from "@/components/sponsorship/sponsor-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDataFn } from "@/lib/data-port";
import { useDemo } from "@/lib/demo-mode";
import { SampleBadge } from "@/components/impact/SupportImpactParts";
import { formatDate, formatMoney } from "@/lib/format";
import {
  verifyLedgerReceipt,
  type LedgerMonth,
  type LedgerPayment,
  type SponsorshipLedger,
} from "@/lib/ledger.functions";
import { defineCopy, pluralOf, useCopy, useLocale, type Locale } from "@/lib/locale";
import {
  journeyByMonth,
  packageLine,
  PACKAGE_STEPS,
  stepReached,
  type JourneyEvent,
  type JourneyReport,
  type PackageStep,
} from "@/lib/sponsor-center";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/sponsorship/SponsorshipJourney", {
  ar: {
    title: "رحلة الكفالة",
    lead: "كلّ ما حدث في كفالتك، شهراً بشهر، الأحدث أولاً.",
    empty: "تبدأ الرحلة مع أوّل دفعة: يظهر هنا كلّ شهرٍ بمحطّاته وإيصاله.",
    steps: {
      scheduled: "دُفع وجُدول",
      transferred: "حُوِّل للجهة الميدانية",
      delivered: "وصل الطفل بمستند",
    } as Record<PackageStep, string>,
    stepState: (n: number, label: string, state: string) => `المحطّة ${n} من 3: ${label}، ${state}`,
    reached: "تمّت",
    waiting: "لم تتمّ بعد",
    monthLine: "محطّات الشهر",
    delivered: (date: string) => `وصل ${date} بمستند استلام`,
    waitingFor: (step: string) => `بانتظار: ${step}`,
    notPaid: "لم يُدفع هذا الشهر",
    pay: {
      paid: "مدفوع",
      pending: "الدفع قيد التأكيد",
      failed: "تعذّر الدفع",
      refunded: "رُدّ المبلغ",
      disputed: "قيد منازعة",
    } as Record<NonNullable<LedgerMonth["payment_status"]>, string>,
    failedHint: "لم يصل دفع هذا الشهر. أكمله الآن ليُحوَّل للطفل في دورته.",
    disputedHint: "فُتحت منازعةٌ على هذا الدفع لدى مزوّد الدفع، ويبقى الشهر معلّقاً حتى تُحسم.",
    refundedHint: "رُدّ مبلغ هذا الشهر إليك، فلا يُحسب في سجلّ تبرّعاتك.",
    payNow: "ادفع الآن",
    invoices: "فواتير الشهر",
    invoice: "الفاتورة",
    providerReceipt: "إيصال المزوّد",
    txAt: (provider: string) => `المعاملة لدى ${provider}`,
    provider: "المزوّد",
    copyTx: "نسخ رقم المعاملة",
    copiedTx: "نُسخ رقم المعاملة",
    receipt: "إيصال الشهر",
    copyReceipt: "نسخ الإيصال",
    copiedReceipt: "نُسخ الإيصال",
    verifyOpen: "تحقّق من إيصالٍ محفوظ",
    receiptHint:
      "يُحسب من حقائق الشهر: الفواتير ومعاملاتها، والمدفوع، والتحويل، والوصول وتاريخه. إن تغيّر شيءٌ منها لاحقاً تغيّر الإيصال.",
    savedReceipt: "الإيصال المحفوظ",
    verify: "تحقّق",
    verifyFailed: "تعذّر التحقّق",
    match: "يطابق، لم يتغيّر شيء",
    noMatch: "لا يطابق: تغيّرت حقيقةٌ من حقائق الشهر، فراسِل الإدارة",
    report: (period: string) => `تقرير ${period} المعتمد`,
    learned: "ما اجتازه في هذا الشهر",
    firstDelivered: "أوّل شهرٍ وصل الطفل بمستند",
    anniversary: pluralOf(
      {
        one: "عامٌ مع {1}",
        two: "عامان مع {1}",
        few: "{0} أعوام مع {1}",
        other: "{0} عاماً مع {1}",
      },
      0,
      "ar",
    ),
  },
  en: {
    title: "Sponsorship journey",
    lead: "Everything that happened in your sponsorship, month by month, newest first.",
    empty:
      "The journey starts with the first payment: each month appears here with its steps and receipt.",
    steps: {
      scheduled: "Paid and scheduled",
      transferred: "Sent to the field organization",
      delivered: "Delivered with a document",
    } as Record<PackageStep, string>,
    stepState: (n: number, label: string, state: string) => `Step ${n} of 3: ${label}, ${state}`,
    reached: "done",
    waiting: "not yet",
    monthLine: "This month's steps",
    delivered: (date: string) => `Delivered ${date} with a receipt document`,
    waitingFor: (step: string) => `Waiting for: ${step}`,
    notPaid: "Not paid this month",
    pay: {
      paid: "Paid",
      pending: "Payment being confirmed",
      failed: "Payment failed",
      refunded: "Refunded",
      disputed: "Disputed",
    } as Record<NonNullable<LedgerMonth["payment_status"]>, string>,
    failedHint:
      "This month's payment did not arrive. Complete it now so it reaches the child this cycle.",
    disputedHint:
      "A dispute is open on this payment with the payment provider; the month stays on hold until it is settled.",
    refundedHint:
      "This month's amount was refunded to you, so it does not count in your record of donations.",
    payNow: "Pay now",
    invoices: "Invoices for the month",
    invoice: "Invoice",
    providerReceipt: "Provider receipt",
    txAt: (provider: string) => `Transaction at ${provider}`,
    provider: "the provider",
    copyTx: "Copy transaction number",
    copiedTx: "Transaction number copied",
    receipt: "Monthly receipt",
    copyReceipt: "Copy receipt",
    copiedReceipt: "Receipt copied",
    verifyOpen: "Check a saved receipt",
    receiptHint:
      "Computed from the month's facts: invoices and their transactions, the amount paid, the transfer, and the delivery and its date. If any of them changes later, the receipt changes.",
    savedReceipt: "Saved receipt",
    verify: "Check",
    verifyFailed: "Couldn't check",
    match: "Matches, nothing has changed",
    noMatch: "Doesn't match: a fact of the month has changed, so please contact the administration",
    report: (period: string) => `Approved report for ${period}`,
    learned: "Passed this month",
    firstDelivered: "First month delivered to the child with a document",
    anniversary: pluralOf({ one: "{0} year with {1}", other: "{0} years with {1}" }),
  },
});

const STEP_ICONS: Record<PackageStep, typeof Banknote> = {
  scheduled: Banknote,
  transferred: Landmark,
  delivered: HandHeart,
};

/**
 * خطّ الطرد لشهر: مُجدول ← حُوِّل ← وصل، بالنصّ واللون معاً، ويُعلن كلّ محطّةٍ وموضعها.
 * يتبع اتجاه الصفحة (يمين إلى يسار في العربية).
 */
export function PackageSteps({
  m,
  compact = false,
  className,
}: {
  m: LedgerMonth;
  compact?: boolean;
  className?: string;
}) {
  const c = useCopy(COPY);
  const line = packageLine(m);
  return (
    <ol aria-label={c.monthLine} className={cn("flex items-start gap-1", className)}>
      {PACKAGE_STEPS.map((s, i) => {
        const done = stepReached(line, s);
        const Icon = STEP_ICONS[s];
        return (
          <li
            key={s}
            aria-label={c.stepState(i + 1, c.steps[s], done ? c.reached : c.waiting)}
            className="min-w-0 flex-1"
          >
            <span
              aria-hidden="true"
              className={cn("block h-1.5 rounded-full", done ? "bg-primary" : "bg-border")}
            />
            {!compact && (
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1.5 flex items-center gap-1 text-xs leading-5",
                  done ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {done ? (
                  <Check className="size-3.5 shrink-0 text-primary" strokeWidth={2.5} />
                ) : (
                  <Icon className="size-3.5 shrink-0" strokeWidth={1.5} />
                )}
                <span className="min-w-0">{c.steps[s]}</span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * رحلة الكفالة: خطٌّ واحد مجموعٌ بالشهر، الأحدث أولاً، برأس شهرٍ ثابتٍ ميلاديّ وتحته الهجري.
 * فيه الأشهر بمحطّاتها وفواتيرها وإيصالها، والتقارير المعتمدة، وما اجتازه الطفل، والمحطّات.
 * ما لم يحدث بعدُ يُقال كما هو، ولا يُوهَم بإنجاز.
 */
export function SponsorshipJourney({
  ledger,
  reports = [],
  learned = {},
  onPay,
  paying = false,
  now,
}: {
  ledger: SponsorshipLedger;
  reports?: JourneyReport[];
  /** الجلسات التي اجتازها الطفل في كلّ شهر — من رحلة التأهيل. */
  learned?: Record<string, string[]>;
  /** «ادفع الآن» لشهرٍ تعذّر دفعه */
  onPay?: () => void;
  paying?: boolean;
  now?: Date;
}) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const groups = journeyByMonth(ledger, reports, learned, now);
  const s = ledger.sponsorship;

  return (
    <section aria-labelledby="journey-h">
      <h2 id="journey-h" className="text-lg font-bold">
        {c.title}
      </h2>
      <p className="mt-1 text-sm leading-7 text-muted-foreground">{c.lead}</p>
      {groups.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {c.empty}
        </p>
      ) : (
        <div className="mt-4 space-y-6">
          {groups.map((g, gi) => (
            <section key={g.month} aria-labelledby={`m-${g.month}`}>
              <h3
                id={`m-${g.month}`}
                className="sticky top-0 z-10 -mx-1 flex flex-wrap items-baseline gap-x-2 bg-secondary/80 px-1 py-2 backdrop-blur-sm"
              >
                <span className="font-bold">{monthLabel(g.month, locale)}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {hijriLabel(g.month, locale)}
                </span>
              </h3>
              <ul className="mt-2 space-y-2">
                {sortEvents(g.events).map((e, i) => (
                  <EventRow
                    key={`${e.kind}-${i}`}
                    e={e}
                    ledger={ledger}
                    currency={s.currency}
                    defaultOpen={gi === 0}
                    onPay={onPay}
                    paying={paying}
                    locale={locale}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

const ORDER: Record<JourneyEvent["kind"], number> = {
  milestone: 0,
  report: 1,
  learned: 2,
  month: 3,
};
const sortEvents = (es: JourneyEvent[]) => [...es].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);

function EventRow({
  e,
  ledger,
  currency,
  defaultOpen,
  onPay,
  paying,
  locale,
}: {
  e: JourneyEvent;
  ledger: SponsorshipLedger;
  currency: string;
  defaultOpen: boolean;
  onPay: (() => void) | undefined;
  paying: boolean;
  locale: Locale;
}) {
  const c = useCopy(COPY);
  if (e.kind === "month")
    return (
      <MonthNode
        m={e.m}
        currency={currency}
        sponsorshipId={ledger.sponsorship.id}
        defaultOpen={defaultOpen}
        onPay={onPay}
        paying={paying}
      />
    );
  const card =
    "flex items-start gap-3 rounded-2xl bg-card px-4 py-3 text-sm leading-7 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)]";
  if (e.kind === "report")
    return (
      <li className={card}>
        <FileText
          className="mt-1 size-4 shrink-0 text-primary"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="min-w-0">
          <span className="block font-semibold">{c.report(e.report.period)}</span>
          {e.report.published_at && (
            <span className="block text-xs text-muted-foreground">
              {formatDate(e.report.published_at, locale)}
            </span>
          )}
        </span>
      </li>
    );
  if (e.kind === "learned")
    return (
      <li className={card}>
        <GraduationCap
          className="mt-1 size-4 shrink-0 text-primary"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="min-w-0">
          <span className="block font-semibold">{c.learned}</span>
          <span className="block">{e.titles.join(" · ")}</span>
        </span>
      </li>
    );
  const ms = e.milestone;
  return (
    <li className={cn(card, "bg-primary/6")}>
      <Award
        className="mt-1 size-4 shrink-0 text-bridge-ink"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className="font-semibold">
        {ms.kind === "first_delivered" ? (
          c.firstDelivered
        ) : (
          <>{c.anniversary(ms.years, ledger.orphan.display_name)}</>
        )}
      </span>
    </li>
  );
}

function MonthNode({
  m,
  currency,
  sponsorshipId,
  defaultOpen,
  onPay,
  paying,
}: {
  m: LedgerMonth;
  currency: string;
  sponsorshipId: string;
  defaultOpen: boolean;
  onPay: (() => void) | undefined;
  paying: boolean;
}) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const [open, setOpen] = useState(defaultOpen);
  const line = packageLine(m);
  const next = PACKAGE_STEPS.find((s) => !stepReached(line, s));
  const status = m.payment_status;
  const summary = line.issue
    ? c.pay[line.issue]
    : line.refunded
      ? c.pay.refunded
      : line.reached === "delivered"
        ? c.delivered(m.delivered_at ? formatDate(m.delivered_at, locale) : "")
        : line.reached === null
          ? c.notPaid
          : next
            ? c.waitingFor(c.steps[next])
            : "";

  return (
    <li className="rounded-2xl bg-card shadow-[0_0_0_1px_rgb(0_0_0/0.06)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-start"
      >
        <span
          aria-hidden="true"
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-full",
            line.reached === "delivered"
              ? "bg-primary text-primary-foreground"
              : line.issue
                ? "bg-destructive text-white"
                : "bg-secondary",
          )}
        >
          {line.reached === "delivered" ? (
            <Check className="size-3.5" strokeWidth={3} />
          ) : line.issue ? (
            <TriangleAlert className="size-3.5" />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{summary}</span>
          {Number(m.paid) > 0 && (
            <span className="block text-xs text-muted-foreground tabular-nums">
              {formatMoney(m.paid, currency, locale)}
            </span>
          )}
        </span>
        {status && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
              status === "paid" && "bg-primary/10 text-primary",
              (status === "failed" || status === "disputed") &&
                "bg-destructive/10 text-destructive",
              (status === "pending" || status === "refunded") && "bg-secondary text-foreground",
            )}
          >
            {c.pay[status]}
          </span>
        )}
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="border-t border-border px-4 pt-4 pb-4">
          <PackageSteps m={m} />
          {line.issue === "failed" && (
            <div className="mt-4 rounded-xl bg-destructive/8 p-3 text-sm leading-7">
              <p>{c.failedHint}</p>
              {onPay && (
                <Button className="mt-2 min-h-11" onClick={onPay} disabled={paying}>
                  {paying && <Loader2 className="size-4 animate-spin" />}
                  {c.payNow}
                </Button>
              )}
            </div>
          )}
          {line.issue === "disputed" && (
            <p className="mt-4 rounded-xl bg-destructive/8 p-3 text-sm leading-7">
              {c.disputedHint}
            </p>
          )}
          {line.refunded && (
            <p className="mt-4 rounded-xl bg-secondary/60 p-3 text-sm leading-7">
              {c.refundedHint}
            </p>
          )}
          {(m.payments?.length ?? 0) > 0 && <Invoices payments={m.payments!} />}
          {m.receipt && (
            <Receipt receipt={m.receipt} month={m.month} sponsorshipId={sponsorshipId} />
          )}
        </div>
      )}
    </li>
  );
}

/** فواتير الشهر: رقمنا، ورقم المعاملة لدى المزوّد كما في كشف البطاقة. */
function Invoices({ payments }: { payments: LedgerPayment[] }) {
  const c = useCopy(COPY);
  const locale = useLocale();
  // في جلسة التجربة تحمل الفاتورة علامة «بيانات نموذجية» داخلها، لا في رأس الصفحة وحده.
  const demo = useDemo();
  return (
    <>
      {demo && <SampleBadge className="mt-4 inline-block" />}
      <ul className="mt-4 space-y-2" aria-label={c.invoices}>
        {payments.map((p) => (
          <li key={p.invoice_no} className="rounded-xl bg-secondary/40 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-xs text-muted-foreground">{c.invoice}</span>
              <bdi dir="ltr" className="font-mono font-semibold">
                {p.invoice_no}
              </bdi>
              <span className="tabular-nums">{formatMoney(p.amount, p.currency, locale)}</span>
              <span
                className={cn(
                  "text-xs font-medium",
                  p.status === "paid"
                    ? "text-primary"
                    : p.status === "refunded"
                      ? "text-muted-foreground"
                      : "text-destructive",
                )}
              >
                {c.pay[p.status]}
              </span>
              {p.receipt_url && (
                <a
                  href={p.receipt_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="ms-auto inline-flex min-h-11 items-center text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  {c.providerReceipt}
                </a>
              )}
            </div>
            {p.provider_payment_id && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{c.txAt(p.provider === "creem" ? "Creem" : (p.provider ?? c.provider))}</span>
                <bdi dir="ltr" className="max-w-[16rem] truncate font-mono text-foreground">
                  {p.provider_payment_id}
                </bdi>
                <button
                  type="button"
                  aria-label={c.copyTx}
                  className="grid size-11 place-items-center rounded-full hover:bg-secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(p.provider_payment_id!);
                    toast.success(c.copiedTx);
                  }}
                >
                  <Copy className="size-3.5" aria-hidden="true" />
                </button>
                {p.paid_at && <span>· {formatDate(p.paid_at, locale)}</span>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/** الإيصال: يُنسخ ويُحفظ، ويُتحقّق منه لاحقاً (`sponsor.verifyReceipt`). */
function Receipt({
  receipt,
  month,
  sponsorshipId,
}: {
  receipt: string;
  month: string;
  sponsorshipId: string;
}) {
  const c = useCopy(COPY);
  const verify = useDataFn("sponsor.verifyReceipt", verifyLedgerReceipt);
  const demo = useDemo();
  const [checking, setChecking] = useState(false);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<null | boolean>(null);

  return (
    <div className="mt-4 rounded-xl bg-secondary/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{c.receipt}</span>
        {demo && <SampleBadge />}
        <bdi dir="ltr" className="font-mono text-sm font-semibold">
          {receipt}
        </bdi>
        <Button
          size="icon"
          variant="ghost"
          className="size-11"
          aria-label={c.copyReceipt}
          onClick={async () => {
            await navigator.clipboard.writeText(receipt);
            toast.success(c.copiedReceipt);
          }}
        >
          <Copy className="size-3.5" />
        </Button>
        <button
          type="button"
          onClick={() => setChecking((v) => !v)}
          className="ms-auto inline-flex min-h-11 items-center text-xs font-medium text-primary"
          aria-expanded={checking}
        >
          {c.verifyOpen}
        </button>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{c.receiptHint}</p>
      {checking && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const r = await verify({ data: { sponsorshipId, month, receipt: input } });
              setResult(r.ok ? r.match : null);
              if (!r.ok) toast.error(c.verifyFailed);
            } catch {
              toast.error(c.verifyFailed);
            }
          }}
        >
          <Input
            dir="ltr"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setResult(null);
            }}
            placeholder="XXXX-XXXX-XXXX"
            aria-label={c.savedReceipt}
            className="h-11 w-48 font-mono text-base md:text-sm"
          />
          <Button
            type="submit"
            variant="outline"
            className="min-h-11"
            disabled={input.trim().length < 12}
          >
            {c.verify}
          </Button>
          {result !== null && (
            <span
              role="status"
              className={cn("text-sm font-medium", result ? "text-primary" : "text-destructive")}
            >
              {result ? c.match : c.noMatch}
            </span>
          )}
        </form>
      )}
    </div>
  );
}
