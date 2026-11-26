import { useQuery } from "@tanstack/react-query";

import { useDataFn, useDataKey } from "@/lib/data-port";
import { getPublicVerification } from "@/lib/public-verification.functions";

/** شارة الثقة وشرطها لملفٍّ واحد: طلبٌ واحد في الذاكرة المشتركة للشارة ولصفحة الطفل. */
export function usePublicVerification(orphanId: string) {
  const fetchIt = useDataFn("verify.public", getPublicVerification);
  return useQuery({
    queryKey: useDataKey(["public-verification", orphanId]),
    queryFn: () => fetchIt({ data: { orphanId } }),
    staleTime: 10 * 60_000,
  });
}
