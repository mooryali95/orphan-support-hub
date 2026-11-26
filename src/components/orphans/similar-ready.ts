import { useQuery } from "@tanstack/react-query";

import { useDataFn, useDataKey } from "@/lib/data-port";
import { suggestReadyOrphans } from "@/lib/sponsorships.functions";

export const SIMILAR_READY_ID = "similar-ready";

export function similarReadyKey(orphanId: string, amount: number) {
  return ["similar-ready", orphanId, amount] as const;
}

/** الاقتراح نفسه للقسم ولشريط الجوال: طلبٌ واحد في الذاكرة المشتركة. */
export function useSimilarReady(orphanId: string, amount: number, enabled = true) {
  const fetchIt = useDataFn("sponsor.readySimilar", suggestReadyOrphans);
  return useQuery({
    queryKey: useDataKey(similarReadyKey(orphanId, amount)),
    queryFn: () => fetchIt({ data: { orphanId, amount } }),
    staleTime: 5 * 60_000,
    enabled,
  });
}
