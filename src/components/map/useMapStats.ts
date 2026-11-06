import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { geoQuery } from "@/lib/geo";
import { DEMO_GEO, toMapStats } from "./demo-stats";
import { DEMO_MODE } from "@/lib/demo-network";

/**
 * أعداد الخارطة من مصدر الجغرافيا الواحد. وحين تتعذّر القاعدة تُعرض
 * البيانات التجريبية بشارةٍ ظاهرة (`demo`) — لا صمتاً.
 */
export function useMapStats() {
  const { data } = useQuery(geoQuery);
  const geo = data?.available ? data : DEMO_GEO;
  const stats = useMemo(() => toMapStats(geo), [geo]);
  return { stats, geo, demo: DEMO_MODE || !data?.available };
}
