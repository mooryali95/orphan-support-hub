import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { geoQuery } from "@/lib/geo";
import { DEMO_MODE } from "@/lib/demo-network";
import { toMapStats } from "./demo-stats";
import { resolveMapSource } from "./map-source";

/**
 * أعداد الخارطة من مصدر الجغرافيا الواحد.
 *
 * في وضع العرض الصريح (`DEMO_MODE`) تُعرض المكاتب التجريبية بشارتها. وخارجه
 * لا رقم إلا من القاعدة: أثناء التحميل هيكلٌ فارغ، وعند التعذّر «غير متاحة
 * الآن» — لا أرقامٌ مختلَقة (ARC-11/PRD-15).
 */
export function useMapStats() {
  const { data, isError } = useQuery(geoQuery);
  const { geo, status } = useMemo(
    () => resolveMapSource(data, { demoMode: DEMO_MODE, failed: isError }),
    [data, isError],
  );
  const stats = useMemo(() => toMapStats(geo), [geo]);
  return { stats, geo, status, demo: status === "demo" };
}
