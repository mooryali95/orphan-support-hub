import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { useDemo } from "@/lib/demo-mode";
import { trialRoute } from "@/lib/trial-gate";

import { PageSection } from "@/components/kit/PageSection";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { getMyAccess, getScopeCatalog } from "@/lib/scopes.functions";
import { Name } from "@/components/kit/Name";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";

const COPY = defineCopy("components/support/FollowedChildren", {
  ar: {
    title: "من أتابعهم",
    description: "ما أذنت لك الإدارة برؤيته، ومتى ينقضي. افتح الملفّ لترى الأقسام الممنوحة.",
    status: {
      pending: "قيد المراجعة",
      approved: "مأذون",
      rejected: "لم يُقبل",
      revoked: "سُحب",
    } as Record<string, string>,
    expires: (date: string) => `ينقضي ${date}`,
    requested: (date: string) => `طُلب ${date}`,
  },
  en: {
    title: "Children I follow",
    description:
      "What the administration has allowed you to see, and when it expires. Open the file to see the sections granted.",
    status: {
      pending: "Under review",
      approved: "Granted",
      rejected: "Not accepted",
      revoked: "Withdrawn",
    } as Record<string, string>,
    expires: (date: string) => `Expires ${date}`,
    requested: (date: string) => `Requested ${date}`,
  },
});

/**
 * «من أتابعهم» — أذوناتي: لكل طفلٍ ما مُنح من نطاقاته ومتى ينقضي.
 * والصفحة نفسها (ملفّ الطفل) هي اللوحة: تتشكّل أقسامها بما مُنح.
 */
export function FollowedChildren() {
  const fetchMine = useDataFn("access.mine", getMyAccess);
  const fetchCatalog = useDataFn("access.catalog", getScopeCatalog);
  // في التجربة يفتح الرابط ملفّ الطفل الخيالي في /try، لا ملفّاً حقيقياً.
  const demo = useDemo();
  const mineKey = useDataKey(["my-access"]);
  const catalogKey = useDataKey(["scope-catalog"]);
  const c = useCopy(COPY);
  const locale = useLocale();
  const { data: rows = [] } = useQuery({ queryKey: mineKey, queryFn: () => fetchMine() });
  const { data: catalog } = useQuery({
    queryKey: catalogKey,
    queryFn: () => fetchCatalog(),
  });
  if (rows.length === 0) return null;
  const label = (k: string) => catalog?.scopes.find((s) => s.key === k)?.label ?? k;

  return (
    <PageSection id="followed" title={c.title} description={c.description} className="mb-10">
      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              {...(demo
                ? { to: trialRoute(`/try/${encodeURIComponent(r.orphan_id)}`) }
                : { to: "/orphans/$orphanId" as const, params: { orphanId: r.orphan_id } })}
              className="block rounded-2xl border border-border bg-card p-4 hover:border-primary"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  <Name>{r.orphan}</Name>
                </span>
                <Badge variant={r.status === "approved" ? "default" : "secondary"}>
                  {c.status[r.status] ?? r.status}
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
                  ? c.expires(formatDate(r.expires_at, locale))
                  : c.requested(formatDate(r.created_at, locale))}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </PageSection>
  );
}
