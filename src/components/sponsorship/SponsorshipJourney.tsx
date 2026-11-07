import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Banknote,
  Check,
  ChevronDown,
  GraduationCap,
  Copy,
  HandHeart,
  Landmark,
  Loader2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { flagOf, resolveCountry } from "@/lib/countries";
import { formatDate, formatMoney } from "@/lib/format";
import {
  verifyLedgerReceipt,
  type LedgerMonth,
  type LedgerPayment,
  type SponsorshipLedger,
} from "@/lib/ledger.functions";
import { arCount, type ArForms } from "@/lib/plural";
import { cn } from "@/lib/utils";
import { Name } from "@/components/kit/Name";

const MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];
const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;
const MONTHS_FORMS: ArForms = {
  zero: "لا أشهر",
  one: "شهرٌ واحد",
  two: "شهران",
  few: "{n} أشهر",
  many: "{n} شهراً",
  other: "{n} شهر",
};

/** المحطّات الثلاث لكل شهر — ومن أين يُعرف كلٌّ منها. */
type Station = "paid" | "transferred" | "delivered";
function reached(m: LedgerMonth): Record<Station, boolean> {
  return {
    paid: m.paid > 0,
    transferred: m.delivery_status === "transferred" || m.delivery_status === "delivered",
    delivered: m.delivery_status === "delivered",
  };
}
const STATIONS: Array<[Station, string, typeof Banknote]> = [
  ["paid", "دُفع", Banknote],
  ["transferred", "حُوِّل للجهة", Landmark],
  ["delivered", "وصل الطفل", HandHeart],
];

/**
 * رحلة الكفالة: كل شهرٍ ثلاث محطّات — الدفع، ثم التحويل لجهة الرعاية، ثم
 * الوصول بمستند — ومعه إيصالٌ يُحسب من حقائقه. ما لم يحدث بعدُ يُقال كما
 * هو: «بانتظار…»، لا يُوهَم بإنجاز.
 */
