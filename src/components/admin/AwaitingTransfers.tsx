import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listAwaitingTransfers } from "@/lib/manual-payments.functions";
import { TransferReconcile } from "@/components/admin/TransferReconcile";
import { formatDate, formatMoney } from "@/lib/format";

/**
 * تحويلات بانتظار التأكيد.
 *
 * بلا هذه الشاشة تبقى كفالة التحويل البنكي عالقة عند «بانتظار الدفع»
 * وإن وصل المال، لأن المزوّد اليدوي لا يرسل webhook يُفعّلها. والتفعيل
 * مطابقةٌ بما وصل لا ضغطة (UX-15): `TransferReconcile`.
 */
export function AwaitingTransfers() {
  const fetchRows = useServerFn(listAwaitingTransfers);
  const [open, setOpen] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["awaiting-transfers"],
    queryFn: () => fetchRows(),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }

  const rows = (data?.allowed && data.rows) || [];

  return (
    <section>
      <h2 className="text-lg font-bold">تحويلات بانتظار التأكيد ({rows.length})</h2>
      <div className="mt-4 space-y-3">
        {rows.length === 0 && (
          <p className="border-border bg-card text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-sm">
            لا توجد كفالات عالقة بانتظار الدفع.
          </p>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            className="border-border bg-card flex flex-wrap items-center gap-3 rounded-2xl border p-4"
          >
            <div className="flex-1">
              <p className="font-bold">{r.orphanName}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {r.orphanCode} — {formatMoney(r.amount, r.currency)}{" "}
                {r.type === "monthly" ? "شهرياً" : "لمرة واحدة"} — مرجع {r.reference} —{" "}
                {formatDate(r.createdAt)}
              </p>
            </div>
            <Button
              size="sm"
              variant={open === r.id ? "outline" : "default"}
              aria-expanded={open === r.id}
              onClick={() => setOpen(open === r.id ? null : r.id)}
            >
              {open === r.id ? "إغلاق" : "مطابقة التحويل"}
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
