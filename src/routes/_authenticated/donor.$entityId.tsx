import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { getDonorDashboard, KIND_LABELS, TARGET_LABELS } from "@/lib/workspaces.functions";
import { pageTitle } from "@/config/brand";
import { StatTile } from "@/components/kit/StatTile";

export const Route = createFileRoute("/_authenticated/donor/$entityId")({
  head: () => ({
    meta: [{ title: pageTitle("الجهة المانحة", false) }, { name: "robots", content: "noindex" }],
  }),
  component: DonorPage,
});

function DonorPage() {
  const { entityId } = Route.useParams();
  const fetchDash = useServerFn(getDonorDashboard);
  const { data, isPending } = useQuery({
    queryKey: ["donor", entityId],
    queryFn: () => fetchDash({ data: { entityId } }),
  });

  if (isPending) {
    return (
      <DashboardShell title="الجهة المانحة">
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardShell>
    );
  }
  const d = data?.dashboard;
  if (!d) {
    return (
      <DashboardShell title="الجهة المانحة">
        <p className="text-sm text-muted-foreground">
          لا تملك الاطّلاع على هذه الجهة.{" "}
          <Link to="/workspaces" className="underline">
            بواباتي
          </Link>
        </p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title={d.entity.name} description={`${d.entity.type} · ${d.members} عضو`}>
      {d.entity.status !== "approved" && (
        <p className="mb-6 rounded-lg border border-border bg-secondary/50 p-3 text-sm">
          الجهة قيد مراجعة الإدارة؛ يُفتح الدعم باسمها بعد اعتمادها.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {(["qualification", "in_kind"] as const).map((k) => (
          <StatTile
            key={k}
            label={KIND_LABELS[k] ?? k}
            value={(d.by_kind[k] ?? 0).toLocaleString("ar")}
          />
        ))}
      </div>
      <h2 className="mt-8 text-lg font-bold">توزيع الدعم حسب الهدف</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {Object.keys(d.by_target).length === 0 ? (
          <p className="text-sm text-muted-foreground">لا تعهّدات بعد.</p>
        ) : (
          Object.entries(d.by_target).map(([t, n]) => (
            <Badge key={t} variant="secondary">
              {TARGET_LABELS[t] ?? t}: {n}
            </Badge>
          ))
        )}
      </div>
    </DashboardShell>
  );
}
