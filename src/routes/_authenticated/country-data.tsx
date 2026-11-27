import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { DashboardShell } from "@/components/DashboardShell";
import { CountryWorkspace } from "@/components/admin/countries/CountryWorkspace";
import { Busy, Failed, NeedsUpdate } from "@/components/admin/data/shared";
import { ChildFileSheet } from "@/components/admin/data/WorkTools";
import { AdminSearch } from "@/components/admin/search/AdminSearch";
import { type Tab as WorkTab } from "@/components/admin/data/sources/shared";
import { TodayQueue } from "@/components/admin/today/TodayQueue";
import { useUrlFilters } from "@/components/admin/today/useUrlFilters";
import { pageTitle } from "@/config/brand";
import { getMyCountryAccess } from "@/lib/golden-record.functions";
import { defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("routes/country-data", {
  ar: {
    title: "بيانات الدولة",
    lead: "صحة بيانات دولتك، والرفع من المصادر، والتنبيهات والتعارضات وطابور الربط، بحسب دورك في فريقها.",
    none: "حسابك ليس في فريق أي دولة بعد. يضيفك مشرف الدولة أو الإدارة من «فريق الدولة».",
    all: "كل البنود بحسب الدولة",
    allNote:
      "«اليوم» أعلاه تجمع ما ينتظرك من هذه البنود نفسها؛ وهنا ألسنتها كاملةً لكل دولة، مع الرفع والربط.",
  },
  en: {
    title: "Country data",
    lead: "Your country's data health, source uploads, alerts, conflicts and link queue, according to your role on its team.",
    none: "Your account isn't on any country team yet. The country supervisor or the admin team adds you under Country team.",
    all: "All items by country",
    allNote:
      "Today, above, gathers what is waiting for you from these same items; here are their full tabs for each country, with uploads and linking.",
  },
});

export const Route = createFileRoute("/_authenticated/country-data")({
  head: () => ({
    meta: [{ title: pageTitle("بيانات الدولة", false) }, { name: "robots", content: "noindex" }],
  }),
  component: CountryDataPage,
});

/**
 * بوّابة فريق الدولة: مشرفوها ومدخلو بياناتها ومطّلعوها. الخانة نفسها التي تراها
 * الإدارة في «مصادر التحقق»، مقصورةً على دولهم؛ والقاعدة تحرس كل باب (`country_can`).
 */
function CountryDataPage() {
  const c = useCopy(COPY);
  const fetchAccess = useServerFn(getMyCountryAccess);
  const access = useQuery({ queryKey: ["my-country-access"], queryFn: () => fetchAccess() });
  const [country, setCountry] = useState("");
  const [tab, setTab] = useState<WorkTab | undefined>(undefined);
  const [fileId, setFileId] = useState<string | null>(null);
  // the country tabs show the same items as Today: they stay folded until asked for
  const [allOpen, setAllOpen] = useState(false);
  const [filters, setFilters] = useUrlFilters();
  const res = access.data;

  return (
    <DashboardShell title={c.title} description={c.lead}>
      {access.isPending ? (
        <Busy />
      ) : !res?.ok ? (
        res?.missing ? (
          <NeedsUpdate />
        ) : (
          <Failed onRetry={() => void access.refetch()} />
        )
      ) : !res.data.admin && res.data.countries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {c.none}
        </p>
      ) : (
        // «اليوم» بنطاق دول الفريق، ثم درج الدولة نفسه الذي تفتحه الإدارة.
        <div className="space-y-12">
          {/* البحث بنطاق دول الفريق: أطفالها وحدهم (`admin_search` يحرس بـcountry_can). */}
          <AdminSearch onPick={(h) => h.kind === "child" && setFileId(h.item.id)} />
          <ChildFileSheet id={fileId} onClose={() => setFileId(null)} />
          <TodayQueue
            access={res.data}
            scope={res.data.admin ? "admin" : "country"}
            filters={filters}
            setFilters={setFilters}
            onOpenCountry={(code, t) => {
              setCountry(code);
              setTab(t);
              setAllOpen(true);
              requestAnimationFrame(() =>
                document
                  .getElementById("country-work-title")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" }),
              );
            }}
          />
          <details
            open={allOpen}
            onToggle={(e) => setAllOpen(e.currentTarget.open)}
            className="group rounded-2xl border border-border"
          >
            <summary className="flex min-h-11 cursor-pointer items-center px-4 py-3 font-bold">
              {c.all}
            </summary>
            <div className="space-y-4 border-t border-border p-4">
              <p className="text-sm leading-7 text-muted-foreground">{c.allNote}</p>
              {allOpen && (
                <CountryWorkspace
                  scope="country"
                  access={res.data}
                  country={country}
                  setCountry={setCountry}
                  tab={tab}
                  setTab={setTab}
                />
              )}
            </div>
          </details>
        </div>
      )}
    </DashboardShell>
  );
}
