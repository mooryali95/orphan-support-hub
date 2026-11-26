import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useDataFn, useDataKey } from "@/lib/data-port";
import { useCopy } from "@/lib/locale";
import { getTrustAging, getTrustOverview, getTrustTeam } from "@/lib/trust-center.functions";
import { cn } from "@/lib/utils";

import { AgingSection } from "./AgingSection";
import { TRUST_COPY } from "./copy";
import { DecisionLog } from "./DecisionLog";
import { OverviewSection } from "./OverviewSection";
import { TeamSection } from "./TeamSection";
import { Loadable } from "./ui";
import { WeeklyReport } from "./WeeklyReport";

export const TRUST_SECTIONS = ["overview", "aging", "team", "decisions", "weekly"] as const;
export type TrustSection = (typeof TRUST_SECTIONS)[number];

/**
 * مركز الثقة: الدول الأساسية الخمس عبر قراءاتٍ للإدارة وحدها. كلّ قسمٍ يُحمَّل
 * حين يُفتح، وكلّ رابطٍ إلى دولةٍ يفتحها في «مصادر التحقق» القائمة.
 */
export default function TrustCenter({
  openCountry,
  initialSection = "overview",
}: {
  openCountry: (code: string) => void;
  initialSection?: TrustSection;
}) {
  const c = useCopy(TRUST_COPY);
  const [section, setSection] = useState<TrustSection>(initialSection);
  const fetchOverview = useDataFn("trust.overview", getTrustOverview);
  const fetchAging = useDataFn("trust.aging", getTrustAging);
  const fetchTeam = useDataFn("trust.team", getTrustTeam);
  // النظرة تُحمَّل دائماً: منها قائمة الدول لمرشّحات السجلّ والتقرير.
  const overview = useQuery({
    queryKey: useDataKey(["trust-overview"]),
    queryFn: () => fetchOverview(),
  });
  const aging = useQuery({
    queryKey: useDataKey(["trust-aging"]),
    queryFn: () => fetchAging(),
    enabled: section === "aging",
  });
  const team = useQuery({
    queryKey: useDataKey(["trust-team"]),
    queryFn: () => fetchTeam(),
    enabled: section === "team",
  });

  return (
    <section className="mt-8" aria-labelledby="trust-center-title">
      <p className="eyebrow">{c.eyebrow}</p>
      <h2 id="trust-center-title" className="mt-2 text-2xl font-extrabold text-balance">
        {c.title}
      </h2>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-7 text-pretty">{c.lead}</p>

      <nav aria-label={c.sectionsLabel} className="mt-6 flex flex-wrap gap-2">
        {TRUST_SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            aria-current={section === s ? "true" : undefined}
            onClick={() => setSection(s)}
            className={cn(
              "focus-visible:ring-ring inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-[color,background-color,transform] focus-visible:ring-2 focus-visible:outline-none active:scale-[0.97]",
              section === s
                ? "border-primary bg-primary text-primary-foreground font-bold"
                : "border-border bg-card text-muted-foreground hover:text-foreground font-medium",
            )}
          >
            {c.sections[s]}
          </button>
        ))}
      </nav>
      <span aria-hidden="true" className="rule-champagne mt-2 block" />

      <div className="mt-6">
        {section === "overview" && (
          <Loadable query={overview}>
            {(rows) => <OverviewSection rows={rows} openCountry={openCountry} />}
          </Loadable>
        )}
        {section === "aging" && (
          <Loadable query={aging}>
            {(data) => <AgingSection data={data} openCountry={openCountry} />}
          </Loadable>
        )}
        {section === "team" && (
          <Loadable query={team}>
            {(rows) => <TeamSection rows={rows} openCountry={openCountry} />}
          </Loadable>
        )}
        {section === "decisions" && (
          <Loadable query={overview}>{(rows) => <DecisionLog countries={rows} />}</Loadable>
        )}
        {section === "weekly" && (
          <Loadable query={overview}>{(rows) => <WeeklyReport countries={rows} />}</Loadable>
        )}
      </div>
    </section>
  );
}
