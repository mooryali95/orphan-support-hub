import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { getMyPledges, KIND_INFO, TARGET_INFO, type MyPledge } from "@/lib/support.functions";

const STATUS: Record<MyPledge["status"], string> = {
  pending: "بانتظار فتح التحصيل",
  active: "نشط",
  fulfilled: "اكتمل",
  cancelled: "أُلغي",
};

/** تعهّدات الداعم — العيني وبناء الأهلية بأهدافهما. */
export function MyPledges() {
  const fetchPledges = useServerFn(getMyPledges);
  const { data } = useQuery({ queryKey: ["my-pledges"], queryFn: () => fetchPledges() });
  const pledges = data?.pledges ?? [];

  return (
    <section className="mb-10 rounded-xl border border-border bg-background p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">دعمي العيني وبناء الأهلية</h2>
        <Button asChild size="sm">
          <Link to="/support">دعمٌ جديد</Link>
        </Button>
      </div>
      {pledges.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          لم تسجّل دعماً بعد. اختر يتيماً أو مجموعة أو منطقة أو دولة أو مؤسسة.
        </p>
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
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums font-semibold">
                  {p.amount} {p.currency === "EUR" ? "€" : p.currency}
                </span>
                <Badge variant="secondary">{STATUS[p.status]}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
