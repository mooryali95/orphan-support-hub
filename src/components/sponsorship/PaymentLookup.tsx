import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, FileSearch, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoney } from "@/lib/format";
import { lookupPayment, type PaymentLookup as Result } from "@/lib/ledger.functions";
import { cn } from "@/lib/utils";

const STATUS: Record<string, string> = {
  paid: "مدفوعة",
  refunded: "مُردّة",
  disputed: "قيد منازعة",
};
const DELIVERY: Record<string, string> = {
  transferred: "حُوِّلت للجهة",
  delivered: "وصلت الطفل بمستند",
  scheduled: "مجدولة للتحويل",
};

/**
 * «أين ذهبت هذه الدفعة؟» — برقم الفاتورة عندنا أو برقم المعاملة في كشف
 * البطاقة. يُعرض الربط كاملاً، حلقةً حلقة، حتى بصمتها في سجلّ السلامة.
 */
export function PaymentLookup({ admin = false }: { admin?: boolean }) {
  const find = useServerFn(lookupPayment);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<Result | null>(null);

  return (
    <section
      className="rounded-3xl bg-card p-5 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] sm:p-6"
      aria-labelledby="pl-h"
    >
      <h2 id="pl-h" className="flex items-center gap-2 font-bold">
        <FileSearch className="size-5 text-primary" strokeWidth={1.5} aria-hidden="true" />
        تتبّع دفعة
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        برقم الفاتورة (مثل <bdi dir="ltr">INV-2026-000123</bdi>) أو برقم المعاملة كما يظهر في كشف
        بطاقتك
        {admin ? " أو في لوحة المزوّد" : ""}.
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
          aria-label="رقم الفاتورة أو المعاملة"
          className="h-10 flex-1 font-mono text-base md:text-sm"
        />
        <Button type="submit" className="h-10" disabled={busy || ref.trim().length < 6}>
          {busy ? <Loader2 className="animate-spin" /> : "ابحث"}
        </Button>
      </form>

      {r && !r.found && (
        <p role="status" className="map-rise mt-4 text-sm text-muted-foreground">
          لا دفعة بهذا الرقم{admin ? "." : " في دفعاتك."}
        </p>
      )}
      {r?.found && (
        <ol role="status" className="map-rise mt-5 space-y-0" aria-label="ربط الدفعة">
          <Step
            label="الفاتورة"
            value={r.invoice_no}
            mono
            sub={`${formatMoney(r.amount, r.currency)} · ${STATUS[r.status] ?? r.status}`}
          />
          <Step
            label={`المعاملة لدى ${r.provider === "creem" ? "Creem" : (r.provider ?? "المزوّد")}`}
            value={r.provider_payment_id ?? "—"}
            mono
            sub={r.paid_at ? `دُفعت ${formatDate(r.paid_at)}` : undefined}
          />
          <Step label="الكفالة والشهر" value={`${r.orphan} · ${r.month}`} sub={r.orphan_code} />
          <Step
            label="ما جرى للمبلغ"
            value={
              r.delivery_status
                ? (DELIVERY[r.delivery_status] ?? r.delivery_status)
                : "بانتظار التحويل للجهة"
            }
            tone={r.delivery_status === "delivered" ? "done" : "wait"}
          />
          <Step label="إيصال الشهر" value={r.month_receipt ?? "—"} mono />
          <Step
            label="بصمة الفاتورة في سجلّ السلامة"
            value={r.anchor ? `${r.anchor}…` : "—"}
            mono
            last
          />
          <li className="pt-3">
            <Link
              to="/sponsorships/$sponsorshipId"
              params={{ sponsorshipId: r.sponsorship_id }}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary"
            >
              افتح الكفالة
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
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </li>
  );
}
