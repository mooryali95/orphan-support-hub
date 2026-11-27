import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { useDemo } from "@/lib/demo-mode";
import { useCopy } from "@/lib/locale";
import { shareOf } from "@/lib/trust-center";
import { getTrustOverview } from "@/lib/trust-center.functions";
import { cn } from "@/lib/utils";

import { TODAY_COPY } from "./copy";
import { isOverdue, type Filters, type QueueItem } from "./queue";

/**
 * أربعة مؤشّراتٍ فوق «اليوم»، وكلٌّ رابطٌ إلى قائمته المرشَّحة: حصّة الموثَّق
 * (`getTrustOverview`)، والتعارضات الحرجة، وما تجاوز مهلته، والتحويلات المنتظرة.
 * في العرض تحمل شارة «عيّنة»: رقمٌ نموذجيّ لا يمرّ نتيجةً.
 */
export function TodayTiles({
  items,
  onFilter,
  onOpenTrust,
}: {
  items: readonly QueueItem[];
  onFilter: (patch: Partial<Filters>) => void;
  onOpenTrust: () => void;
}) {
  const t = useCopy(TODAY_COPY);
  const demo = useDemo();
  const fetchOverview = useDataFn("trust.overview", getTrustOverview);
  const overview = useQuery({
    queryKey: useDataKey(["trust-overview"]),
    queryFn: () => fetchOverview(),
  });
  const rows = overview.data?.ok ? overview.data.data : null;
  const files = rows?.reduce((a, r) => a + r.files, 0) ?? 0;
  const verified = rows?.reduce((a, r) => a + r.verified, 0) ?? 0;
  const critical = rows?.reduce((a, r) => a + r.critical, 0) ?? null;
  const share = rows ? shareOf(verified, files) : null;
  const now = Date.now();

  const tiles: Array<{ label: string; value: string | null; onClick: () => void; tone: string }> = [
    {
      label: t.tiles.verified,
      value: rows ? (share === null ? "—" : `${share}%`) : null,
      onClick: onOpenTrust,
      tone: "text-shore-thrive",
    },
    {
      label: t.tiles.flagged,
      value: critical === null ? null : String(critical),
      onClick: () => onFilter({ kind: "conflict", sev: "critical" }),
      tone: "text-destructive",
    },
    {
      label: t.tiles.overdue,
      value: String(items.filter((i) => i.can_settle && isOverdue(i, now)).length),
      onClick: () => onFilter({ age: "overdue" }),
      tone: "text-bridge-ink",
    },
    {
      label: t.tiles.transfers,
      value: String(items.filter((i) => i.kind === "transfer").length),
      onClick: () => onFilter({ kind: "transfer" }),
      tone: "text-primary",
    },
  ];

  return (
    <ul aria-label={t.tiles.label} className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <li key={tile.label}>
          <button
            type="button"
            onClick={tile.onClick}
            className="border-border bg-card hover:border-primary/50 focus-visible:ring-ring relative flex h-full min-h-24 w-full flex-col rounded-2xl border p-4 text-start transition-[border-color,transform] focus-visible:ring-2 focus-visible:outline-none active:scale-[0.98]"
          >
            {demo && (
              <span className="bg-bridge/15 text-bridge-ink absolute end-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold">
                <FlaskConical className="size-3" aria-hidden="true" />
                {t.tiles.sample}
              </span>
            )}
            {tile.value === null ? (
              overview.isPending ? (
                <Skeleton className="h-8 w-14" aria-hidden="true" />
              ) : (
                <span className="text-muted-foreground text-2xl font-extrabold">—</span>
              )
            ) : (
              <span className={cn("text-2xl leading-8 font-extrabold tabular-nums", tile.tone)}>
                <bdi dir="ltr">{tile.value}</bdi>
              </span>
            )}
            <span className="text-muted-foreground mt-1 text-sm leading-6">{tile.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
