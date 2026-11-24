import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { InKindImpactView } from "@/components/impact/InKindImpactView";
import { KindSwitch } from "@/components/impact/KindSwitch";
import { QualificationImpactView } from "@/components/impact/QualificationImpactView";
import { useGivingCopy } from "@/config/giving-tracks";
import { defineCopy, useCopy } from "@/lib/locale";
import { getMyQualificationJourneys } from "@/lib/qualification.functions";
import { getMyPledges } from "@/lib/support.functions";
import {
  inKindFromPledges,
  journeyFromQualification,
  pledgeCard,
  type PledgeRow,
  type QualificationImpact,
  type SupportKind,
} from "@/lib/support-impact";

const COPY = defineCopy("components/support/MyPledgeImpact", {
  ar: {
    label: "أثر تعهّداتك بحسب نوع العطاء",
    lead: "التأهيل تطوّرٌ يُقاس، والعيني تسليمٌ موثّق. أمّا الكفالة المادية فأثرها في «كفالاتك» أدناه.",
    emptyQualification:
      "لم يُعيَّن بعدُ برنامجٌ للطفل الذي دعمت تأهيله، أو كان دعمك لمجموعةٍ أو منطقة: يظهر التطوّر هنا حين تبدأ الرحلة.",
    emptyInKind: "لا تعهّد عينياً بعد.",
  },
  en: {
    label: "Your pledges' impact by kind of giving",
    lead: "Qualification is development that is measured; in-kind giving is a documented delivery. Financial sponsorship has its impact under “My sponsorships” below.",
    emptyQualification:
      "No programme has been assigned yet to the child whose qualification you support, or your support went to a group or region: progress shows here once the journey starts.",
    emptyInKind: "No in-kind pledge yet.",
  },
});

const ID = "my-pledge-impact";

/**
 * أثر التأهيل والعيني الحقيقي في «أثري»: المنظران نفساهما اللذان تعرضهما التجربة، ببيانات
 * الداعم. العيني من `my_pledges()`، والتأهيل من رحلة الطفل كما تعرضها صفحته للعامّة.
 */
export function MyPledgeImpact() {
  const c = useCopy(COPY);
  const giving = useGivingCopy();
  const fetchPledges = useServerFn(getMyPledges);
  const fetchJourneys = useServerFn(getMyQualificationJourneys);
  const { data } = useQuery({ queryKey: ["my-pledges"], queryFn: () => fetchPledges() });
  const rows = ((data?.pledges ?? []) as PledgeRow[]).filter((p) => p.status !== "cancelled");
  const hasQualification = rows.some((p) => p.kind === "qualification");
  const { data: jr } = useQuery({
    queryKey: ["my-qualification-journeys"],
    queryFn: () => fetchJourneys(),
    enabled: hasQualification,
  });

  const now = new Date();
  const inKind = inKindFromPledges(rows, now);
  const qualification = rows
    .filter((p) => p.kind === "qualification")
    .flatMap((p): QualificationImpact[] => {
      const j = jr?.journeys[p.id];
      if (!j) return [];
      return [
        {
          ...pledgeCard(p, now),
          kind: "qualification",
          journey: journeyFromQualification({
            program: j.program,
            target_trait: j.target_trait,
            units_total: j.units_total ?? 0,
            units_accepted: j.units_accepted ?? 0,
            has_supervisor: j.has_supervisor,
            has_consent: j.has_consent,
            measured_before: j.measured_before ?? false,
            measured_after: j.measured_after ?? false,
          }),
        },
      ];
    });

  const counts: Record<SupportKind, number> = {
    qualification: rows.filter((p) => p.kind === "qualification").length,
    in_kind: inKind.length,
  };
  const [picked, setPicked] = useState<SupportKind | null>(null);
  if (counts.qualification + counts.in_kind === 0) return null;
  const kind: SupportKind = picked ?? (counts.qualification > 0 ? "qualification" : "in_kind");

  return (
    <section aria-label={c.label} className="mt-8">
      <KindSwitch
        idBase={ID}
        label={c.label}
        value={kind}
        onChange={setPicked}
        tabs={(["qualification", "in_kind"] as const).map((k) => ({
          key: k,
          label: giving.tracks[k].name,
          count: counts[k],
        }))}
      />
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{c.lead}</p>
      <div
        role="tabpanel"
        id={`${ID}-panel-${kind}`}
        aria-labelledby={`${ID}-tab-${kind}`}
        className="mt-4"
      >
        {kind === "qualification" ? (
          qualification.length > 0 ? (
            <QualificationImpactView items={qualification} />
          ) : (
            <p className="rounded-2xl border border-border bg-card p-6 text-sm leading-7 text-muted-foreground">
              {c.emptyQualification}
            </p>
          )
        ) : inKind.length > 0 ? (
          <InKindImpactView items={inKind} />
        ) : (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            {c.emptyInKind}
          </p>
        )}
      </div>
    </section>
  );
}
