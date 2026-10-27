import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Printer } from "lucide-react";

import { KahataynMark } from "@/components/brand/KahataynMark";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/config/brand";
import { formatDate, formatMoney } from "@/lib/format";
import {
  getDonorDashboard,
  getDonorPledges,
  KIND_LABELS,
  TARGET_LABELS,
} from "@/lib/workspaces.functions";

export const Route = createFileRoute("/_authenticated/donor/$entityId/report")({
  head: () => ({
    meta: [{ title: `تقرير الأثر — ${BRAND.name}` }, { name: "robots", content: "noindex" }],
  }),
  component: DonorReport,
});

/**
 * تقرير الأثر للجهة المانحة — لمجلس إدارتها. يُطبع أو يُحفظ PDF من
 * المتصفّح. لا يحمل اسم طفلٍ حقيقياً ولا صورة: الأهداف بأسمائها العامّة.
 */
function DonorReport() {
  const { entityId } = Route.useParams();
  const fetchDash = useServerFn(getDonorDashboard);
  const fetchPledges = useServerFn(getDonorPledges);
  const { data: dash, isPending } = useQuery({
    queryKey: ["donor", entityId],
    queryFn: () => fetchDash({ data: { entityId } }),
  });
  const { data: pledges = [] } = useQuery({
    queryKey: ["donor-pledges", entityId],
    queryFn: () => fetchPledges({ data: { entityId } }),
  });

  if (isPending) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const d = dash?.dashboard;
  if (!d) {
    return (
      <p className="p-10 text-center text-sm">
        لا تملك الاطّلاع على هذه الجهة.{" "}
        <Link to="/workspaces" className="underline">
          بواباتي
        </Link>
      </p>
    );
  }
  const delivered = pledges.filter((p) => p.delivered_at).length;
  const total = pledges
    .filter((p) => p.status !== "cancelled")
    .reduce((a, p) => a + Number(p.amount), 0);
  const cur = pledges[0]?.currency ?? "EUR";

  return (
    <main className="mx-auto max-w-3xl bg-background px-6 py-10 print:max-w-none print:p-0">
      <div className="mb-8 flex items-center justify-between print:hidden">
        <Link to="/donor/$entityId" params={{ entityId }} className="text-sm underline">
          → العودة إلى الجهة
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" /> طباعة / حفظ PDF
        </Button>
      </div>

      <header className="flex items-center justify-between border-b-2 border-primary pb-4">
        <div>
          <p className="font-serif text-2xl font-bold text-primary">{BRAND.name}</p>
          <p className="text-xs text-bridge-ink">{BRAND.tagline}</p>
        </div>
        <KahataynMark className="h-14 w-auto" />
      </header>

      <h1 className="mt-8 text-2xl font-extrabold">تقرير الأثر — {d.entity.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        صدر في {formatDate(new Date().toISOString())}
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          ["مجموع الدعم", formatMoney(total, cur)],
          ["التعهّدات", String(pledges.length)],
          ["سُلّم موثّقاً", String(delivered)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-border p-4">
            <p className="text-xl font-extrabold tabular-nums text-primary">{v}</p>
            <p className="mt-1 text-xs text-muted-foreground">{l}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-8 font-bold">حسب النوع</h2>
      <p className="mt-1 text-sm">
        {KIND_LABELS["qualification"]}: {formatMoney(d.by_kind.qualification ?? 0, cur)} ·{" "}
        {KIND_LABELS["in_kind"]}: {formatMoney(d.by_kind.in_kind ?? 0, cur)}
      </p>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="py-2 text-start font-medium">الهدف</th>
            <th className="py-2 text-start font-medium">النوع</th>
            <th className="py-2 text-start font-medium">المبلغ</th>
            <th className="py-2 text-start font-medium">التسليم</th>
          </tr>
        </thead>
        <tbody>
          {pledges.map((p) => (
            <tr key={p.id} className="border-b border-border/60">
              <td className="py-2">
                {p.target ?? "—"}{" "}
                <span className="text-xs text-muted-foreground">
                  ({TARGET_LABELS[p.target_type]})
                </span>
              </td>
              <td className="py-2">{KIND_LABELS[p.kind]}</td>
              <td className="py-2 tabular-nums">{formatMoney(p.amount, p.currency)}</td>
              <td className="py-2">
                {p.delivered_at ? `موثّق ${formatDate(p.delivered_at)}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
        «موثّق» يعني أن مكتب المنطقة رفع مستند تسليمٍ راجعته المنصّة. لا يحمل هذا التقرير أسماء
        الأطفال الحقيقية ولا صورهم.
      </footer>
    </main>
  );
}
