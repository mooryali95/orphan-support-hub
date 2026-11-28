import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PanelState } from "@/components/admin/PanelState";
import { defineCopy, useCopy } from "@/lib/locale";
import { Button } from "@/components/ui/button";
import { listAwaitingTransfers } from "@/lib/manual-payments.functions";
import { TransferReconcile } from "@/components/admin/TransferReconcile";
import { formatDate, formatMoney } from "@/lib/format";
import { Name } from "@/components/kit/Name";

/**
 * تحويلات بانتظار التأكيد.
 *
 * بلا هذه الشاشة تبقى كفالة التحويل البنكي عالقة عند «بانتظار الدفع»
 * وإن وصل المال، لأن المزوّد اليدوي لا يرسل webhook يُفعّلها. والتفعيل
 * مطابقةٌ بما وصل لا ضغطة (UX-15): `TransferReconcile`.
 */
const COPY = defineCopy("components/admin/AwaitingTransfers", {
  ar: {
    empty: "لا توجد كفالات عالقة بانتظار الدفع.",
    next: "حين يختار كافلٌ التحويل البنكي تظهر كفالته هنا لتطابقها بما وصل.",
    title: (n: number) => `تحويلات بانتظار التأكيد (${n})`,
    monthly: "شهرياً",
    once: "لمرة واحدة",
    reference: (ref: string) => `مرجع ${ref}`,
    close: "إغلاق",
    reconcile: "مطابقة التحويل",
  },
  en: {
    empty: "No sponsorships are waiting for payment.",
    next: "When a sponsor chooses bank transfer, the sponsorship appears here for you to match.",
    title: (n: number) => `Transfers awaiting confirmation (${n})`,
    monthly: "monthly",
    once: "one time",
    reference: (ref: string) => `Reference ${ref}`,
    close: "Close",
    reconcile: "Match transfer",
  },
});

export function AwaitingTransfers() {
  const t = useCopy(COPY);
  const fetchRows = useServerFn(listAwaitingTransfers);
  const [open, setOpen] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["awaiting-transfers"],
    queryFn: () => fetchRows(),
  });

  const rows = (data?.allowed && data.rows) || [];

  return (
    <section>
      <h2 className="text-lg font-bold">{t.title(rows.length)}</h2>
      <div className="mt-4 space-y-3">
        <PanelState
          pending={isPending}
          failed={isError}
          onRetry={() => void refetch()}
          empty={rows.length === 0}
          emptyTitle={t.empty}
          emptyNext={t.next}
        >
          {null}
        </PanelState>
        {rows.map((r) => (
          <div
            key={r.id}
            className="border-border bg-card flex flex-wrap items-center gap-3 rounded-2xl border p-4"
          >
            <div className="flex-1">
              <p className="font-bold">
                <Name>{r.orphanName}</Name>
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {[
                  r.orphanCode,
                  `${formatMoney(r.amount, r.currency)} ${r.type === "monthly" ? t.monthly : t.once}`,
                  t.reference(r.reference),
                  formatDate(r.createdAt),
                ].join(" · ")}
              </p>
            </div>
            <Button
              size="sm"
              variant={open === r.id ? "outline" : "default"}
              aria-expanded={open === r.id}
              onClick={() => setOpen(open === r.id ? null : r.id)}
            >
              {open === r.id ? t.close : t.reconcile}
            </Button>
            {open === r.id && (
              <div className="basis-full">
                <TransferReconcile sponsorshipId={r.id} onDone={() => setOpen(null)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
