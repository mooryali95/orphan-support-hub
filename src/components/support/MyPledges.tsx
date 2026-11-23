import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";
import { getMyPledges, KIND_INFO, TARGET_INFO, type MyPledge } from "@/lib/support.functions";
import { EmptyState } from "@/components/kit/EmptyState";

const STATUS: Record<MyPledge["status"], string> = {
  pending: "بانتظار فتح التحصيل",
  active: "نشط",
  fulfilled: "اكتمل",
  cancelled: "أُلغي",
};

/** المرحلة الأحدث من مسار التسليم إن بدأ، وإلا حالة التعهّد. */
function stageLabel(p: MyPledge): string {
  const last = p.deliveries?.[p.deliveries.length - 1];
  if (last?.stage === "delivered") return "وصل · موثّق";
  if (last?.stage === "preparing") return "قيد التجهيز";
  return STATUS[p.status];
}

/** تعهّدات الداعم — العيني وبناء الأهلية بأهدافهما. */
export function MyPledges() {
  const fetchPledges = useServerFn(getMyPledges);
  const { data } = useQuery({ queryKey: ["my-pledges"], queryFn: () => fetchPledges() });
  const pledges = data?.pledges ?? [];

  return (
    <section className="mb-10 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="brand-rule mb-4 h-[3px] w-10 rounded-full" aria-hidden="true" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">دعمي العيني وبناء الأهلية</h2>
        <Button asChild size="sm">
          <Link to="/support">دعمٌ جديد</Link>
        </Button>
      </div>
      {pledges.length === 0 ? (
        <EmptyState
          className="mt-4"
          title="لم تسجّل دعماً بعد"
          text="اختر يتيماً أو مجموعة أو منطقة أو دولة أو مؤسسة، تأهيلاً أو عيناً."
        />
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {pledges.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span>
                <span className="font-medium">{p.target ?? TARGET_INFO[p.target_type].label}</span>
                <span className="ms-2 text-xs text-muted-foreground">
                  {KIND_INFO[p.kind].label} · {TARGET_INFO[p.target_type].label} ·{" "}
                  {formatDate(p.created_at)}
                </span>
                {/* رقم المرجع نفسه الذي ظهر في شاشة التأكيد */}
                <span
                  dir="ltr"
                  className="ms-2 font-mono text-[11px] tracking-wider text-muted-foreground"
                >
                  {p.id.slice(0, 8).toUpperCase()}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-semibold tabular-nums">
                  {formatMoney(p.amount, p.currency)}
                </span>
                <Badge variant="secondary">{stageLabel(p)}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
