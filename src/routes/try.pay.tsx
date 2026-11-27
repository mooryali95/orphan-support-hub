import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CreditCard, Loader2, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { FxNote } from "@/components/sponsorship/PayCurrency";
import { Button } from "@/components/ui/button";
import { formatMoneyExact } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import { KafalaPromise } from "@/components/KafalaPromise";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
import { canPayIn, quoteFor } from "@/lib/pay-options";
import {
  addGift,
  cleanDedication,
  localTryChild,
  TRY_CURRENCY,
  tryChild,
  tryPayOptions,
} from "@/lib/try-demo";

type Search = {
  child: string;
  amount: number;
  cadence: "monthly" | "one_time";
  for?: string | undefined;
  /** عملة الدفع إن اختار الداعم غير عملة الملفّ؛ وما ليس ممّا يُدفع به للطفل يُهمل عند العرض. */
  cur?: string | undefined;
};

export const Route = createFileRoute("/try/pay")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    child: typeof raw["child"] === "string" ? raw["child"] : "",
    amount: Math.max(5, Math.min(100_000, Number(raw["amount"]) || 0)),
    cadence: raw["cadence"] === "one_time" ? "one_time" : "monthly",
    ...(cleanDedication(raw["for"]) ? { for: cleanDedication(raw["for"]) } : {}),
    ...(typeof raw["cur"] === "string" && /^[A-Z]{3}$/.test(raw["cur"]) ? { cur: raw["cur"] } : {}),
  }),
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return { meta: [{ title: pageTitle(copyOf(COPY, l).pageTitle, false, l) }] };
  },
  component: TryPay,
});

const COPY = defineCopy("routes/try.pay", {
  ar: {
    pageTitle: "ملخّص عطائك · جرّب المنصّة",
    noChild: "لم يُختر طفلٌ بعد.",
    startTrial: "ابدأ التجربة",
    title: "ملخّص عطائك",
    child: "الطفل",
    type: "النوع",
    monthlyKind: "كفالة شهرية",
    oneTimeKind: "عطاءٌ لمرّة واحدة",
    dedication: "صدقةٌ جارية عن",
    fee: "رسوم بوابة الدفع (تقريبية)",
    monthly: "شهرياً",
    amount: "المبلغ",
    renews: "تتجدّد كل شهر، وتوقفها أو تنهيها من «أثري» متى شئت.",
    once: "يُدفع مرّةً واحدة، ويصل الطفل بمستندٍ يثبت تسليمه.",
    card: "الدفع بالبطاقة",
    simulated: "محاكاة",
    confirming: "يُؤكَّد الدفع…",
    pay: (amount: string) => `ادفع ${amount} (محاكاة)`,
    realNote: "في المنصّة الحقيقية يتمّ الدفع عبر بوابةٍ آمنة؛ هنا لا يُخصم شيء.",
    back: "عُد وعدّل المبلغ",
  },
  en: {
    pageTitle: "Your gift summary · Try the platform",
    noChild: "No child has been chosen yet.",
    startTrial: "Start the trial",
    title: "Your gift summary",
    child: "Child",
    type: "Type",
    monthlyKind: "Monthly sponsorship",
    oneTimeKind: "One-time gift",
    dedication: "Ongoing charity on behalf of",
    fee: "Payment gateway fee (approximate)",
    monthly: "Monthly",
    amount: "Amount",
    renews: "Renews each month. Pause or end it from “My impact” whenever you wish.",
    once: "Paid once, and delivered to the child with proof of delivery.",
    card: "Card payment",
    simulated: "Simulated",
    confirming: "Confirming payment…",
    pay: (amount: string) => `Pay ${amount} (simulated)`,
    realNote:
      "On the live platform, payment goes through a secure gateway. Here, nothing is charged.",
    back: "Go back and change the amount",
  },
});

/**
 * دفعٌ محاكى: الشاشة بشكل بوابة الدفع، بلا حقولٍ تُرسل ولا مزوّدٍ يُنادى. يُسجَّل العطاء في
 * المتصفّح وحده ثم ينتقل إلى «أثري» التجربة.
 */
