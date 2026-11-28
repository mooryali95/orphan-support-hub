import { useQuery } from "@tanstack/react-query";
import { MfaRequiredNotice } from "@/components/account/MfaSettings";
import { lazy, Suspense, useState } from "react";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { flagOf } from "@/lib/countries";
import { canDo, type CountryAccess } from "@/lib/golden-record";
import { getDataHealth } from "@/lib/golden-record.functions";
import { getQueueCounts } from "@/lib/admin-tools.functions";
import { useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { Busy, CARD, Failed, NeedsUpdate, SectionHead } from "../shared";
import { SOURCES_COPY } from "../sources-copy";
import { ChildFileSheet } from "../WorkTools";
import { Alerts } from "./Alerts";
import { Conflicts } from "./ConflictsInbox";
import { HealthCard } from "./HealthCard";
import { SsoSwitchCard } from "./KillSwitches";
import { LinkQueue } from "./LinkQueue";
import { StartHere } from "./StartHere";
import { ChildUpdatesCard } from "./ChildUpdatesCard";
import { type Tab } from "./shared";

// ألسنة الإدارة والرفع والفريق تُحمَّل حين تُفتح وحدها، فلا تثقل البوّابة لمن لا يفتحها.
const UploadCard = lazy(() => import("./UploadCard").then((m) => ({ default: m.UploadCard })));
const Team = lazy(() => import("./Team").then((m) => ({ default: m.Team })));
const ModeControl = lazy(() => import("./ModeControl").then((m) => ({ default: m.ModeControl })));
const Matrix = lazy(() => import("./ModeControl").then((m) => ({ default: m.Matrix })));

/**
 * مصادر التحقق: صحة كل دولة، ووضع منصّة مكتبها، والرفع، والتعارضات، والربط.
 * القاعدة تقرّر؛ هذه الخانة تعرض وتسأل المشرف حيث يلزم قرار بشري.
 */
export function SourcesPanel({
  country,
  setCountry,
  access,
  tab: tabIn,
  setTab: setTabIn,
}: {
  country: string;
  setCountry: (code: string) => void;
  /** الإدارة، أو أدوار الدول لعضو فريقٍ (`my_country_access`). القاعدة تحرس على كل حال. */
  access: CountryAccess;
  /** اللسان المفتوح حين يملكه من يعرض اللوحة (رابطٌ من «اليوم» إلى تعارضات دولة). */
  tab?: Tab | undefined;
  setTab?: ((t: Tab) => void) | undefined;
}) {
  const c = useCopy(SOURCES_COPY);
  const fetchHealth = useDataFn("golden.health", getDataHealth);
  const health = useQuery({ queryKey: useDataKey(["data-health"]), queryFn: () => fetchHealth() });
  const rows = health.data?.ok ? health.data.data : [];
  const code = rows.some((r) => r.code === country) ? country : (rows[0]?.code ?? "");
  const selected = rows.find((r) => r.code === code) ?? null;
  const [tabOwn, setTabOwn] = useState<Tab>("alerts");
  const tab = tabIn ?? tabOwn;
  const setTab = (t: Tab) => {
    setTabOwn(t);
    setTabIn?.(t);
  };
  const [fileId, setFileId] = useState<string | null>(null);
  // عدّاد الطوابير نفسه في «اليوم»: الحسم في لسان «التحديثات» يحدّثه هنا.
  const fetchCounts = useDataFn("admin.queueCounts", getQueueCounts);
  const counts = useQuery({
    queryKey: useDataKey(["queue-counts", code]),
    queryFn: () => fetchCounts({ data: { country: code } }),
    enabled: !!code,
  });

  if (health.isPending) return <Busy />;
  if (!health.data?.ok) {
    return health.data?.missing ? (
      <NeedsUpdate />
    ) : (
      <Failed onRetry={() => void health.refetch()} />
    );
  }

  const can = (need: "import" | "upload" | "approve" | "manage") =>
    selected ? canDo(access, selected.code, need) : false;
  const tabs: Array<{ key: Tab; count: number; urgent: boolean }> = selected
    ? [
        {
          key: "alerts",
          count: selected.alerts.critical + selected.alerts.warning,
          urgent: selected.alerts.critical > 0,
        },
        {
          key: "conflicts",
          count: selected.conflicts.critical + selected.conflicts.other,
          urgent: selected.conflicts.critical > 0,
        },
        { key: "links", count: selected.link_pending, urgent: false },
        ...(can("import") ? [{ key: "upload" as const, count: 0, urgent: false }] : []),
        {
          key: "updates" as const,
          count: counts.data?.ok ? counts.data.data.updates : 0,
          urgent: false,
        },
        { key: "mode" as const, count: 0, urgent: false },
        ...(can("manage") ? [{ key: "team" as const, count: 0, urgent: false }] : []),
      ]
    : [];
  const current: Tab = tabs.some((t) => t.key === tab) ? tab : "alerts";

  return (
    <div className="space-y-8">
      <SectionHead title={c.title} hint={c.hint} />
      <StartHere
        rows={rows}
        access={access}
        onGo={(code, t) => {
          setCountry(code);
          setTab(t);
          requestAnimationFrame(() =>
            document
              .getElementById("country-work-title")
              ?.scrollIntoView({ behavior: "smooth", block: "start" }),
          );
        }}
      />

      {(access.admin || access.countries.some((x) => x.role === "supervisor")) && (
        <MfaRequiredNotice />
      )}
      {access.admin && <SsoSwitchCard />}

      <section aria-labelledby="health-title">
        <h4 id="health-title" className="text-base font-bold">
          {c.healthTitle}
        </h4>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{c.noCountries}</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <li key={r.code}>
                <HealthCard row={r} active={r.code === code} onPick={() => setCountry(r.code)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <section aria-labelledby="country-work-title" className="space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 id="country-work-title" className="text-lg font-bold">
              {flagOf(selected.code)} {selected.name_ar}
            </h4>
            {!can("approve") && (
              <p role="note" className="text-xs text-muted-foreground">
                {c.readOnly}
              </p>
            )}
          </div>
          <div
            role="tablist"
            aria-label={c.sectionsLabel}
            // يلتصق تحت الرأس فتبقى الألسنة وعدّاداتها ظاهرةً أثناء التمرير
            className="sticky z-20 -mx-4 flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-4 backdrop-blur sm:mx-0 sm:px-0"
            style={{
              top: "calc(var(--demo-bar-h, 0px) + var(--site-header-h, 4rem) + var(--try-bar-h, 0px))",
            }}
            onKeyDown={(e) => {
              // نمط WAI-ARIA للألسنة: الأسهم تتبع اتجاه القراءة، وHome/End للطرفين.
              const i = tabs.findIndex((t) => t.key === current);
              const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
              const step: Record<string, number> = {
                ArrowRight: rtl ? -1 : 1,
                ArrowLeft: rtl ? 1 : -1,
              };
              let next: number;
              if (e.key in step) next = (i + step[e.key]! + tabs.length) % tabs.length;
              else if (e.key === "Home") next = 0;
              else if (e.key === "End") next = tabs.length - 1;
              else return;
              e.preventDefault();
              const key = tabs[next]!.key;
              setTab(key);
              const el = document.getElementById(`tab-${key}`);
              el?.focus();
              el?.scrollIntoView({ block: "nearest", inline: "nearest" });
            }}
          >
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={current === t.key}
                aria-controls={current === t.key ? `panel-${t.key}` : undefined}
                tabIndex={current === t.key ? 0 : -1}
                onClick={(e) => {
                  setTab(t.key);
                  e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
                }}
                className={cn(
                  "-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  current === t.key
                    ? "border-primary font-bold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {c.tabs[t.key]}
                {t.count > 0 && (
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-xs font-bold tabular-nums",
                      t.urgent
                        ? "bg-destructive text-destructive-foreground"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${current}`} aria-labelledby={`tab-${current}`}>
            <Suspense fallback={<Busy />}>
              {current === "alerts" && (
                <Alerts country={selected.code} canApprove={can("approve")} onOpen={setFileId} />
              )}
              {current === "conflicts" && (
                <Conflicts country={selected.code} canApprove={can("approve")} onOpen={setFileId} />
              )}
              {current === "links" && (
                <LinkQueue country={selected.code} canApprove={can("approve")} onOpen={setFileId} />
              )}
              {current === "upload" && <UploadCard key={`up-${selected.code}`} row={selected} />}
              {current === "updates" && (
                <ChildUpdatesCard
                  country={selected.code}
                  canUpload={can("upload")}
                  canApprove={can("approve")}
                />
              )}
              {current === "mode" &&
                (access.admin ? (
                  <ModeControl key={`${selected.code}-${selected.office_mode}`} row={selected} />
                ) : (
                  <section className={cn(CARD, "p-5")}>
                    <p className="text-sm">
                      <span className="font-bold">{c.modeTitle}: </span>
                      {c.modes[selected.office_mode]}
                    </p>
                    <Matrix mode={selected.office_mode} />
                  </section>
                ))}
              {current === "team" && (
                <Team key={`team-${selected.code}`} country={selected.code} access={access} />
              )}
            </Suspense>
          </div>
        </section>
      )}
      <ChildFileSheet id={fileId} onClose={() => setFileId(null)} />
    </div>
  );
}
