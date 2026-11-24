import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { AdminNav } from "@/components/admin/AdminNav";
import { RecordsConsole } from "@/components/admin/console/RecordsConsole";
import { CycleAdminTask } from "@/components/try/TryCycleTasks";
import { TryRoleHeader } from "@/components/try/TryRoleHeader";
import type { RecordKind } from "@/lib/admin-console.functions";
import { defineCopy, useCopy } from "@/lib/locale";
import { ADMIN_FNS } from "@/components/admin/overview/admin-fns";
import type { OverviewActions } from "@/components/admin/overview/parts";
import type { AdminTab } from "@/lib/admin-overview";

// النظرة الشاملة نفسها التي تفتحها الإدارة، على العيّنة: لا شاشةٌ مقلَّدة.
const ManagementOverview = lazy(() => import("@/components/admin/overview/ManagementOverview"));

/** ما يقابل لسان النظرة الشاملة من جداول العرض؛ وما لا مقابل له يبقى في النظرة. */
const TAB_TO_RECORDS: Partial<Record<AdminTab, RecordKind>> = {
  orphans: "orphans",
  sponsors: "sponsorships",
  queue: "orphans",
  access: "access_log",
  integrity: "documents",
};

export const Route = createLazyFileRoute("/try/admin")({ component: TryAdmin });

type Key = RecordKind | "home";

const COPY = defineCopy("routes/try.admin", {
  ar: {
    labels: {
      orphans: "الأيتام",
      sponsorships: "الكفالات",
      pledges: "التعهّدات",
      orgs: "جهات الرعاية",
      offices: "المكاتب",
      supervisors: "المشرفون",
      documents: "المستندات",
      payments: "المدفوعات",
      access_log: "سجلّ الاطّلاع",
    } satisfies Record<RecordKind, string>,
    sections: ["السجلّات", "الشبكة", "الثقة والمال"],
    role: "الإدارة",
    title: "لوحة الإدارة",
    lead: "الجداول نفسها التي يعمل عليها فريق الإدارة في المنصّة الحقيقية: بحث، وحالات، وشارات توثيق، وإجراءات مسجَّلة. ما فعلته في جلستك — كفالتك وتعهّدك وملفّ جهتك — يظهر هنا مظلَّلاً فوق البيانات النموذجية.",
    real: "دخولٌ برمز البريد ومصادقة ثنائية، وكلّ إجراءٍ في سجلّ التدقيق",
    home: "ابدأ من هنا",
    try: "ماذا تجرّب هنا؟",
    cards: {
      orphans: "افتح طفلاً وشاهد شارة توثيقه وما ينقص ملفّه",
      documents: "وثّق مستنداً، أو اسحب توثيقه بملاحظة",
      pledges: "فعّل تعهّداً أو ألغه بسبب — ويتغيّر العدّاد",
      access_log: "من اطّلع على ملفّ طفل ومتى — وفيه اطّلاعك أنت في هذه الجلسة",
      sponsorships: "كفالتك في العرض تظهر هنا فور إتمامها، مع دفعتها في «المدفوعات»",
    } as Partial<Record<RecordKind, string>>,
    open: "افتح",
    cycleLead: "وللدورة كاملةً — من إدخال الملفّ إلى تقرير الشهر الأوّل —",
    cycle: "افتح «الدورة الكاملة»",
  },
  en: {
    labels: {
      orphans: "Orphans",
      sponsorships: "Sponsorships",
      pledges: "Pledges",
      orgs: "Care organizations",
      offices: "Offices",
      supervisors: "Supervisors",
      documents: "Documents",
      payments: "Payments",
      access_log: "Access log",
    } satisfies Record<RecordKind, string>,
    sections: ["Records", "Network", "Trust and money"],
    role: "Administration",
    title: "Administration console",
    lead: "The same tables the administration team works on in the live platform: search, statuses, verification badges and logged actions. What you did this session (your sponsorship, pledge and organization file) is highlighted here above the sample data.",
    real: "sign-in with an email code and two-factor authentication, and every action in the audit log",
    home: "Start here",
    try: "What to try here",
    cards: {
      orphans: "Open a child and see the verification badge and what the file is missing",
      documents: "Verify a document, or withdraw its verification with a note",
      pledges: "Activate a pledge or cancel it with a reason, and watch the counter change",
      access_log: "Who opened a child's file and when, including your own views this session",
      sponsorships:
        "Your sponsorship in the demo appears here as soon as it is made, with its payment",
    } as Partial<Record<RecordKind, string>>,
    open: "Open",
    cycleLead: "For the whole cycle, from file entry to the first monthly report:",
    cycle: "open the full cycle",
  },
});

