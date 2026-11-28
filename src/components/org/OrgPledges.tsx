import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { useGivingCopy } from "@/config/giving-tracks";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { formatDate, formatMoney, isolate } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { getOrgIncomingPledges, type OrgIncomingPledge } from "@/lib/org.functions";

export const PLEDGES_COPY = defineCopy("components/org/OrgPledges", {
  ar: {
    title: "تبرّعات التأهيل والعيني الموجّهة إليكم",
    lead: "يسجّل المكتب تجهيزها وتسليمها بمستند. هويّة الداعم لا تظهر هنا.",
    toOrg: "للجهة",
    delivered: "سُلّم موثّقاً",
    preparing: "يُجهَّز",
    pending: "بانتظار فتح التحصيل",
    office: "بانتظار المكتب",
  },
  en: {
    title: "Capability and in-kind giving directed to you",
    lead: "The office records its preparation and delivery with a document. The supporter's identity is not shown here.",
    toOrg: "For the organization",
    delivered: "Delivered and documented",
    preparing: "Being prepared",
    pending: "Awaiting collection to open",
    office: "Awaiting the office",
  },
});

/**
 * ما وُجّه إلى الجهة من تبرّع التأهيل والتبرّع العيني. للاطّلاع: التجهيز والتسليم يسجّلهما المكتب،
 * والكفالة المادية تظهر في ملفّات الأطفال نفسها.
 */
export function OrgPledges({ orgId }: { orgId: string }) {
  const c = useCopy(PLEDGES_COPY);
  const locale = useLocale();
  const giving = useGivingCopy();
  const fetchPledges = useDataFn("org.incomingPledges", getOrgIncomingPledges);
  const { data } = useQuery({
    queryKey: useDataKey(["org-incoming-pledges", orgId]),
    queryFn: () => fetchPledges({ data: { orgId } }),
  });
  const pledges: OrgIncomingPledge[] = data?.pledges ?? [];
  if (pledges.length === 0) return null;
  const stageLabel = (p: OrgIncomingPledge) =>
    p.stage === "delivered"
      ? c.delivered
      : p.stage === "preparing"
        ? c.preparing
        : p.status === "pending"
          ? c.pending
          : c.office;

  return (
    <section
      aria-labelledby="org-pledges"
      className="mt-8 rounded-2xl border border-border bg-card p-5"
    >
      <h2 id="org-pledges" className="text-base font-bold">
        {c.title}
      </h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{c.lead}</p>
      <ul className="mt-4 divide-y divide-border">
        {pledges.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
            <Badge variant="secondary">{giving.tracks[p.kind].name}</Badge>
            <span className="flex-1">
              {p.orphan ? isolate(p.orphan) : c.toOrg}
              <span className="ms-2 text-xs text-muted-foreground">
                {formatDate(p.created_at, locale)}
              </span>
            </span>
            <span className="font-medium tabular-nums">{formatMoney(p.amount, p.currency)}</span>
            <span className="text-xs text-muted-foreground">{stageLabel(p)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
