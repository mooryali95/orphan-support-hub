import { createFileRoute, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { OrphanReviewPanel } from "@/components/intake/OrphanReviewPanel";
import { ReportQueue } from "@/components/impact/ReportQueue";
import { GoLiveReadiness } from "@/components/admin/GoLiveReadiness";
import { AwaitingTransfers } from "@/components/admin/AwaitingTransfers";
import { SystemHealth } from "@/components/admin/SystemHealth";
import { SupervisorAdmin } from "@/components/qualification/SupervisorAdmin";
import { AccessQueue } from "@/components/protection/AccessQueue";
import { ApiClientsAdmin } from "@/components/integrations/ApiClientsAdmin";
import { Name } from "@/components/kit/Name";
import { OfficesAdmin } from "@/components/offices/OfficesAdmin";
import DataBuilding from "@/components/admin/data/DataBuilding";
import TrustCenter from "@/components/admin/trust/TrustCenter";
import { RecordsConsole } from "@/components/admin/console/RecordsConsole";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminMfaGate } from "@/components/admin/AdminMfaGate";
import { AdminExports, AdminSponsorsList } from "@/components/admin/AdminLists";
import { CountryWorkspace } from "@/components/admin/countries/CountryWorkspace";
import {
  adminHref,
  JOB_TABS,
  JOBS,
  jobOf,
  resolveAdminSearch,
  type Job,
  type Tab,
} from "@/components/admin/nav";
import { kindMatches } from "@/components/admin/today/queue";
import { TodayQueue } from "@/components/admin/today/TodayQueue";
import { useUrlFilters } from "@/components/admin/today/useUrlFilters";
import { useToday } from "@/components/admin/today/useToday";
import { IntegrityPanel } from "@/components/integrity/IntegrityPanel";
import { SourcesPanel } from "@/components/integrity/SourcesPanel";
import { LocalesPanel } from "@/components/i18n/LocalesPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAdminOverview, reviewOrphan } from "@/lib/admin.functions";
import { formatDate, formatMoney, ORPHAN_STATUS_LABELS } from "@/lib/format";
import type { AdminOverview } from "@/lib/admin.functions";
import { ADMIN_ACCESS } from "@/lib/golden-record";
import { BRAND, pageTitle } from "@/config/brand";
import { isTrial } from "@/config/platform";
import { Skeleton } from "@/components/ui/skeleton";

import { ADMIN_FNS } from "@/components/admin/overview/admin-fns";
import type { OverviewActions } from "@/components/admin/overview/parts";
import { useDemo } from "@/lib/demo-mode";

// التقرير الشامل في قطعته: يُحمَّل حين يُفتح، ولا يزيد وزن صفحةٍ أخرى.
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
  component: GatedAdminPage,
});

function GatedAdminPage() {
  return (
    <AdminMfaGate>
      <AdminPage />
    </AdminMfaGate>
  );
}

/** ما تقرؤه الصفحة من عنوانها؛ وما عداه يبقى كما هو. */
type Query = Record<string, unknown>;

// الإدارة بعد الدخول بالعربية (route.tsx)؛ «اليوم» ودرج الدول مترجمان بنصوصهما.
const JOB_LABELS: Record<Job, string> = {
  today: "اليوم",
  countries: "الدول",
  quality: "جودة البيانات",
  money: "المال",
  people: "الناس",
  settings: "الإعدادات",
};

const TAB_LABELS: Record<Tab, string> = {
  today: "ما ينتظر قرارك",
  countries: "درج الدول",
  trust: "مركز الثقة",
  data: "بناء البيانات",
  report: "التقرير الشامل",
  transfers: "تحويلاتٌ تنتظر المطابقة",
  pledges: "التعهّدات",
  rec_payments: "المدفوعات",
  sponsorships: "الكفالات",
  sponsors: "الكفلاء",
  orphans: "الأيتام",
  rec_orgs: "الجهات الميدانية",
  offices: "المكاتب والجهات",
  rec_offices: "سجلّ المكاتب",
  supervisors: "المشرفون",
  rec_supervisors: "سجلّ المشرفين",
  rec_documents: "المستندات",
  rec_access: "سجلّ الاطّلاع",
  country_sources: "مصادر الدول ومزامنتها",
  languages: "اللغات والترجمة",
  integrations: "التكامل",
  health: "صحّة النظام",
  golive: "جاهزية الإطلاق والتصدير",
};

