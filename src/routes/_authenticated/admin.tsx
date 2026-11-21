import { createFileRoute, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { OrphanReviewPanel } from "@/components/intake/OrphanReviewPanel";
import { ReportQueue } from "@/components/impact/ReportQueue";
import { GoLiveReadiness } from "@/components/admin/GoLiveReadiness";
import { DispatchHealthPanel } from "@/components/admin/DispatchHealthPanel";
import { OpsHealthPanel } from "@/components/admin/OpsHealthPanel";
import { AwaitingTransfers } from "@/components/admin/AwaitingTransfers";
import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { SupervisorAdmin } from "@/components/qualification/SupervisorAdmin";
import { AccessQueue } from "@/components/protection/AccessQueue";
import { ApiClientsAdmin } from "@/components/integrations/ApiClientsAdmin";
import { MirrorStatusPanel } from "@/components/integrations/MirrorStatusPanel";
import { StatTile } from "@/components/kit/StatTile";
import { Name } from "@/components/kit/Name";
import { OfficesAdmin } from "@/components/offices/OfficesAdmin";
import DataBuilding from "@/components/admin/data/DataBuilding";
import { DecisionInbox } from "@/components/admin/DecisionInbox";
import { AdminExports, AdminOrphansList, AdminSponsorsList } from "@/components/admin/AdminLists";
import { PlatformRegistries } from "@/components/admin/PlatformRegistries";
import { IntegrityPanel } from "@/components/integrity/IntegrityPanel";
import { SourcesPanel } from "@/components/integrity/SourcesPanel";
import { LocalesPanel } from "@/components/i18n/LocalesPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAdminOverview, getPaymentsReady, reviewOrphan } from "@/lib/admin.functions";
import { getOverviewInbox, getSupportSummary } from "@/lib/admin-overview.functions";
import { goLiveSteps, linkHealth } from "@/lib/go-live";
import {
  formatDate,
  formatMoney,
  formatMoneyTotals,
  fundingPercent,
  ORPHAN_STATUS_LABELS,
} from "@/lib/format";
import type { AdminOverview } from "@/lib/admin.functions";
import { BRAND, pageTitle } from "@/config/brand";
import { getSourcesOverview } from "@/lib/integrity.functions";
import { getDispatchHealth, getOpsHealth } from "@/lib/monitoring.functions";
import { Skeleton } from "@/components/ui/skeleton";
import { defineCopy, dirOf, LocaleProvider, parseLocale, useCopy } from "@/lib/locale";

const COPY = defineCopy("routes/_authenticated/admin", {
  ar: { overviewLink: "لوحة الإدارة — النظرة الشاملة", dataTab: "بناء البيانات" },
  en: { overviewLink: "Management overview", dataTab: "Data building" },
});

// دوالّ الإدارة القائمة تُمرَّر إلى اللوحة من هنا: هذه الصفحة تحملها أصلاً، فلا تُشقّ
// لها قطعٌ مشتركة جديدة تزيد الحزمة الأولى.
const ADMIN_FNS = {
  getAdminOverview,
  getPaymentsReady,
  getOverviewInbox,
  getSupportSummary,
  getSourcesOverview,
  getDispatchHealth,
  getOpsHealth,
  goLiveSteps,
  linkHealth,
};

// لوحة الإدارة في قطعتها: تُحمَّل حين تُفتح، ولا تزيد وزن صفحةٍ أخرى.
const ManagementOverview = lazy(() => import("@/components/admin/overview/ManagementOverview"));

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
  | "home"
  | "inbox"
  | "platform"
  | "overview"
  | "orphans"
  | "sponsors"
  | "data"
  | "queue"
  | "supervisors"
  | "access"
  | "offices"
  | "integrations"
  | "integrity"
  | "countries"
  | "languages"
  | "monitoring";

const SECTIONS: Array<[string, Tab[]]> = [
  ["القرارات", ["inbox", "queue", "access", "integrity"]],
  ["الناس", ["orphans", "sponsors", "data", "supervisors", "offices"]],
  ["المنصّة", ["countries", "languages", "platform", "integrations"]],
  ["المراقبة", ["overview", "monitoring"]],
];

/** ما تقرؤه الصفحة من عنوانها؛ وما عداه يبقى كما هو. */
type Query = {
  tab?: unknown;
  sample?: unknown;
  period?: unknown;
  area?: unknown;
  [key: string]: unknown;
};

const isTab = (v: unknown): v is Tab =>
  typeof v === "string" && SECTIONS.some(([, tabs]) => tabs.includes(v as Tab));

function AdminPage() {
  const fetchOverview = useServerFn(getAdminOverview);
  const decideOrphan = useServerFn(reviewOrphan);
  const queryClient = useQueryClient();
  const copy = useCopy(COPY);
  // التبويب والعيّنة وفترة الاتجاه تعيش في عنوان الصفحة: ‎/admin?tab=monitoring
  // يفتح تبويبه، وزرّ الرجوع يعيد إلى ما قبله، والرابط يُنسخ ويُشارَك. بلا `tab`
  // تهبط الإدارة على «لوحة الإدارة» (النظرة الشاملة). يُقرأ العنوان من الموجِّه
  // مباشرةً بلا مخطّط بحثٍ على المسار، فلا يزيد شيءٌ في الحزمة الأولى.
  const search = useRouterState({ select: (st) => st.location.search as Query });
  const navigate = useNavigate();
  const tab: Tab = isTab(search.tab) ? search.tab : "home";
  const sample = search.sample === 1 || search.sample === "1" || search.sample === true;
  const go = useCallback(
    (
      patch: { tab?: Tab; sample?: boolean; period?: number | null; area?: string },
      replace = false,
    ) => {
      void navigate({
        to: "/admin",
        replace,
        search: ((prev: Query) => {
          const next: Query = { ...prev };
          if (patch.tab !== undefined) {
            if (patch.tab === "home") delete next.tab;
            else next.tab = patch.tab;
            // خانة «بناء البيانات» تخصّ تبويبها وحده.
            if (patch.tab !== "data") delete next.area;
          }
          if (patch.area !== undefined) next.area = patch.area;
          if (patch.sample !== undefined) {
            if (patch.sample) next.sample = 1;
            else delete next.sample;
          }
          if (patch.period !== undefined) {
            if (patch.period === null) delete next.period;
            else next.period = patch.period;
          }
          return next;
        }) as never,
      });
    },
    [navigate],
  );
  const setTab = useCallback((next: Tab) => go({ tab: next }), [go]);
  const actions = useMemo(
    () => ({
      open: (next: Tab) => {
        go({ tab: next });
        window.scrollTo({ top: 0 });
      },
      href: (next: Tab) => `/admin?tab=${next}${sample ? "&sample=1" : ""}`,
      setSample: (on: boolean) => go({ sample: on }, true),
      // `null`: الفترة الافتراضية — لا تُكتب في العنوان.
      setPeriod: (months: number | null) => go({ period: months }, true),
    }),
    [go, sample],
  );
  // ملف واحد مفتوح للمراجعة في كل مرّة: المراجعة قراءة وثائق لا مسح قائمة.
  const [reviewing, setReviewing] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fetchOverview(),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
  }

  if (tab === "home") {
    // هذه اللوحة مترجمة، فيُرفع عنها غلاف العربية الذي يلفّ ما بعد الدخول
    // (انظر route.tsx): تُعرض بلغة الزائر واتجاهها.
    const locale = parseLocale(document.cookie);
    return (
      <LocaleProvider locale={locale}>
        <div dir={dirOf(locale)} lang={locale}>
          <Suspense
            fallback={
              <div className="mx-auto max-w-6xl px-4 py-10" aria-busy="true">
                <Skeleton className="h-9 w-48" />
                <Skeleton className="mt-8 rounded-3xl" style={{ height: "16rem" }} />
              </div>
            }
          >
            <ManagementOverview
              sample={sample}
              period={search.period}
              fns={ADMIN_FNS}
              actions={actions}
            />
          </Suspense>
        </div>
      </LocaleProvider>
    );
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
    ["orphans", "الأيتام", o.orphan_rows_total ?? o.orphan_rows.length],
    ["sponsors", "الكفلاء", o.sponsor_rows_total ?? o.sponsor_rows.length],
    ["data", copy.dataTab, null],
    ["queue", "طابور الاعتماد", queueCount],
    ["supervisors", "المشرفون", null],
    ["access", "الإذن بالاطّلاع", null],
    ["offices", "المكاتب والجهات", null],
    ["integrations", "التكامل", null],
    ["integrity", "سلامة الحقيقة", null],
    ["countries", "الدول والمصادر", null],
    ["languages", "اللغات والترجمة", null],
    ["monitoring", "المراقبة", null],
  ];

  return (
    <DashboardShell
      title="لوحة الإدارة"
      description="صورة النظام كاملة: من يُكفل، وبكم، وكم تبقّى."
    >
      {/* أربعة أقسام، وتحت كلٍّ تبويباته: من يفتح اللوحة يبحث عن قرار أو
          شخص أو إعداد أو حالة — لا عن تسعة تبويباتٍ متجاورة. */}
      <a
        href="/admin"
        onClick={(e) => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          setTab("home");
        }}
        className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight aria-hidden="true" className="size-4" strokeWidth={2} />
        {copy.overviewLink}
      </a>
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
                <span className="bg-secondary text-foreground ms-2 rounded-full px-2 py-0.5 text-xs">
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

      {tab === "languages" && <LocalesPanel />}

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
          <GoLiveReadiness published={o.orphans.published} />
          <section>
            <h2 className="text-sm font-bold">الرحلة</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="ملف منشور" value={String(o.orphans.published)} tone="need" />
              <Stat label="مكفول بالكامل" value={String(o.orphans.fully_sponsored)} tone="thrive" />
              <Stat label="جهة معتمدة" value={String(o.organizations.approved)} tone="need" />
              <Stat label="بانتظار المراجعة" value={String(queueCount)} tone="bridge" />
            </div>
          </section>

          {/* لكلّ عملةٍ سطرها (PRD-14 / UX-07): لا يُجمع يورو مع دولار. */}
          <section>
            <h2 className="text-sm font-bold">التمويل الشهري</h2>
            <div className="mt-4 space-y-4">
              {byCurrency(o).orphans.map((r) => (
                <div key={r.currency} className="border-border bg-card rounded-2xl border p-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <p className="text-2xl font-extrabold">
                      {formatMoney(r.monthly_funded, r.currency)}
                      <span className="text-muted-foreground text-sm font-normal">
                        {" "}
                        من {formatMoney(r.monthly_need, r.currency)}
                      </span>
                    </p>
                    <p className="text-bridge-ink text-sm font-bold">
                      المتبقّي {formatMoney(r.monthly_gap, r.currency)}
                    </p>
                  </div>
                  <CrossingProgress
                    percent={fundingPercent(r.monthly_need, r.monthly_funded)}
                    className="mt-4"
                    label={`تغطية الاحتياج الشهري بعملة ${r.currency}`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Stat label="كافل" value={String(o.sponsors.total)} tone="need" />
              <Stat label="كفالة نشطة" value={String(o.sponsors.active)} tone="thrive" />
              <Stat
                label="التزام شهري"
                value={formatMoneyTotals(byCurrency(o).committed, cur)}
                tone="bridge"
              />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-bold">الخزينة</h2>
            {byCurrency(o).money.map((m) => (
              <div key={m.currency} className="mt-4">
                <p className="text-muted-foreground text-xs font-bold">{m.currency}</p>
                <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat
                    label="المحصّل"
                    value={formatMoney(m.collected, m.currency)}
                    tone="thrive"
                  />
                  <Stat label="المصروف" value={formatMoney(m.disbursed, m.currency)} tone="need" />
                  <Stat label="الرصيد" value={formatMoney(m.balance, m.currency)} tone="bridge" />
                  <Stat
                    label="بانتظار الدفع"
                    value={formatMoney(m.pending, m.currency)}
                    tone="muted"
                  />
                </div>
                {m.failed > 0 && (
                  <p className="text-destructive mt-3 text-xs">
                    دفعات فاشلة بقيمة {formatMoney(m.failed, m.currency)} — تحتاج متابعة.
                  </p>
                )}
              </div>
            ))}
          </section>

          <AdminExports />
        </div>
      )}

      {/* صفحاتٌ ببحث لا كتلةٌ بكلّ شيء (PRD-13). */}
      {tab === "orphans" && <AdminOrphansList currency={cur} />}

      {tab === "monitoring" && (
        <>
          <OpsHealthPanel />
          <DispatchHealthPanel />
        </>
      )}

      {tab === "sponsors" && <AdminSponsorsList currency={cur} />}

      {/* بناء البيانات داخل قطعة الإدارة نفسها: قطعةٌ مستقلّة له كانت تزيد حزمة
          الدخول (خريطة القطع) فتكسر ميزانية صفحات الرؤية. */}
      {tab === "data" && (
        <DataBuilding
          area={search.area}
          onArea={(area) => go({ area })}
          openTab={(next) => setTab(next)}
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
                        <h3 className="font-bold">
                          <Name>{p.name}</Name>
                        </h3>
                        <Badge variant="secondary">
                          {ORPHAN_STATUS_LABELS[p.status] ?? p.status}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        <Name>{p.code}</Name> — {[p.city, p.region].filter(Boolean).join("، ")} —
                        احتياج {formatMoney(p.need, p.currency ?? cur)} — {formatDate(p.created_at)}
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
                  {/* القرار من الصندوق: هناك بيانات التحقّق ووثائقه وما ينقص،
                      لا ضغطة اعتمادٍ عمياء هنا (PRD-16). */}
                  <Button size="sm" variant="outline" onClick={() => setTab("inbox")}>
                    راجِع في صندوق القرارات
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

// مؤشّر الإدارة هو StatTile نفسه (UI-13): رقمٌ فوق تسمية، بالألوان الدلالية.
function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "need" | "thrive" | "bridge" | "muted";
}) {
  return <StatTile label={label} value={value} tone={tone === "bridge" ? "gold" : tone} />;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-border text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-sm">
      {children}
    </p>
  );
}

/**
 * المجاميع بعملاتها؛ وفي قاعدةٍ لم تُطبَّق عليها هجرة ٣أ تُعرض المجاميع
 * القديمة بعملة المنصّة كما كانت — لا صفحةٌ فارغة.
 */
function byCurrency(o: AdminOverview) {
  const cur = o.currency;
  return {
    orphans: o.orphans_by_currency ?? [
      {
        currency: cur,
        monthly_need: o.orphans.monthly_need,
        monthly_funded: o.orphans.monthly_funded,
        monthly_gap: o.orphans.monthly_gap,
      },
    ],
    committed: o.committed_by_currency ?? [{ currency: cur, amount: o.sponsors.monthly_committed }],
    money: o.money_by_currency ?? [{ currency: cur, disputed: 0, ...o.money }],
  };
}
