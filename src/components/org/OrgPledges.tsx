import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { useGivingCopy } from "@/config/giving-tracks";
import { formatDate, formatMoney, isolate } from "@/lib/format";
import { getOrgIncomingPledges, type OrgIncomingPledge } from "@/lib/org.functions";

function stageLabel(p: OrgIncomingPledge): string {
  if (p.stage === "delivered") return "سُلّم موثّقاً";
  if (p.stage === "preparing") return "يُجهَّز";
  return p.status === "pending" ? "بانتظار فتح التحصيل" : "بانتظار المكتب";
}

/**
 * ما وُجّه إلى الجهة من تبرّع التأهيل والتبرّع العيني. للاطّلاع: التجهيز والتسليم يسجّلهما المكتب،
 * والكفالة المادية تظهر في ملفّات الأطفال نفسها.
 */
export function OrgPledges({ orgId }: { orgId: string }) {
  const giving = useGivingCopy();
  const fetchPledges = useServerFn(getOrgIncomingPledges);
  const { data } = useQuery({
    queryKey: ["org-incoming-pledges", orgId],
    queryFn: () => fetchPledges({ data: { orgId } }),
  });
  const pledges = data?.pledges ?? [];
  if (pledges.length === 0) return null;

  return (
    <section
      aria-labelledby="org-pledges"
      className="mt-8 rounded-2xl border border-border bg-card p-5"
    >
      <h2 id="org-pledges" className="text-base font-bold">
        تبرّعات التأهيل والعيني الموجّهة إليكم
      </h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        يسجّل المكتب تجهيزها وتسليمها بمستند. هويّة المتبرّع لا تظهر هنا.
      </p>
      <ul className="mt-4 divide-y divide-border">
        {pledges.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
            <Badge variant="secondary">{giving.tracks[p.kind].name}</Badge>
            <span className="flex-1">
              {p.orphan ? isolate(p.orphan) : "للجهة"}
              <span className="ms-2 text-xs text-muted-foreground">{formatDate(p.created_at)}</span>
            </span>
            <span className="font-medium">{formatMoney(p.amount, p.currency)}</span>
            <span className="text-xs text-muted-foreground">{stageLabel(p)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