export function SponsorshipJourney({
  ledger,
  learned = {},
}: {
  ledger: SponsorshipLedger;
  /** الجلسات التي اجتازها الطفل في كل شهر — من رحلة التأهيل. */
  learned?: Record<string, string[]>;
}) {
  const s = ledger.sponsorship;
  const past = ledger.months.filter((m) => !m.upcoming);
  const next = ledger.months.find((m) => m.upcoming);
  const delivered = ledger.totals.months_delivered;
  const pct = past.length ? Math.round((delivered / past.length) * 100) : 0;
  const code = resolveCountry(ledger.orphan.country);

  const byYear = useMemo(() => {
    const g = new Map<string, LedgerMonth[]>();
    for (const m of past) g.set(m.month.slice(0, 4), [...(g.get(m.month.slice(0, 4)) ?? []), m]);
    return [...g.entries()];
  }, [past]);

  return (
    <div className="space-y-8">
      {/* ── رأس الرحلة ── */}
      <section className="stagger-in relative overflow-hidden rounded-3xl bg-card p-6 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_12px_32px_-16px_rgb(0_0_0/0.18)] sm:p-8">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(90%_120%_at_100%_0%,var(--color-thrive-tint),transparent_60%)]"
        />
        <div className="relative flex flex-wrap items-center gap-6">
          <Ring pct={pct} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {code && <span aria-hidden="true">{flagOf(code)}</span>}
              {[ledger.orphan.country, ledger.orphan.region].filter(Boolean).join(" · ")}
            </p>
            <h2 className="mt-1 font-serif text-3xl font-bold text-primary">
              <Name>{ledger.orphan.display_name}</Name>
            </h2>
            <p className="mt-2 text-sm leading-7">
              <strong className="tabular-nums">{arCount(delivered, MONTHS_FORMS)}</strong> وصلت
              الطفل موثّقة، من{" "}
              <span className="tabular-nums">{arCount(past.length, MONTHS_FORMS)}</span> منذ{" "}
              {s.started_at ? formatDate(s.started_at) : "بدء الكفالة"}.
            </p>
            {ledger.orphan.locked && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                ملفٌّ مثبّت — لا يُحذف ولا تتغيّر هويته إلا بقرارٍ رسمي بموافقتين
              </p>
            )}
          </div>
        </div>
        {next && (
          <p className="relative mt-6 rounded-2xl bg-secondary/60 px-4 py-3 text-sm">
            القادم: <strong>{monthName(next.month)}</strong> — {formatMoney(next.due, s.currency)}
            {s.next_charge_at ? ` · يُحصَّل ${formatDate(s.next_charge_at)}` : ""}
          </p>
        )}
      </section>

      {/* ── الأشهر ── */}
      {byYear.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          تبدأ الرحلة مع أوّل دفعة: يظهر هنا كل شهرٍ بمحطّاته الثلاث وإيصاله.
        </p>
      ) : (
        byYear.map(([year, months]) => (
          <section key={year} aria-labelledby={`y-${year}`}>
            <h3 id={`y-${year}`} className="text-sm font-bold text-muted-foreground">
              {year}
            </h3>
            <ol className="relative mt-3 space-y-3 before:absolute before:inset-y-3 before:start-[1.15rem] before:w-px before:bg-border">
              {months.map((m, i) => (
                <MonthNode
                  key={m.month}
                  m={m}
                  currency={s.currency}
                  sponsorshipId={s.id}
                  index={i}
                  learned={learned[m.month] ?? []}
                  defaultOpen={year === byYear[0]?.[0] && i === 0}
                />
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}

/** حلقة التقدّم: نسبة الأشهر الواصلة من الأشهر الماضية. */
function Ring({ pct }: { pct: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="relative size-24 shrink-0"
      role="img"
      aria-label={`${pct}% من الأشهر وصلت موثّقة`}
    >
      <svg viewBox="0 0 80 80" className="size-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className="stroke-secondary" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className="stroke-primary transition-[stroke-dashoffset] duration-1000 ease-[var(--ease-out)] motion-reduce:transition-none"
          style={{ strokeDasharray: c, strokeDashoffset: c * (1 - pct / 100) }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xl font-extrabold tabular-nums text-primary">
        {pct}%
      </span>
    </div>
  );
}

function MonthNode({
  m,
  currency,
  sponsorshipId,
  index,
  learned,
  defaultOpen,
}: {
  m: LedgerMonth;
  currency: string;
  sponsorshipId: string;
  index: number;
  learned: string[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const st = reached(m);
  const failed = m.payment_status === "failed" || m.payment_status === "disputed";
  const done = st.delivered;
  const nextStep = STATIONS.find(([k]) => !st[k]);

  return (
    <li className="stagger-in relative ps-12" style={{ ["--i" as string]: index }}>
      <span
        aria-hidden="true"
        className={cn(
          "absolute start-2 top-4 grid size-6 place-items-center rounded-full ring-4 ring-background",
          done
            ? "bg-primary text-primary-foreground"
            : failed
              ? "bg-destructive text-white"
              : st.paid
                ? "bg-card shadow-[0_0_0_2px_var(--color-bridge)]"
                : "bg-card shadow-[0_0_0_1.5px_var(--color-border)]",
        )}
      >
        {done ? (
          <Check className="size-3.5" strokeWidth={3} />
        ) : failed ? (
          <TriangleAlert className="size-3.5" />
        ) : null}
      </span>
      <div className="rounded-2xl bg-card shadow-[0_0_0_1px_rgb(0_0_0/0.06)]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 px-4 py-3 text-start"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{monthName(m.month)}</span>
            <span className="block text-xs text-muted-foreground">
              {failed
                ? "تعذّر الدفع — يُعاد تلقائياً أو من لوحتك"
                : done
                  ? `وصل ${m.delivered_at ? formatDate(m.delivered_at) : ""} · موثّق`
                  : nextStep
                    ? `بانتظار: ${nextStep[1]}`
                    : ""}
            </span>
          </span>
          {/* المحطّات مصغّرة */}
          <span className="flex items-center gap-1" aria-hidden="true">
            {STATIONS.map(([k]) => (
              <span
                key={k}
                className={cn(
                  "h-1.5 w-5 rounded-full transition-colors duration-500",
                  st[k] ? "bg-primary" : "bg-border",
                )}
              />
            ))}
          </span>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
        {open && (
          <div className="map-rise border-t border-border px-4 pt-4 pb-4">
            <ol className="grid grid-cols-3 gap-2">
              {STATIONS.map(([k, label, Icon]) => (
                <li
                  key={k}
                  className={cn(
                    "rounded-xl p-3 text-center",
                    st[k] ? "bg-primary/8 text-primary" : "bg-secondary/50 text-muted-foreground",
                  )}
                >
                  <Icon className="mx-auto size-5" strokeWidth={1.5} aria-hidden="true" />
                  <p className="mt-1.5 text-xs font-semibold">{label}</p>
                  <p className="mt-0.5 text-xs">
                    {k === "paid"
                      ? st.paid
                        ? formatMoney(m.paid, currency)
                        : "لم يُدفع بعد"
                      : k === "delivered"
                        ? st.delivered
                          ? "بمستند استلام"
                          : "ينتظر المستند"
                        : st.transferred
                          ? "إلى جهة الرعاية"
                          : "ينتظر التحويل"}
                  </p>
                </li>
              ))}
            </ol>
            {learned.length > 0 && (
              <div className="mt-4 rounded-xl bg-primary/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <GraduationCap className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  ما اجتازه في هذا الشهر
                </p>
                <ul className="mt-1.5 space-y-1 text-sm">
                  {learned.map((t) => (
                    <li key={t} className="flex items-start gap-1.5">
                      <Check className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(m.payments?.length ?? 0) > 0 && <Invoices payments={m.payments!} />}
            {m.receipt && (
              <Receipt receipt={m.receipt} month={m.month} sponsorshipId={sponsorshipId} />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

const PAY_STATUS: Record<string, [string, string]> = {
  paid: ["مدفوعة", "text-primary"],
  refunded: ["مُردّة", "text-muted-foreground"],
  disputed: ["قيد منازعة", "text-destructive"],
};

/** فواتير الشهر: رقمنا، ورقم المعاملة لدى المزوّد كما في كشف البطاقة. */
function Invoices({ payments }: { payments: LedgerPayment[] }) {
  return (
    <ul className="mt-4 space-y-2" aria-label="فواتير الشهر">
      {payments.map((p) => (
        <li key={p.invoice_no} className="rounded-xl bg-secondary/40 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs text-muted-foreground">الفاتورة</span>
            <bdi dir="ltr" className="font-mono font-semibold">
              {p.invoice_no}
            </bdi>
            <span className="tabular-nums">{formatMoney(p.amount, p.currency)}</span>
            <span className={cn("text-xs font-medium", PAY_STATUS[p.status]?.[1])}>
              {PAY_STATUS[p.status]?.[0] ?? p.status}
            </span>
            {p.receipt_url && (
              <a
                href={p.receipt_url}
                target="_blank"
                rel="noreferrer noopener"
                className="ms-auto text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                إيصال المزوّد
              </a>
            )}
          </div>
          {p.provider_payment_id && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                المعاملة لدى {p.provider === "creem" ? "Creem" : (p.provider ?? "المزوّد")}
              </span>
              <bdi dir="ltr" className="max-w-[16rem] truncate font-mono text-foreground">
                {p.provider_payment_id}
              </bdi>
              <button
                type="button"
                aria-label="نسخ رقم المعاملة"
                className="grid size-7 place-items-center rounded-full hover:bg-secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(p.provider_payment_id!);
                  toast.success("نُسخ رقم المعاملة");
                }}
              >
                <Copy className="size-3.5" aria-hidden="true" />
              </button>
              {p.paid_at && <span>· {formatDate(p.paid_at)}</span>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** الإيصال: يُنسخ ويُحفظ، ويُتحقّق منه لاحقاً. */
function Receipt({
  receipt,
  month,
  sponsorshipId,
}: {
  receipt: string;
  month: string;
  sponsorshipId: string;
}) {
  const verify = useServerFn(verifyLedgerReceipt);
  const [checking, setChecking] = useState(false);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<null | boolean>(null);

  return (
    <div className="mt-4 rounded-xl bg-secondary/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">إيصال الشهر</span>
        <bdi dir="ltr" className="font-mono text-sm font-semibold tracking-wider">
          {receipt}
        </bdi>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label="نسخ الإيصال"
          onClick={async () => {
            await navigator.clipboard.writeText(receipt);
            toast.success("نُسخ الإيصال");
          }}
        >
          <Copy className="size-3.5" />
        </Button>
        <button
          type="button"
          onClick={() => setChecking((c) => !c)}
          className="ms-auto text-xs font-medium text-primary"
          aria-expanded={checking}
        >
          تحقّق من إيصالٍ محفوظ
        </button>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        يُحسب من حقائق الشهر: الفواتير ومعاملاتها لدى المزوّد، والمدفوع، والتحويل، والوصول وتاريخه.
        إن تغيّر شيءٌ منها لاحقاً تغيّر الإيصال.
      </p>
      {checking && (
        <form
          className="map-rise mt-3 flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await verify({ data: { sponsorshipId, month, receipt: input } });
            setResult(r.ok ? r.match : null);
            if (!r.ok) toast.error("تعذّر التحقّق");
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
            aria-label="الإيصال المحفوظ"
            className="h-9 w-44 font-mono text-base md:text-sm"
          />
          <Button type="submit" size="sm" variant="outline" disabled={input.trim().length < 12}>
            تحقّق
          </Button>
          {result !== null && (
            <span
              role="status"
              className={cn("text-sm font-medium", result ? "text-primary" : "text-destructive")}
            >
              {result
                ? "يطابق — لم يتغيّر شيء"
                : "لا يطابق — تغيّرت حقيقةٌ من حقائق الشهر؛ راسِل الإدارة"}
            </span>
          )}
        </form>
      )}
    </div>
  );
}

export function JourneyLoading() {
  return <Loader2 className="mx-auto my-16 size-6 animate-spin text-muted-foreground" />;
}
