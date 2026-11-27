import type { Geo, GeoCount } from "@/lib/geo";

/**
 * ما تحتاجه الخريطة من مصدر الجغرافيا (`geo_stats`)، مفهرساً برمز الدولة.
 *
 * كانت هنا أرقامٌ مختلَقة (`DEMO_GEO`) تُعرض حين تتعذّر القاعدة أو أثناء
 * التحميل. أُزيلت: خارج وضع العرض لا رقم إلا من القاعدة، وبيانات وضع العرض
 * في `@/lib/demo-network` وحده (انظر `map-source.ts`).
 */
export type RegionStat = GeoCount & { value: string };
export type CountryStat = GeoCount & { value: string; regions: Record<string, RegionStat> };
export type MapStats = Record<string, CountryStat>;

/** ما دون هذا العدد لا يُعرض رقمه — كما في القاعدة (cohort_min). */
export const COHORT_MIN = 5;

export function toMapStats(geo: Geo): MapStats {
  const out: MapStats = {};
  for (const c of geo.countries) {
    if (!c.code) continue;
    out[c.code] = {
      value: c.value,
      total: c.total,
      sponsored: c.sponsored,
      small: c.small,
      gap: c.gap,
      currency: c.currency,
      delivered: c.delivered,
      regions: Object.fromEntries(c.regions.map((r) => [r.value, r])),
    };
  }
  return out;
}
