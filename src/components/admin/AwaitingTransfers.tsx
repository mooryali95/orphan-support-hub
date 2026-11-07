import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listAwaitingTransfers, confirmManualTransfer } from "@/lib/manual-payments.functions";
import { formatDate, formatMoney } from "@/lib/format";
import { Name } from "@/components/kit/Name";

/**
 * تحويلات بانتظار التأكيد.
 *
 * بلا هذه الشاشة تبقى كفالة التحويل البنكي عالقة عند «بانتظار الدفع»
 * وإن وصل المال، لأن المزوّد اليدوي لا يرسل webhook يُفعّلها.
 */
export function AwaitingTransfers() {
  const fetchRows = useServerFn(listAwaitingTransfers);
  const confirm = useServerFn(confirmManualTransfer);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

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

  async function onConfirm(id: string) {
    setBusy(id);
    try {
      const res = await confirm({ data: { sponsorshipId: id } });
      if (!res.ok) {
        toast.error(res.error ?? "تعذّر تأكيد التحويل");
        return;
      }
      toast.success("تم تأكيد الاستلام وتفعيل الكفالة");
      queryClient.invalidateQueries({ queryKey: ["awaiting-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    } finally {
      setBusy(null);
    }
  }

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
              <p className="font-bold">
                <Name>{r.orphanName}</Name>
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {r.orphanCode} — {formatMoney(r.amount, r.currency)}{" "}
                {r.type === "monthly" ? "شهرياً" : "لمرة واحدة"} — مرجع {r.reference} —{" "}
                {formatDate(r.createdAt)}
              </p>
            </div>
            <Button size="sm" onClick={() => onConfirm(r.id)} disabled={busy === r.id}>
              {busy === r.id && <Loader2 className="size-4 animate-spin" />}
              تأكيد الاستلام وتفعيل الكفالة
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
