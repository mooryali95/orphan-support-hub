import { Link } from "@tanstack/react-router";
import { useDataFn } from "@/lib/data-port";
import { useDemo } from "@/lib/demo-mode";
import { trialRoute } from "@/lib/trial-gate";
import { useState } from "react";
import { ArrowLeft, FileSearch, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoney, isolate } from "@/lib/format";
import { lookupPayment, type PaymentLookup as Result } from "@/lib/ledger.functions";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/sponsorship/PaymentLookup", {
  ar: {
    status: {
      paid: "مدفوعة",
      refunded: "مُردّة",
      disputed: "قيد منازعة",
    } as Record<string, string>,
    delivery: {
      transferred: "حُوِّلت للجهة",
      delivered: "وصلت الطفل بمستند",
      scheduled: "مجدولة للتحويل",
    } as Record<string, string>,
    title: "تتبّع دفعة",
    leadA: "برقم الفاتورة (مثل",
    leadB: ") أو برقم المعاملة كما يظهر في كشف بطاقتك",
    leadAdmin: " أو في لوحة المزوّد",
    inputLabel: "رقم الفاتورة أو المعاملة",
    search: "ابحث",
    notFoundAdmin: "لا دفعة بهذا الرقم.",
    notFound: "لا دفعة بهذا الرقم في دفعاتك.",
    chain: "ربط الدفعة",
    invoice: "الفاتورة",
    transactionAt: (provider: string) => `المعاملة لدى ${provider}`,
    provider: "المزوّد",
    paidOn: (date: string) => `دُفعت ${date}`,
    sponsorshipMonth: "الكفالة والشهر",
    whatHappened: "ما جرى للمبلغ",
    awaitingTransfer: "بانتظار التحويل للجهة",
    receipt: "إيصال الشهر",
    anchor: "بصمة الفاتورة في سجلّ السلامة",
    open: "افتح الكفالة",
  },
  en: {
    status: {
      paid: "Paid",
      refunded: "Refunded",
      disputed: "Disputed",
    } as Record<string, string>,
    delivery: {
      transferred: "Sent to the field organization",
      delivered: "Reached the child, with a document",
      scheduled: "Scheduled for transfer",
    } as Record<string, string>,
    title: "Track a payment",
    leadA: "By invoice number (such as",
    leadB: ") or by the transaction number shown on your card statement",
    leadAdmin: " or in the provider's dashboard",
    inputLabel: "Invoice or transaction number",
    search: "Search",
    notFoundAdmin: "No payment with this number.",
    notFound: "No payment with this number among your payments.",
    chain: "Payment trail",
    invoice: "Invoice",
    transactionAt: (provider: string) => `Transaction at ${provider}`,
    provider: "the provider",
    paidOn: (date: string) => `Paid ${date}`,
    sponsorshipMonth: "Sponsorship and month",
    whatHappened: "What happened to the amount",
    awaitingTransfer: "Waiting to be sent to the field organization",
    receipt: "Monthly receipt",
    anchor: "Invoice fingerprint in the integrity log",
    open: "Open the sponsorship",
  },
});

/**
 * «أين ذهبت هذه الدفعة؟» — برقم الفاتورة عندنا أو برقم المعاملة في كشف
 * البطاقة. يُعرض الربط كاملاً، حلقةً حلقة، حتى بصمتها في سجلّ السلامة.
 */
export function PaymentLookup({ admin = false }: { admin?: boolean }) {
  const find = useDataFn("ledger.lookupPayment", lookupPayment);
  const demo = useDemo();
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<Result | null>(null);
  const c = useCopy(COPY);
  const locale = useLocale();

  return (
    <section
      className="rounded-3xl bg-card p-5 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] sm:p-6"
      aria-labelledby="pl-h"
    >
      <h2 id="pl-h" className="flex items-center gap-2 font-bold">
        <FileSearch className="size-5 text-primary" strokeWidth={1.5} aria-hidden="true" />
        {c.title}
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {c.leadA} <bdi dir="ltr">INV-2026-000123</bdi>
        {c.leadB}
        {admin ? c.leadAdmin : ""}.
      </p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setR(await find({ data: { ref } }));
          setBusy(false);
        }}
      >
        <Input
          dir="ltr"
          value={ref}
          onChange={(e) => {
            setRef(e.target.value);
            setR(null);
          }}
          placeholder="INV-2026-000123"
          aria-label={c.inputLabel}
          className="h-10 flex-1 font-mono text-base md:text-sm"
        />
        <Button type="submit" className="h-10" disabled={busy || ref.trim().length < 6}>
          {busy ? <Loader2 className="animate-spin" /> : c.search}
        </Button>
      </form>

      {r && !r.found && (
        <p role="status" className="map-rise mt-4 text-sm text-muted-foreground">
          {admin ? c.notFoundAdmin : c.notFound}
        </p>
      )}
      {r?.found && (
        <ol role="status" className="map-rise mt-5 space-y-0" aria-label={c.chain}>
          <Step
            label={c.invoice}
            value={r.invoice_no}
            mono
            sub={`${formatMoney(r.amount, r.currency, locale)} · ${c.status[r.status] ?? r.status}`}
          />
          <Step
            label={c.transactionAt(
              r.provider === "creem" ? "Creem" : r.provider ? isolate(r.provider) : c.provider,
            )}
            value={r.provider_payment_id ?? "—"}
            mono
            sub={r.paid_at ? c.paidOn(formatDate(r.paid_at, locale)) : undefined}
          />
          <Step
            label={c.sponsorshipMonth}
            value={`${isolate(r.orphan)} · ${isolate(r.month)}`}
            sub={r.orphan_code}
          />
          <Step
            label={c.whatHappened}
            value={
              r.delivery_status
                ? (c.delivery[r.delivery_status] ?? r.delivery_status)
                : c.awaitingTransfer
            }
            tone={r.delivery_status === "delivered" ? "done" : "wait"}
          />
          <Step label={c.receipt} value={r.month_receipt ?? "—"} mono />
          <Step label={c.anchor} value={r.anchor ? `${r.anchor}…` : "—"} mono last />
          <li className="pt-3">
            <Link
              {...(demo
                ? { to: trialRoute(`/try/sponsorships/${encodeURIComponent(r.sponsorship_id)}`) }
                : {
                    to: "/sponsorships/$sponsorshipId" as const,
                    params: { sponsorshipId: r.sponsorship_id },
                  })}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary"
            >
              {c.open}
              <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
            </Link>
          </li>
        </ol>
      )}
    </section>
  );
}

function Step({
  label,
  value,
  sub,
  mono,
  tone,
  last,
}: {
  label: string;
  value: string;
  sub?: string | undefined;
  mono?: boolean;
  tone?: "done" | "wait";
  last?: boolean;
}) {
  return (
    <li className={cn("relative ps-6 pb-3", !last && "border-s-2 border-border")}>
      <span
        aria-hidden="true"
        className={cn(
          "absolute -start-[5px] top-1 size-2 rounded-full",
          tone === "wait" ? "bg-bridge" : "bg-primary",
        )}
      />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-semibold", mono && "font-mono")}>
        {mono ? <bdi dir="ltr">{value}</bdi> : value}
      </p>
      {sub && <p className="text-xs text-muted-foreground tabular-nums">{sub}</p>}
    </li>
  );
}
