import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { AdminNav } from "@/components/admin/AdminNav";
import { RecordsConsole } from "@/components/admin/console/RecordsConsole";
import type { RecordKind } from "@/lib/admin-console.functions";
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

const LABELS: Record<RecordKind, string> = {
  orphans: "الأيتام",
  sponsorships: "الكفالات",
  pledges: "التعهّدات",
  orgs: "جهات الرعاية",
  offices: "المكاتب",
  supervisors: "المشرفون",
  documents: "المستندات",
  payments: "المدفوعات",
  access_log: "سجلّ الاطّلاع",
};

const SECTIONS: Array<{ label: string; items: RecordKind[] }> = [
  { label: "السجلّات", items: ["orphans", "sponsorships", "pledges"] },
  { label: "الشبكة", items: ["orgs", "offices", "supervisors"] },
  { label: "الثقة والمال", items: ["documents", "payments", "access_log"] },
];

/**
 * لوحة الإدارة للضيف في العرض التفاعلي: الجداول نفسها في المنصّة الحقيقية
 * (`RecordsConsole`)، بالبيانات النموذجية وحدها. لا حساب، ولا مصادقة ثنائية،
 * ولا طلبٌ إلى الخادم: الإجراءات محاكاةٌ في الصفحة وتُنسى عند مغادرتها.
 * المنصّة الحقيقية (/admin) لم تتغيّر: تبقى خلف الدخول والعامل الثاني.
 */
function TryAdmin() {
  const [tab, setTab] = useState<Key>("home");
  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">العرض التفاعلي · الإدارة</p>
          <h1 className="mt-3 text-4xl leading-[1.3] font-bold">لوحة الإدارة</h1>
          <p className="mt-2 max-w-2xl text-base leading-8 text-muted-foreground">
            الجداول نفسها التي يعمل عليها فريق الإدارة في المنصّة الحقيقية: بحث، وحالات، وشارات
            توثيق، وإجراءات مسجَّلة — هنا ببياناتٍ نموذجية، والإجراءات محاكاة.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-bold text-muted-foreground">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          في الحقيقة: دخولٌ برمز البريد ومصادقة ثنائية
        </span>
      </header>

      <div className="mt-8 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <AdminNav<Key>
          sections={SECTIONS.map((s) => ({
            label: s.label,
            items: s.items.map((key) => ({ key, label: LABELS[key], count: null })),
          }))}
          active={tab}
          onSelect={setTab}
          homeLabel="ابدأ من هنا"
          onHome={() => setTab("home")}
        />
        <div className="min-w-0">
          {tab === "home" ? (
            <>
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
                <h2 className="text-2xl font-bold">ماذا تجرّب هنا؟</h2>
                <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["orphans", "افتح طفلاً وشاهد شارة توثيقه وما ينقص ملفّه"],
                      ["documents", "وثّق مستنداً، أو اسحب توثيقه بملاحظة"],
                      ["pledges", "فعّل تعهّداً أو ألغه بسبب — ويتغيّر العدّاد"],
                      ["access_log", "من اطّلع على بيانات طفلٍ خاصّة، ومتى، وبأيّ نطاق"],
                    ] as Array<[RecordKind, string]>
                  ).map(([key, text]) => (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => setTab(key)}
                        className="group flex h-full w-full flex-col rounded-2xl border border-border bg-card p-5 text-start transition-colors hover:border-primary/50"
                      >
                        <span className="font-bold">{LABELS[key]}</span>
                        <span className="mt-1 text-sm leading-7 text-muted-foreground">{text}</span>
                        <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary">
                          افتح
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
                  وللدورة كاملةً — من إدخال الملفّ إلى تقرير الشهر الأوّل —{" "}
                  <Link
                    to="/try/cycle"
                    className="font-bold text-primary underline-offset-4 hover:underline"
                  >
                    افتح «الدورة الكاملة»
                  </Link>
                  .
                </p>
              </section>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold">{LABELS[tab]}</h2>
              <RecordsConsole key={tab} kind={tab} sample />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