const WORK_TABS = ["alerts", "conflicts", "links", "upload", "mode", "team"] as const;
type WorkTab = (typeof WORK_TABS)[number];
const isWorkTab = (v: unknown): v is WorkTab => WORK_TABS.includes(v as WorkTab);

function AdminPage() {
  const fetchOverview = useServerFn(getAdminOverview);
  const decideOrphan = useServerFn(reviewOrphan);
  const queryClient = useQueryClient();
  // التبويب ومرشّحاته تعيش في عنوان الصفحة: ‎/admin?tab=countries&country=LK يفتح درج
  // الدولة، والرجوع يعيد ما قبله، والرابط يُنسخ. بلا `tab` تهبط الإدارة على «اليوم».
  // والمفاتيح القديمة (‎?tab=inbox…) تُحوَّل إلى مقابلها (nav.ts) بلا قيدٍ في التاريخ.
  const search = useRouterState({ select: (st) => st.location.search as Query });
  const navigate = useNavigate();
  const { tab, redirect: moved } = resolveAdminSearch(search);
  const movedKey = moved ? JSON.stringify(moved) : null;
  useEffect(() => {
    if (movedKey)
      void navigate({ to: "/admin", replace: true, search: JSON.parse(movedKey) as never });
  }, [movedKey, navigate]);
  const demo = useDemo();
  const sample =
    demo || search["sample"] === 1 || search["sample"] === "1" || search["sample"] === true;
  const go = useCallback(
    (next: Query, replace = false) => {
      void navigate({ to: "/admin", replace, search: next as never });
    },
    [navigate],
  );
  /** يفتح شاشةً بمفتاحها (القديم يُحوَّل)، ويُبقي العيّنة وحدها. */
  const open = useCallback(
    (key: string, extra: Query = {}) => {
      const keep: Query = sample && !demo ? { sample: 1 } : {};
      const r = resolveAdminSearch({ ...keep, ...extra, tab: key });
      const next: Query = r.redirect ?? { ...keep, ...extra, tab: key };
      if (next["tab"] === "today") delete next["tab"];
      go(next);
      window.scrollTo({ top: 0 });
    },
    [go, sample, demo],
  );
  const setTab = useCallback((next: Tab) => open(next), [open]);
  const [filters, setFilters] = useUrlFilters();
  const actions: OverviewActions = useMemo(
    () => ({
      open: (next) => open(next),
      href: (next) => adminHref(next, sample ? { sample: 1 } : {}),
      setSample: (on) => {
        const next: Query = { ...search };
        if (on) next["sample"] = 1;
        else delete next["sample"];
        go(next, true);
      },
      // `null`: الفترة الافتراضية — لا تُكتب في العنوان.
      setPeriod: (months) => {
        const next: Query = { ...search };
        if (months === null) delete next["period"];
        else next["period"] = months;
        go(next, true);
      },
    }),
    [open, go, search, sample],
  );
  // ملفّ واحد مفتوح للمراجعة في كل مرّة: المراجعة قراءة وثائق لا مسح قائمة.
  const [reviewing, setReviewing] = useState<string | null>(null);
  const today = useToday(ADMIN_ACCESS);

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

  // البيانات النموذجية في وضع التجربة وحده، كعيّنة «التقرير الشامل».
  const consoleSample = isTrial()
    ? { sample, onSampleChange: (on: boolean) => actions.setSample(on) }
    : {};

  const o = data.overview;
  const cur = o.currency;
  // العدّاد على «اليوم» و«المال» وحدهما: ما يُعمل عليه، لا ضجيج شاراتٍ في كل مكان.
  const COUNTS: Partial<Record<Tab, number>> = {
    today: today.items.length,
    transfers: today.items.filter((i) => kindMatches("money", i.kind)).length,
  };
  const country = typeof search["country"] === "string" ? search["country"] : "";
  const workTab = isWorkTab(search["ctab"]) ? search["ctab"] : undefined;

  return (
    <DashboardShell title="لوحة الإدارة" description="ما ينتظر قرارك اليوم، وصحّة الشبكة.">
      {/* ستّ مهامّ بدل خمسة وعشرين لساناً: من يفتح اللوحة يسأل «ماذا أقرّر اليوم؟». */}
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <AdminNav
          sections={JOBS.map((job) => ({
            label: JOB_LABELS[job],
            items: JOB_TABS[job].map((key) => ({
              key,
              label: TAB_LABELS[key],
              count: COUNTS[key] ?? null,
            })),
          }))}
          active={tab}
          onSelect={setTab}
          homeLabel={JOB_LABELS.today}
          onHome={() => setTab("today")}
        />
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-bold lg:mt-1">
            {JOB_LABELS[jobOf(tab)]}
          </p>
          <h2 className="font-display mt-1 text-2xl font-bold">{TAB_LABELS[tab]}</h2>

          {tab === "today" && (
            <div className="mt-6 space-y-10">
              <TodayQueue
                access={ADMIN_ACCESS}
                scope="admin"
                filters={filters}
                setFilters={setFilters}
                onOpenTrust={() => setTab("trust")}
                onOpenCountry={(code, ctab) => open("countries", { country: code, ctab })}
                onOpenFull={(screen) => setFilters({ kind: screen })}
              />
              {/* الشاشات الكاملة لما يحتاج أكثر من سطر: وثائق الملفّ، والاطّلاع، والفكّ. */}
              {filters.kind === "access" && <AccessQueue />}
              {filters.kind === "integrity" && <IntegrityPanel />}
              {filters.kind === "orphan" && (
                <OrphanQueue
                  o={o}
                  cur={cur}
                  reviewing={reviewing}
                  setReviewing={setReviewing}
                  onDecide={async (id, decision, code, reason) => {
                    const res = await decideOrphan({
                      data: {
                        id,
                        decision,
                        ...(code ? { code: code as never } : {}),
                        ...(reason ? { reason } : {}),
                      },
                    });
                    if (res.ok) {
                      toast.success(decision === "approved" ? "تم اعتماد الملفّ" : "تم رفض الملفّ");
                      setReviewing(null);
                    } else {
                      toast.error(res.error ?? "تعذّر تنفيذ القرار");
                    }
                    refresh();
                  }}
                  onRefresh={refresh}
                  onInbox={() => setFilters({ kind: "org" })}
                />
              )}
            </div>
          )}

          {tab === "countries" && (
            <div className="mt-6">
              <CountryWorkspace
                scope="admin"
                access={ADMIN_ACCESS}
                country={country}
                setCountry={(code) => go({ ...search, country: code }, true)}
                tab={workTab}
                setTab={(t) => go({ ...search, ctab: t }, true)}
              />
            </div>
          )}

          {tab === "trust" && (
            <TrustCenter openCountry={(code) => open("countries", { country: code })} />
          )}

          {/* بناء البيانات داخل قطعة الإدارة نفسها: قطعةٌ مستقلّة له كانت تزيد حزمة
          الدخول (خريطة القطع) فتكسر ميزانية صفحات الرؤية. */}
          {tab === "data" && (
            <DataBuilding
              area={search["area"]}
              initialCountry={country || undefined}
              onArea={(area) => go({ ...search, area }, true)}
              openTab={(next) => open(next)}
            />
          )}

          {tab === "report" && (
            <div className="mt-6">
              <Suspense fallback={<Skeleton className="rounded-3xl" style={{ height: "16rem" }} />}>
                <ManagementOverview
                  sample={sample}
                  embedded
                  period={search["period"]}
                  fns={ADMIN_FNS}
                  actions={actions}
                />
              </Suspense>
            </div>
          )}

          {tab === "transfers" && (
            <div className="mt-8">
              <AwaitingTransfers />
            </div>
          )}

          {/* صفحاتٌ ببحث لا كتلةٌ بكلّ شيء (PRD-13). */}
          {tab === "orphans" && <RecordsConsole kind="orphans" {...consoleSample} />}
          {tab === "sponsorships" && <RecordsConsole kind="sponsorships" {...consoleSample} />}
          {tab === "pledges" && <RecordsConsole kind="pledges" {...consoleSample} />}
          {tab === "rec_orgs" && <RecordsConsole kind="orgs" {...consoleSample} />}
          {tab === "rec_offices" && <RecordsConsole kind="offices" {...consoleSample} />}
          {tab === "rec_supervisors" && <RecordsConsole kind="supervisors" {...consoleSample} />}
          {tab === "rec_documents" && <RecordsConsole kind="documents" {...consoleSample} />}
          {tab === "rec_payments" && <RecordsConsole kind="payments" {...consoleSample} />}
          {tab === "rec_access" && <RecordsConsole kind="access_log" {...consoleSample} />}
          {tab === "sponsors" && <AdminSponsorsList currency={cur} />}

          {tab === "supervisors" && (
            <div className="mt-8">
              <SupervisorAdmin />
            </div>
          )}

          {tab === "offices" && (
            <div className="mt-8">
              <OfficesAdmin />
            </div>
          )}

          {tab === "country_sources" && (
            <div className="mt-8">
              <SourcesPanel />
            </div>
          )}

          {tab === "languages" && <LocalesPanel />}

          {tab === "integrations" && (
            <div className="mt-8">
              <ApiClientsAdmin />
            </div>
          )}

          {tab === "health" && <SystemHealth />}

          {tab === "golive" && (
            <div className="mt-8 space-y-10">
              <GoLiveReadiness published={o.orphans.published} />
              <AdminExports />
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

/** ملفّات الأطفال وتقارير الجهات والجهات المعلّقة: الشاشة الكاملة لمرشّح «ملفّ طفل». */
function OrphanQueue({
  o,
  cur,
  reviewing,
  setReviewing,
  onDecide,
  onRefresh,
  onInbox,
}: {
  o: AdminOverview;
  cur: string;
  reviewing: string | null;
  setReviewing: (id: string | null) => void;
  onDecide: (
    id: string,
    decision: "approved" | "rejected",
    code?: string,
    reason?: string,
  ) => Promise<void>;
  onRefresh: () => void;
  onInbox: () => void;
}) {
  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-lg font-bold">ملفات بانتظار المراجعة ({o.pending_orphans.length})</h2>
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
                    <Badge variant="secondary">{ORPHAN_STATUS_LABELS[p.status] ?? p.status}</Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    <Name>{p.code}</Name> — {[p.city, p.region].filter(Boolean).join("، ")} — احتياج{" "}
                    {formatMoney(p.need, p.currency ?? cur)} — {formatDate(p.created_at)}
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
                  onDecided={(decision, code, reason) =>
                    void onDecide(p.id, decision, code, reason)
                  }
                />
              )}
            </div>
          ))}
        </div>
      </section>

      <ReportQueue onDone={onRefresh} />

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
                  {[org.city, org.region].filter(Boolean).join("، ")} — ترخيص {org.license ?? "—"} —{" "}
                  {org.email ?? "—"}
                </p>
              </div>
              {/* القرار من «اليوم»: هناك بيانات التحقّق ووثائقه وما ينقص، لا ضغطة
              اعتمادٍ عمياء هنا (PRD-16). */}
              <Button size="sm" variant="outline" onClick={onInbox}>
                راجِع في «اليوم»
              </Button>
            </div>
          ))}
        </div>
      </section>
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
