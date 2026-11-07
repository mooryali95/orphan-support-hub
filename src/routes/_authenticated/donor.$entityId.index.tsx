import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { arCount, entityTypeLabel, MEMBERS } from "@/lib/plural";
import { formatCount } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DONOR_ROLE_LABELS,
  getDonorDashboard,
  getDonorMembers,
  KIND_LABELS,
  setDonorMember,
  TARGET_LABELS,
} from "@/lib/workspaces.functions";
import { pageTitle } from "@/config/brand";
import { StatTile } from "@/components/kit/StatTile";

export const Route = createFileRoute("/_authenticated/donor/$entityId/")({
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
    <DashboardShell
      title={d.entity.name}
      description={[entityTypeLabel(d.entity.type), arCount(d.members, MEMBERS)]
        .filter(Boolean)
        .join(" · ")}
    >
      {d.entity.status !== "approved" && (
        <p className="mb-6 rounded-lg border border-border bg-secondary/50 p-3 text-sm">
          الجهة قيد مراجعة الإدارة؛ يُفتح الدعم باسمها بعد اعتمادها.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {(["qualification", "in_kind"] as const).map((k) => (
          <StatTile key={k} label={KIND_LABELS[k] ?? k} value={formatCount(d.by_kind[k] ?? 0)} />
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

      <div className="mt-8">
        <Button asChild variant="outline" size="sm">
          <Link to="/donor/$entityId/report" params={{ entityId }}>
            تقرير الأثر (طباعة / PDF)
          </Link>
        </Button>
      </div>

      <DonorTeam entityId={entityId} />
    </DashboardShell>
  );
}

/** فريق الجهة: المالك يدعو بالبريد بدورٍ (مالك، مالي، مطّلع) ويزيل. */
function DonorTeam({ entityId }: { entityId: string }) {
  const fetchMembers = useServerFn(getDonorMembers);
  const setMember = useServerFn(setDonorMember);
  const qc = useQueryClient();
  const { data: members = [] } = useQuery({
    queryKey: ["donor-members", entityId],
    queryFn: () => fetchMembers({ data: { entityId } }),
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "finance" | "member">("member");

  async function act(target: string, r: "owner" | "finance" | "member" | "remove") {
    const res = await setMember({ data: { entityId, email: target, role: r } });
    if (!res.ok) {
      toast.error(
        res.error?.includes("last_owner")
          ? "لا تُترك الجهة بلا مالك"
          : "تعذّر التنفيذ — للمالك وحده",
      );
      return;
    }
    toast.success("تمّ");
    setEmail("");
    await qc.invalidateQueries({ queryKey: ["donor-members", entityId] });
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold">فريق الجهة</h2>
      <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
        {members.map((m) => (
          <li key={m.email} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
            <span dir="ltr">{m.email}</span>
            <span className="flex items-center gap-2">
              <Badge variant="secondary">{DONOR_ROLE_LABELS[m.role]}</Badge>
              <Button size="sm" variant="ghost" onClick={() => act(m.email, "remove")}>
                إزالة
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Input
          type="email"
          aria-label="بريد العضو"
          placeholder="بريد العضو"
          className="w-64"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select
          aria-label="الدور"
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {(Object.keys(DONOR_ROLE_LABELS) as Array<keyof typeof DONOR_ROLE_LABELS>).map((k) => (
            <option key={k} value={k}>
              {DONOR_ROLE_LABELS[k]}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={!email.includes("@")} onClick={() => act(email, role)}>
          دعوة
        </Button>
      </div>
    </section>
  );
}
