import { useQueries, useQuery } from "@tanstack/react-query";

import { useDataFn, useDataKey } from "@/lib/data-port";
import { getSponsorshipLedger } from "@/lib/ledger.functions";

/** سجلّ الكفالة يُقرأ بالمفتاح نفسه في كلّ شاشة، ويبقى صالحاً خمس دقائق. */
export const LEDGER_STALE = 5 * 60_000;

/** سجلّ كفالةٍ واحدة من منفذ البيانات (`sponsor.ledger`): الخادم، أو نسخة التجربة. */
export function useLedger(sponsorshipId: string, enabled = true) {
  const fetchLedger = useDataFn("sponsor.ledger", getSponsorshipLedger);
  return useQuery({
    queryKey: useDataKey(["ledger", sponsorshipId]),
    queryFn: () => fetchLedger({ data: { sponsorshipId } }),
    staleTime: LEDGER_STALE,
    enabled,
  });
}

/** سجلّات عدّة كفالات معاً، بمفاتيح `useLedger` نفسها فتُشارك الذاكرة. */
export function useLedgers(ids: readonly string[], enabled = true) {
  const fetchLedger = useDataFn("sponsor.ledger", getSponsorshipLedger);
  const base = useDataKey(["ledger"]);
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: [...base, id],
      queryFn: () => fetchLedger({ data: { sponsorshipId: id } }),
      staleTime: LEDGER_STALE,
      // false: يقرأ ما في الذاكرة وحده (ما جلبته البطاقات حين ظهرت)، بلا طلبٍ جديد
      enabled,
    })),
  });
}
