import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { OrphanReviewPanel } from "@/components/intake/OrphanReviewPanel";
import { ReportQueue } from "@/components/impact/ReportQueue";
import { DispatchHealthPanel } from "@/components/admin/DispatchHealthPanel";
import { AwaitingTransfers } from "@/components/admin/AwaitingTransfers";
import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { SupervisorAdmin } from "@/components/qualification/SupervisorAdmin";
import { AccessQueue } from "@/components/protection/AccessQueue";
import { ApiClientsAdmin } from "@/components/integrations/ApiClientsAdmin";
import { MirrorStatusPanel } from "@/components/integrations/MirrorStatusPanel";
import { OfficesAdmin } from "@/components/offices/OfficesAdmin";
import { DecisionInbox } from "@/components/admin/DecisionInbox";
import { PlatformRegistries } from "@/components/admin/PlatformRegistries";
import { IntegrityPanel } from "@/components/integrity/IntegrityPanel";
import { SourcesPanel } from "@/components/integrity/SourcesPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAdminOverview, reviewOrphan, reviewOrganization } from "@/lib/admin.functions";
import { formatDate, formatMoney, fundingPercent, ORPHAN_STATUS_LABELS } from "@/lib/format";
import { BRAND, pageTitle } from "@/config/brand";

export const Route = createFileRoute("/_authenticated/admin")({
  /* الإدارة وحدها — راحة لا حماية: الحارس الحقيقي في القاعدة. */
  beforeLoad: ({ context }) => {
    if (!context.roles.includes("admin")) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: pageTitle("لوحة الإدارة") },
      {
        name: "description",
        content: BRAND.description,
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Tab =
  | "inbox"
  | "platform"
  | "overview"
  | "orphans"
  | "sponsors"
  | "queue"
  | "supervisors"
  | "access"
  | "offices"
  | "integrations"
  | "integrity"
  | "countries"
  | "monitoring";

const SECTIONS: Array<[string, Tab[]]> = [
  ["القرارات", ["inbox", "queue", "access", "integrity"]],
  ["الناس", ["orphans", "sponsors", "supervisors", "offices"]],
  ["المنصّة", ["countries", "platform", "integrations"]],
  ["المراقبة", ["overview", "monitoring"]],
];

function AdminPage() {
  const fetchOverview = useServerFn(getAdminOverview);
  const decideOrphan = useServerFn(reviewOrphan);
  const decideOrg = useServerFn(reviewOrganization);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("inbox");
  // ملف واحد مفتوح للمراجعة في كل مرّة: المراجعة قراءة وثائق لا مسح قائمة.
  const [reviewing, setReviewing] = useState<string | null>(null);

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
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </div>
      </DashboardShell>
    );
  }

  if (!data?.allowed) {
    return (
      <DashboardShell title="لوحة الإدارة">
        <p className="border-border bg-card text-muted-foreground rounded-2xl border border-dashed p-10 text-center text-sm">
          هذه الصفحة مخصصة لفريق الإدارة فقط.
        </p>
      </DashboardShell>
    );
  }

  const o = data.overview;
  const cur = o.currency;
  const queueCount = o.pending_orphans.length + o.pending_orgs.length;

  const TABS: Array<[Tab, string, number | null]> = [
    ["inbox", "صندوق القرارات", null],
    ["platform", "سجلّات المنصّة", null],
    ["overview", "نظرة عامة", null],
    ["orphans", "الأيتام", o.orphan_rows.length],
    ["sponsors", "الكفلاء", o.sponsor_rows.length],
    ["queue", "طابور الاعتماد", queueCount],
    ["supervisors", "المشرفون", null],
    ["access", "الإذن بالاطّلاع", null],
    ["offices", "المكاتب والجهات", null],
    ["integrations", "التكامل", null],
    ["integrity", "سلامة الحقيقة", null],
    ["countries", "الدول والمصادر", null],
    ["monitoring", "المراقبة", null],
  ];

  return (
    <DashboardShell
      title="لوحة الإدارة"
      description="صورة النظام كاملة: من يُكفل، وبكم، وكم تبقّى."
    >
      {/* أربعة أقسام، وتحت كلٍّ تبويباته: من يفتح اللوحة يبحث عن قرار أو
          شخص أو إعداد أو حالة — لا عن تسعة تبويباتٍ متجاورة. */}
      <nav aria-label="أقسام الإدارة" className="flex flex-wrap gap-2">
        {SECTIONS.map(([label, tabs]) => {
          const active = tabs.includes(tab);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={active}
              onClick={() => setTab(tabs[0]!)}
              className={
                active
                  ? "rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
                  : "rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              }
            >
              {label}
            </button>
          );
        })}
      </nav>
      <div className="border-border mt-4 flex flex-wrap gap-1 border-b">
        {TABS.filter(([key]) => SECTIONS.find(([, t]) => t.includes(tab))?.[1].includes(key)).map(
          ([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={
                tab === key
                  ? "border-primary text-primary -mb-px border-b-2 px-4 py-2.5 text-sm font-bold"
                  : "text-muted-foreground hover:text-foreground -mb-px border-b-2 border-transparent px-4 py-2.5 text-sm font-medium"
              }
            >
              {label}
              {count !== null && count > 0 && (
                <span className="bg-secondary text-foreground ms-2 rounded-full px-2 py-0.5 text-[11px]">
                  {count}
                </span>
              )}
            </button>
          ),
        )}
      </div>

      {tab === "inbox" && (
        <div className="mt-8">
          <DecisionInbox
            onOpenQueue={() => setTab("queue")}
            onOpenIntegrity={() => setTab("integrity")}
          />
        </div>
      )}

      {tab === "integrity" && (
        <div className="mt-8">
          <IntegrityPanel />
        </div>
      )}

      {tab === "countries" && (
        <div className="mt-8">
          <SourcesPanel />
        </div>
      )}

      {tab === "platform" && (
        <div className="mt-8">
          <PlatformRegistries />
        </div>
      )}

      {tab === "overview" && (
        <div className="mt-8 space-y-10">
          <section>
            <h2 className="text-sm font-bold">الرحلة</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="ملف منشور" value={String(o.orphans.published)} tone="need" />
              <Stat label="مكفول بالكامل" value={String(o.orphans.fully_sponsored)} tone="thrive" />
              <Stat label="جهة معتمدة" value={String(o.organizations.approved)} tone="need" />
              <Stat label="بانتظار المراجعة" value={String(queueCount)} tone="bridge" />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-bold">التمويل الشهري</h2>
            <div className="border-border bg-card mt-4 rounded-2xl border p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-2xl font-extrabold">
                  {formatMoney(o.orphans.monthly_funded, cur)}
                  <span className="text-muted-foreground text-sm font-normal">
                    {" "}
                    من {formatMoney(o.orphans.monthly_need, cur)}
                  </span>
                </p>
                <p className="text-bridge-ink text-sm font-bold">
                  المتبقّي {formatMoney(o.orphans.monthly_gap, cur)}
                </p>
              </div>
              <CrossingProgress
                percent={fundingPercent(o.orphans.monthly_need, o.orphans.monthly_funded)}
                className="mt-4"
                label="تغطية الاحتياج الشهري الكلي"
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Stat label="كافل" value={String(o.sponsors.total)} tone="need" />
              <Stat label="كفالة نشطة" value={String(o.sponsors.active)} tone="thrive" />
              <Stat
                label="التزام شهري"
                value={formatMoney(o.sponsors.monthly_committed, cur)}
                tone="bridge"
              />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-bold">الخزينة</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="المحصّل" value={formatMoney(o.money.collected, cur)} tone="thrive" />
              <Stat label="المصروف" value={formatMoney(o.money.disbursed, cur)} tone="need" />
              <Stat label="الرصيد" value={formatMoney(o.money.balance, cur)} tone="bridge" />
              <Stat label="بانتظار الدفع" value={formatMoney(o.money.pending, cur)} tone="muted" />
            </div>
            {o.money.failed > 0 && (
              <p className="text-destructive mt-3 text-xs">
                دفعات فاشلة بقيمة {formatMoney(o.money.failed, cur)} — تحتاج متابعة.
              </p>
            )}
          </section>
        </div>
      )}

      {tab === "orphans" && (
        <Table
          head={["الملف", "الجهة", "الاحتياج", "المموَّل", "المتبقّي", "الكفلاء", "التغطية"]}
          empty="لا توجد ملفات منشورة."
          rows={o.orphan_rows.map((r) => [
            <div key="n">
              <p className="font-medium">{r.name}</p>
              <p className="text-muted-foreground text-xs">
                {r.code}
                {r.city ? ` — ${r.city}` : ""}
              </p>
            </div>,
            <span key="o" className="text-xs">
              {r.org ?? "—"}
            </span>,
            formatMoney(r.need, cur),
            formatMoney(r.funded, cur),
            <span key="g" className={r.gap > 0 ? "text-bridge-ink font-bold" : "text-shore-thrive"}>
              {r.gap > 0 ? formatMoney(r.gap, cur) : "مكتمل"}
            </span>,
            String(r.sponsors),
            <CrossingProgress key="p" percent={fundingPercent(r.need, r.funded)} />,
          ])}
        />
      )}

      {tab === "monitoring" && <DispatchHealthPanel />}

      {tab === "sponsors" && (
        <Table
          head={["الكافل", "كفالات", "نشطة", "التزام شهري", "المسدَّد", "منذ"]}
          empty="لا يوجد كفلاء بعد."
          rows={o.sponsor_rows.map((r) => [
            <div key="s">
              <p className="font-medium">{r.name || "—"}</p>
              <p className="text-muted-foreground text-xs" dir="ltr">
                {r.email ?? "—"}
              </p>
            </div>,
            String(r.sponsorships),
            String(r.active),
            formatMoney(r.monthly, cur),
            <span key="p" className="text-shore-thrive font-bold">
              {formatMoney(r.paid, cur)}
            </span>,
            formatDate(r.since),
          ])}
        />
      )}

      {tab === "queue" && (
        <div className="mt-8 space-y-10">
          <AwaitingTransfers />

          <section>
            <h2 className="text-lg font-bold">
              ملفات بانتظار المراجعة ({o.pending_orphans.length})
            </h2>
            <div className="mt-4 space-y-3">
              {o.pending_orphans.length === 0 && <Empty>لا توجد ملفات معلّقة.</Empty>}
              {o.pending_orphans.map((p) => (
                <div key={p.id} className="border-border bg-card rounded-2xl border p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold">{p.name}</h3>
                        <Badge variant="secondary">
                          {ORPHAN_STATUS_LABELS[p.status] ?? p.status}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {p.code} — {[p.city, p.region].filter(Boolean).join("، ")} — احتياج{" "}
                        {formatMoney(p.need, cur)} — {formatDate(p.created_at)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-expanded={reviewing === p.id}
                      onClick={() => setReviewing(reviewing === p.id ? null : p.id)}
                    >
                      {reviewing === p.id ? "إغلاق المراجعة" : "مراجعة المستندات"}
                    </Button>
                  </div>

                  {reviewing === p.id && (
                    <OrphanReviewPanel
                      orphanId={p.id}
                      onDecided={async (decision, code, reason) => {
                        const res = await decideOrphan({
                          data: {
                            id: p.id,
                            decision,
                            ...(code ? { code: code as never } : {}),
                            ...(reason ? { reason } : {}),
                          },
                        });
                        if (res.ok) {
                          toast.success(
                            decision === "approved" ? "تم اعتماد الملف" : "تم رفض الملف",
                          );
                          setReviewing(null);
                        } else {
                          toast.error(res.error ?? "تعذّر تنفيذ القرار");
                        }
                        refresh();
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>

          <ReportQueue onDone={refresh} />

          <section>
            <h2 className="text-lg font-bold">جهات بانتظار الاعتماد ({o.pending_orgs.length})</h2>
            <div className="mt-4 space-y-3">
              {o.pending_orgs.length === 0 && <Empty>لا توجد طلبات جهات معلّقة.</Empty>}
              {o.pending_orgs.map((org) => (
                <div
                  key={org.id}
                  className="border-border bg-card flex flex-wrap items-center gap-3 rounded-2xl border p-4"
                >
                  <div className="flex-1">
                    <h3 className="font-bold">{org.name}</h3>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {[org.city, org.region].filter(Boolean).join("، ")} — ترخيص{" "}
                      {org.license ?? "—"} — {org.email ?? "—"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={async () => {
                      const res = await decideOrg({ data: { id: org.id, decision: "approved" } });
                      if (res.ok) toast.success("تم اعتماد الجهة");
                      else toast.error(res.error ?? "تعذّر اعتماد الجهة");
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
                      if (res.ok) toast.success("تم رفض الطلب");
                      else toast.error(res.error ?? "تعذّر رفض الطلب");
                      refresh();
                    }}
                  >
                    رفض
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "supervisors" && (
        <div className="mt-8">
          <SupervisorAdmin />
        </div>
      )}

      {tab === "access" && (
        <div className="mt-8">
          <AccessQueue />
        </div>
      )}

      {tab === "offices" && (
        <div className="mt-8">
          <OfficesAdmin />
        </div>
      )}

      {tab === "integrations" && (
        <div className="mt-8">
          <ApiClientsAdmin />
          <MirrorStatusPanel />
        </div>
      )}
    </DashboardShell>
  );
}

const TONE: Record<string, string> = {
  need: "text-shore-need",
  bridge: "text-bridge-ink",
  thrive: "text-shore-thrive",
  muted: "text-muted-foreground",
};

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="border-border bg-card rounded-2xl border p-5">
      <p className={`text-2xl font-extrabold ${TONE[tone] ?? TONE["need"]}`}>{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{label}</p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-border text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-sm">
      {children}
    </p>
  );
}

function Table({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="mt-8">
        <Empty>{empty}</Empty>
      </div>
    );
  }
  return (
    <div className="border-border mt-8 overflow-x-auto rounded-2xl border">
      <table className="bg-card w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="bg-secondary/60 border-border border-b">
            {head.map((h) => (
              <th key={h} className="text-muted-foreground px-4 py-3 text-start text-xs font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-border/60 border-b last:border-0">
              {cells.map((c, j) => (
                <td key={j} className="px-4 py-3 align-middle tabular-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
