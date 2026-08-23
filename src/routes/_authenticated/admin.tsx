import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAdminOverview, reviewOrphan, reviewOrganization } from "@/lib/admin.functions";
import { formatDate, formatMoney, ORPHAN_STATUS_LABELS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "لوحة الإدارة — كافل" },
      { name: "description", content: "مراجعة ملفات الأيتام وجهات الرعاية واعتمادها." },
      { property: "og:title", content: "لوحة الإدارة — كافل" },
      { property: "og:description", content: "اعتماد الملفات والجهات ومتابعة الكفالات." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const fetchOverview = useServerFn(getAdminOverview);
  const decideOrphan = useServerFn(reviewOrphan);
  const decideOrg = useServerFn(reviewOrganization);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fetchOverview(),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
  }

  if (isLoading) {
    return (
      <DashboardShell title="لوحة الإدارة">
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardShell>
    );
  }

  if (!data?.allowed) {
    return (
      <DashboardShell title="لوحة الإدارة">
        <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          هذه الصفحة مخصصة لفريق الإدارة فقط.
        </p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title="لوحة الإدارة"
      description="مراجعة الطلبات الواردة واعتماد الملفات والجهات."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="إجمالي الكفالات" value={String(data.stats.sponsorships)} />
        <Stat label="الكفالات النشطة" value={String(data.stats.active)} />
        <Stat label="الالتزام الشهري" value={formatMoney(data.stats.monthlyActive)} />
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-bold">ملفات بانتظار المراجعة ({data.pendingOrphans.length})</h2>
        <div className="mt-4 space-y-3">
          {data.pendingOrphans.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              لا توجد ملفات معلّقة.
            </p>
          )}
          {data.pendingOrphans.map((o) => (
            <div
              key={o.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold">{o.display_name}</h3>
                  <Badge variant="secondary">{ORPHAN_STATUS_LABELS[o.status] ?? o.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {o.code} — {[o.city, o.region].filter(Boolean).join("، ")} — احتياج{" "}
                  {formatMoney(o.monthly_need, o.currency)} — {formatDate(o.created_at)}
                </p>
              </div>
              <Button
                size="sm"
                onClick={async () => {
                  const res = await decideOrphan({ data: { id: o.id, decision: "approved" } });
                  res.ok ? toast.success("تم اعتماد الملف") : toast.error(res.error!);
                  refresh();
                }}
              >
                اعتماد
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const reason = window.prompt("سبب الرفض") ?? undefined;
                  const res = await decideOrphan({
                    data: { id: o.id, decision: "rejected", reason },
                  });
                  res.ok ? toast.success("تم رفض الملف") : toast.error(res.error!);
                  refresh();
                }}
              >
                رفض
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold">جهات رعاية بانتظار الاعتماد ({data.pendingOrgs.length})</h2>
        <div className="mt-4 space-y-3">
          {data.pendingOrgs.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              لا توجد طلبات جهات معلّقة.
            </p>
          )}
          {data.pendingOrgs.map((org) => (
            <div
              key={org.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex-1">
                <h3 className="font-bold">{org.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[org.city, org.region].filter(Boolean).join("، ")} — ترخيص{" "}
                  {org.license_number ?? "—"} — {org.contact_email ?? "—"}
                </p>
              </div>
              <Button
                size="sm"
                onClick={async () => {
                  const res = await decideOrg({ data: { id: org.id, decision: "approved" } });
                  res.ok ? toast.success("تم اعتماد الجهة") : toast.error(res.error!);
                  refresh();
                }}
              >
                اعتماد
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const res = await decideOrg({ data: { id: org.id, decision: "rejected" } });
                  res.ok ? toast.success("تم رفض الطلب") : toast.error(res.error!);
                  refresh();
                }}
              >
                رفض
              </Button>
            </div>
          ))}
        </div>
      </section>
    </DashboardShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-2xl font-extrabold text-primary">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
