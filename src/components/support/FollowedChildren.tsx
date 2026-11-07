import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PageSection } from "@/components/kit/PageSection";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { getMyAccess, getScopeCatalog } from "@/lib/scopes.functions";
import { Name } from "@/components/kit/Name";

const STATUS: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "مأذون",
  rejected: "لم يُقبل",
  revoked: "سُحب",
};

/**
 * «من أتابعهم» — أذوناتي: لكل طفلٍ ما مُنح من نطاقاته ومتى ينقضي.
 * والصفحة نفسها (ملف الطفل) هي اللوحة: تتشكّل أقسامها بما مُنح.
 */
export function FollowedChildren() {
  const fetchMine = useServerFn(getMyAccess);
  const fetchCatalog = useServerFn(getScopeCatalog);
  const { data: rows = [] } = useQuery({ queryKey: ["my-access"], queryFn: () => fetchMine() });
  const { data: catalog } = useQuery({
    queryKey: ["scope-catalog"],
    queryFn: () => fetchCatalog(),
  });
  if (rows.length === 0) return null;
  const label = (k: string) => catalog?.scopes.find((s) => s.key === k)?.label ?? k;

  return (
    <PageSection
      id="followed"
      title="من أتابعهم"
      description="ما أذنت لك الإدارة برؤيته، ومتى ينقضي. افتح الملف لترى الأقسام الممنوحة."
      className="mb-10"
    >
      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              to="/orphans/$orphanId"
              params={{ orphanId: r.orphan_id }}
              className="block rounded-2xl border border-border bg-card p-4 hover:border-primary"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  <Name>{r.orphan}</Name>
                </span>
                <Badge variant={r.status === "approved" ? "default" : "secondary"}>
                  {STATUS[r.status] ?? r.status}
                </Badge>
              </div>
              {r.granted_scopes && r.granted_scopes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.granted_scopes.map((k) => (
                    <span key={k} className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                      {label(k)}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {r.status === "approved" && r.expires_at
                  ? `ينقضي ${formatDate(r.expires_at)}`
                  : `طُلب ${formatDate(r.created_at)}`}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </PageSection>
  );
}
