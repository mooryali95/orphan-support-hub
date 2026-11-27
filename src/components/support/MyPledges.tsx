import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";
import { getMyPledges, type MyPledge } from "@/lib/support.functions";
import { EmptyState } from "@/components/kit/EmptyState";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { givingCopy } from "@/config/giving-tracks";

const COPY = defineCopy("components/support/MyPledges", {
  ar: {
    title: "دعمي العيني وبناء الأهلية",
    newSupport: "دعمٌ جديد",
    emptyTitle: "لم تسجّل دعماً بعد",
    emptyText: "اختر يتيماً أو مجموعة أو منطقة أو دولة أو مؤسسة، تأهيلاً أو عيناً.",
    status: {
      pending: "بانتظار فتح التحصيل",
      active: "نشط",
      fulfilled: "اكتمل",
      cancelled: "أُلغي",
    } satisfies Record<MyPledge["status"], string>,
    delivered: "وصل · موثّق",
    preparing: "قيد التجهيز",
    targets: {
      orphan: "يتيم",
      group: "مجموعة",
      region: "منطقة",
      country: "دولة",
      institution: "مؤسسة",
    } satisfies Record<MyPledge["target_type"], string>,
  },
  en: {
    title: "My in-kind and capability support",
    newSupport: "New support",
    emptyTitle: "You haven't recorded any support yet",
    emptyText:
      "Choose a child, a group, a region, a country or an organization, for capability building or in kind.",
    status: {
      pending: "Waiting for payments to open",
      active: "Active",
      fulfilled: "Fulfilled",
      cancelled: "Cancelled",
    },
    delivered: "Delivered · documented",
    preparing: "Being prepared",
    targets: {
      orphan: "Child",
      group: "Group",
      region: "Region",
      country: "Country",
      institution: "Organization",
    },
  },
});
type Copy = (typeof COPY)["ar"];

/** المرحلة الأحدث من مسار التسليم إن بدأ، وإلا حالة التعهّد. */
function stageLabel(p: MyPledge, c: Copy): string {
  const last = p.deliveries?.[p.deliveries.length - 1];
  if (last?.stage === "delivered") return c.delivered;
  if (last?.stage === "preparing") return c.preparing;
  return c.status[p.status];
}

/** تعهّدات الداعم — العيني وبناء الأهلية بأهدافهما. */
export function MyPledges() {
  const fetchPledges = useServerFn(getMyPledges);
  const { data } = useQuery({ queryKey: ["my-pledges"], queryFn: () => fetchPledges() });
  const pledges = data?.pledges ?? [];
  const c = useCopy(COPY);
  const locale = useLocale();
  // أسماء الأنواع من مصدرها الواحد (config/giving-tracks) بلغة الواجهة.
  const tracks = givingCopy(locale).tracks;

  return (
    <section className="mb-10 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="brand-rule mb-4 h-[3px] w-10 rounded-full" aria-hidden="true" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{c.title}</h2>
        <Button asChild size="sm">
          <Link to="/support">{c.newSupport}</Link>
        </Button>
      </div>
      {pledges.length === 0 ? (
        <EmptyState className="mt-4" title={c.emptyTitle} text={c.emptyText} />
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {pledges.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span>
                <span className="font-medium">
                  {p.target ? <bdi>{p.target}</bdi> : c.targets[p.target_type]}
                </span>
                <span className="ms-2 text-xs text-muted-foreground">
                  {tracks[p.kind].name} · {c.targets[p.target_type]} ·{" "}
                  {formatDate(p.created_at, locale)}
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
                  {formatMoney(p.amount, p.currency, locale)}
                </span>
                <Badge variant="secondary">{stageLabel(p, c)}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