function TryPay() {
  const { child: id, amount, cadence, for: dedication, cur } = Route.useSearch();
  const locale = useLocale();
  const c = useCopy(COPY);
  const data = tryChild(id);
  const child = data ? localTryChild(data, locale) : undefined;
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  // من غادر الصفحة قبل انتهاء «التأكيد» لا يُسجَّل له عطاءٌ ولا يُنقل من حيث ذهب.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!child)
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="text-lg font-bold">{c.noChild}</h1>
        <Link
          to="/try"
          className="mt-4 inline-flex min-h-11 items-center font-bold text-primary hover:underline"
        >
          {c.startTrial}
        </Link>
      </div>
    );

  /* عملة الدفع من الرابط إن كانت ممّا يُدفع به لهذا الطفل، وإلا عملة الملفّ. المبلغ بها كما كُتب،
     وما يُقيَّد لحاجة الطفل بعملة الملفّ هو ما يُحفظ في «أثري». */
  const payOptions = tryPayOptions(child);
  const payCurrency = cur && canPayIn(payOptions, cur) ? cur : TRY_CURRENCY;
  const quote = quoteFor(payOptions, amount, payCurrency);
  const fee = Math.round(amount * 0.05 * 100) / 100;
  function pay() {
    if (busy || !quote) return;
    setBusy(true);
    timer.current = window.setTimeout(() => {
      addGift({
        childId: child!.id,
        amount: quote.credited.amount,
        cadence,
        ...(dedication ? { dedication } : {}),
        ...(quote.fx
          ? {
              paid: {
                amount: quote.charged.amount,
                currency: quote.charged.currency,
                rate: quote.fx.rate,
                asOf: quote.fx.asOf,
                indicative: quote.fx.indicative,
              },
            }
          : {}),
      });
      // replace: زرّ الرجوع من «أثري» يعود إلى ملفّ الطفل لا إلى شاشة دفعٍ تمّ،
      // فلا يُسجَّل العطاء مرّتين بضغطةٍ ثانية.
      void navigate({ to: "/try/pay/return", search: { child: child!.id }, replace: true });
    }, 1400);
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[1fr_1.1fr]">
      <section className="try-rise h-fit rounded-2xl border border-border bg-card p-6 md:p-7">
        <h1 className="font-sans text-xl font-bold">{c.title}</h1>
        <dl className="mt-5 space-y-3.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{c.child}</dt>
            <dd className="font-bold">
              {child.name} · <span className="tabular-nums font-normal">{child.code}</span>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{c.type}</dt>
            <dd className="font-bold">{cadence === "monthly" ? c.monthlyKind : c.oneTimeKind}</dd>
          </div>
          {dedication && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{c.dedication}</dt>
              <dd className="font-bold">{dedication}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{c.fee}</dt>
            <dd className="tabular-nums">{formatMoneyExact(fee, payCurrency, locale)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-border pt-5 text-base">
            <dt className="font-bold">{cadence === "monthly" ? c.monthly : c.amount}</dt>
            <dd className="numeral text-[2rem] text-primary">
              {formatMoney(amount, payCurrency, locale)}
            </dd>
          </div>
        </dl>
        <FxNote quote={quote} childName={child.name} className="mt-4" />
        <p className="mt-4 text-xs leading-6 text-muted-foreground">
          {cadence === "monthly" ? c.renews : c.once}
        </p>
      </section>

      <section
        className="try-rise rounded-2xl border border-border bg-card p-6 shadow-soft md:p-7"
        style={{ animationDelay: "0.1s" }}
        aria-labelledby="try-pay-title"
      >
        <div className="flex items-center justify-between">
          <h2 id="try-pay-title" className="flex items-center gap-2 font-bold">
            <CreditCard className="size-5 text-primary" aria-hidden="true" />
            {c.card}
          </h2>
          <span className="rounded-full bg-bridge/10 px-3 py-1 text-xs font-bold text-bridge-ink">
            {c.simulated}
          </span>
        </div>
        {/* shapes of a card form, deliberately inert: nothing is typed, sent or stored */}
        <div aria-hidden="true" className="mt-5 space-y-3">
          <div
            className="rounded-xl border border-input bg-background px-4 py-3 font-mono text-sm tracking-widest text-muted-foreground"
            dir="ltr"
          >
            4242 4242 4242 4242
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div
              className="rounded-xl border border-input bg-background px-4 py-3 font-mono text-sm text-muted-foreground"
              dir="ltr"
            >
              12 / 29
            </div>
            <div
              className="rounded-xl border border-input bg-background px-4 py-3 font-mono text-sm text-muted-foreground"
              dir="ltr"
            >
              •••
            </div>
          </div>
        </div>
        <KafalaPromise className="mt-6" />
        <Button size="lg" className="mt-3 w-full" disabled={busy} aria-busy={busy} onClick={pay}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {c.confirming}
            </>
          ) : (
            c.pay(formatMoney(amount, payCurrency, locale))
          )}
        </Button>
        <span role="status" className="sr-only">
          {busy ? c.confirming : ""}
        </span>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" aria-hidden="true" />
          {c.realNote}
        </p>
        <Link
          to="/try/$childId"
          params={{ childId: child.id }}
          className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
        >
          {c.back}
        </Link>
      </section>
    </div>
  );
}
