import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CreditCard, Loader2, Lock } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { KafalaPromise } from "@/components/try/KafalaPromise";
import { addGift, cleanDedication, TRY_CURRENCY, tryChild } from "@/lib/try-demo";

type Search = {
  child: string;
  amount: number;
  cadence: "monthly" | "one_time";
  for?: string | undefined;
};

export const Route = createFileRoute("/try/pay")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    child: typeof raw["child"] === "string" ? raw["child"] : "",
    amount: Math.max(5, Math.min(100_000, Number(raw["amount"]) || 0)),
    cadence: raw["cadence"] === "one_time" ? "one_time" : "monthly",
    ...(cleanDedication(raw["for"]) ? { for: cleanDedication(raw["for"]) } : {}),
  }),
  component: TryPay,
});

/**
 * دفعٌ محاكى: الشاشة بشكل بوابة الدفع، بلا حقولٍ تُرسل ولا مزوّدٍ يُنادى. يُسجَّل العطاء في
 * المتصفّح وحده ثم ينتقل إلى «أثري» التجربة.
 */
function TryPay() {
  const { child: id, amount, cadence, for: dedication } = Route.useSearch();
  const child = tryChild(id);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!child)
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <p>لم يُختر طفلٌ بعد.</p>
        <Link to="/try" className="mt-4 inline-flex font-bold text-primary hover:underline">
          ابدأ التجربة
        </Link>
      </div>
    );

  const fee = Math.round(amount * 0.05 * 100) / 100;
  function pay() {
    setBusy(true);
    window.setTimeout(() => {
      addGift({ childId: child!.id, amount, cadence, ...(dedication ? { dedication } : {}) });
      void navigate({ to: "/try/impact", search: { done: child!.id } });
    }, 1400);
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[1fr_1.1fr]">
      <section className="try-rise h-fit rounded-2xl border border-border bg-card p-6 md:p-7">
        <h1 className="font-sans text-xl font-bold">ملخّص عطائك</h1>
        <dl className="mt-5 space-y-3.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">الطفل</dt>
            <dd className="font-bold">
              {child.name} · <span className="tabular-nums font-normal">{child.code}</span>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">النوع</dt>
            <dd className="font-bold">
              {cadence === "monthly" ? "كفالة شهرية" : "عطاءٌ لمرّة واحدة"}
            </dd>
          </div>
          {dedication && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">صدقةٌ جارية عن</dt>
              <dd className="font-bold">{dedication}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">رسوم بوابة الدفع (تقريبية)</dt>
            <dd className="tabular-nums">{formatMoney(fee, TRY_CURRENCY, "ar")}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-border pt-5 text-base">
            <dt className="font-bold">{cadence === "monthly" ? "شهرياً" : "المبلغ"}</dt>
            <dd className="numeral text-[2rem] text-primary">
              {formatMoney(amount, TRY_CURRENCY, "ar")}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-6 text-muted-foreground">
          {cadence === "monthly"
            ? "تتجدّد كل شهر، وتوقفها أو تنهيها من «أثري» متى شئت."
            : "يُدفع مرّةً واحدة، ويصل الطفل بمستندٍ يثبت تسليمه."}
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
            الدفع بالبطاقة
          </h2>
          <span className="rounded-full bg-bridge/10 px-3 py-1 text-xs font-bold text-bridge-ink">
            محاكاة
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
        <Button size="lg" className="mt-3 w-full" disabled={busy} onClick={pay}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              يُؤكَّد الدفع…
            </>
          ) : (
            <>ادفع {formatMoney(amount, TRY_CURRENCY, "ar")} (محاكاة)</>
          )}
        </Button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" aria-hidden="true" />
          في المنصّة الحقيقية يتمّ الدفع عبر بوابةٍ آمنة؛ هنا لا يُخصم شيء.
        </p>
        <Link
          to="/try/$childId"
          params={{ childId: child.id }}
          className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
        >
          عُد وعدّل المبلغ
        </Link>
      </section>
    </div>
  );
}
