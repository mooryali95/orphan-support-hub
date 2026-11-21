import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useState } from "react";

import { getDataOverview } from "@/lib/data-entry.functions";
import { useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

import { BulkImport } from "./BulkImport";
import { COPY } from "./copy";
import { CountriesPanel } from "./CountriesPanel";
import { GroupsPanel } from "./GroupsPanel";
import { PersonForm } from "./PersonForm";
import { RegionsPanel } from "./RegionsPanel";
import { AREAS, Busy, Failed, NeedsUpdate, type Area, type Shared } from "./shared";
import { TeamPanel } from "./TeamPanel";

const isArea = (v: unknown): v is Area => AREAS.includes(v as Area);

/**
 * بناء البيانات — خانةٌ واحدة في الإدارة تجمع ما يلزم لبناء البيانات الحقيقية:
 * الدول، فمناطقها، فالمجموعات، فالأشخاص واحداً واحداً أو دفعةً، ثم من يُدخل معك.
 *
 * تُحمَّل في قطعتها حين يُفتح تبويبها، فلا تزيد وزن صفحةٍ أخرى.
 */
export default function DataBuilding({
  area: areaIn,
  onArea,
  openTab,
}: {
  area: unknown;
  onArea: (area: Area) => void;
  openTab: (tab: "inbox" | "offices" | "supervisors") => void;
}) {
  const c = useCopy(COPY);
  const area: Area = isArea(areaIn) ? areaIn : "countries";
  const fetchOverview = useServerFn(getDataOverview);
  const qc = useQueryClient();
  const overview = useQuery({ queryKey: ["data-overview"], queryFn: () => fetchOverview() });
  const [country, setCountry] = useState("");

  const go = useCallback(
    (next: Area, code?: string) => {
      if (code !== undefined) setCountry(code);
      onArea(next);
    },
    [onArea],
  );
  const reloadCountries = useCallback(
    () => void qc.invalidateQueries({ queryKey: ["data-overview"] }),
    [qc],
  );

  const result = overview.data;
  const data = result?.ok ? result.data : null;
  const shared: Shared = {
    countries: data?.countries ?? [],
    platformCurrency: data?.platformCurrency ?? null,
    country,
    setCountry,
    go,
    reloadCountries,
  };

  return (
    <section className="mt-8" aria-labelledby="data-building-title">
      <p className="eyebrow">{c.eyebrow}</p>
      <h2 id="data-building-title" className="mt-2 text-2xl font-extrabold text-balance">
        {c.title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">{c.lead}</p>

      <nav aria-label={c.stepsLabel} className="mt-6 flex flex-wrap gap-2">
        {AREAS.map((a, i) => (
          <button
            key={a}
            type="button"
            aria-current={area === a ? "step" : undefined}
            onClick={() => onArea(a)}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              area === a
                ? "border-primary bg-primary font-bold text-primary-foreground"
                : "border-border bg-card font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid size-5 place-items-center rounded-full text-xs tabular-nums",
                area === a ? "bg-white/20" : "bg-secondary",
              )}
            >
              {i + 1}
            </span>
            {c.steps[a]}
          </button>
        ))}
      </nav>
      <span aria-hidden="true" className="rule-champagne mt-2 block" />

      <div className="mt-6">
        {overview.isPending ? (
          <Busy />
        ) : !result || !result.ok ? (
          result && result.missing ? (
            <NeedsUpdate />
          ) : (
            <Failed onRetry={() => void overview.refetch()} />
          )
        ) : (
          <>
            {data?.degraded && (
              <div
                role="status"
                className="mb-6 rounded-2xl border border-bridge/40 bg-bridge/10 p-4 text-sm leading-7"
              >
                <strong className="font-bold text-bridge-ink">{c.degradedTitle}</strong>
                <span className="block text-muted-foreground">{c.degradedText}</span>
              </div>
            )}
            {area === "countries" && (
              <CountriesPanel shared={shared} unlinked={data?.unlinked ?? null} />
            )}
            {area === "regions" && <RegionsPanel shared={shared} />}
            {area === "groups" && <GroupsPanel shared={shared} />}
            {area === "persons" && <PersonForm shared={shared} />}
            {area === "bulk" && <BulkImport shared={shared} />}
            {area === "team" && <TeamPanel openTab={openTab} />}
          </>
        )}
      </div>
    </section>
  );
}