const SECTIONS: RecordKind[][] = [
  ["orphans", "sponsorships", "pledges"],
  ["orgs", "offices", "supervisors"],
  ["documents", "payments", "access_log"],
];
const CARDS: RecordKind[] = ["orphans", "documents", "pledges", "access_log", "sponsorships"];

/**
 * لوحة الإدارة للضيف في العرض التفاعلي: الجداول نفسها في المنصّة الحقيقية
 * (`RecordsConsole`)، بالبيانات النموذجية وحدها. لا حساب، ولا مصادقة ثنائية،
 * ولا طلبٌ إلى الخادم: الإجراءات محاكاةٌ في الصفحة وتُنسى عند مغادرتها.
 * المنصّة الحقيقية (/admin) لم تتغيّر: تبقى خلف الدخول والعامل الثاني.
 */
function TryAdmin() {
  const t = useCopy(COPY);
  const LABELS = t.labels;
  const [tab, setTab] = useState<Key>("home");
  return (
    <div>
      <TryRoleHeader role={t.role} title={t.title} lead={t.lead} real={t.real} />

      <div className="mt-8 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <AdminNav<Key>
          sections={SECTIONS.map((items, i) => ({
            label: t.sections[i] ?? "",
            items: items.map((key) => ({ key, label: LABELS[key], count: null })),
          }))}
          active={tab}
          onSelect={setTab}
          homeLabel={t.home}
          onHome={() => setTab("home")}
        />
        <div className="min-w-0">
          {tab === "home" ? (
            <>
              <div className="mb-6">
                <CycleAdminTask />
              </div>
              <Suspense fallback={null}>
                <ManagementOverview
                  sample
                  embedded
                  period={undefined}
                  fns={ADMIN_FNS}
                  actions={
                    {
                      open: (t: AdminTab) => {
                        const k = TAB_TO_RECORDS[t];
                        if (k) setTab(k);
                      },
                      href: () => "#",
                      setSample: () => {},
                      setPeriod: () => {},
                    } satisfies OverviewActions
                  }
                />
              </Suspense>
              <section className="mt-10">
                <h2 className="text-2xl font-bold">{t.try}</h2>
                <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                  {CARDS.map((key) => [key, t.cards[key] ?? ""] as const).map(([key, text]) => (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => setTab(key)}
                        className="group flex h-full w-full flex-col rounded-2xl border border-border bg-card p-5 text-start transition-colors hover:border-primary/50"
                      >
                        <span className="font-bold">{LABELS[key]}</span>
                        <span className="mt-1 text-sm leading-7 text-muted-foreground">{text}</span>
                        <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary">
                          {t.open}
                          <ArrowLeft
                            className="size-4 transition-transform group-hover:-translate-x-0.5 ltr:-scale-x-100"
                            aria-hidden="true"
                          />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-sm leading-7 text-muted-foreground">
                  {t.cycleLead}{" "}
                  <Link
                    to="/try/cycle"
                    className="font-bold text-primary underline-offset-4 hover:underline"
                  >
                    {t.cycle}
                  </Link>
                  .
                </p>
              </section>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold">{LABELS[tab]}</h2>
              <RecordsConsole key={tab} kind={tab} sample visitor />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
