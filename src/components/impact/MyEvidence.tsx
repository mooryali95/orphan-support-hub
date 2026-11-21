import { useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ChildStanding } from "@/components/impact/ChildStanding";
import { EvidenceLedger } from "@/components/impact/EvidenceLedger";
import { ImpactMoment } from "@/components/impact/ImpactMoment";
import { evidenceFromLedger, impactMoments } from "@/lib/impact-evidence";
import { getSponsorshipLedger } from "@/lib/ledger.functions";
import type { MyImpact } from "@/lib/my-impact";

/** the dashboard reads at most this many ledgers; the rest stay one tap away on their own page */
const MAX_LEDGERS = 6;

/**
 * الأثر الموثّق في لوحة الداعم الحقيقية: لحظة الأثر، و«بحصّتك وبدونها»، وسجلّ الأشهر من
 * `sponsorship_ledger` لكلّ كفالة (الباب نفسه الذي تقرؤه صفحة الكفالة، والقاعدة تتحقّق أنّها
 * كفالته). إن تعذّر سجلٌّ سكت عنه ولم يُعرض بدله شيء؛ ولا يُقرأ من الطفل غير اسمه المعروض.
 */
export function MyEvidence({
  impact,
  sponsorshipIds,
}: {
  impact: MyImpact;
  /** the donor's sponsorships that have started (not awaiting payment), newest first */
  sponsorshipIds: string[];
}) {
  const fetchLedger = useServerFn(getSponsorshipLedger);
  const results = useQueries({
    queries: sponsorshipIds.slice(0, MAX_LEDGERS).map((id) => ({
      queryKey: ["ledger", id],
      queryFn: () => fetchLedger({ data: { sponsorshipId: id } }),
    })),
  });
  const ledgers = results.flatMap((r) => (r.data?.ok && r.data.ledger ? [r.data.ledger] : []));
  const loading = results.some((r) => r.isLoading);
  const rows = ledgers.flatMap(evidenceFromLedger);
  const charge = ledgers
    .map((l) => l.sponsorship.next_charge_at)
    .filter((d): d is string => Boolean(d))
    .sort()[0];
  if (impact.children.length === 0) return null;
  return (
    <>
      {!loading && <ImpactMoment moments={impactMoments(impact, rows)} className="mt-6" />}
      <ChildStanding impact={impact} className="mt-6" />
      {!loading && ledgers.length > 0 && (
        <EvidenceLedger
          rows={rows}
          hideReports
          next={charge ? { kind: "charge", date: charge } : null}
          className="mt-6"
        />
      )}
    </>
  );
}
