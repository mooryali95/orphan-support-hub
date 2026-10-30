import { queryOptions } from "@tanstack/react-query";

import { getGeoStats, type GeoCountryRow } from "@/lib/protection.functions";
import { resolveCountry } from "@/lib/countries";

/**
 * الجغرافيا من مصدرٍ واحد — `geo_stats` في القاعدة.
 *
 * تقرأ منها الخارطة (أيّ الدول تُفتح وأيّ المناطق تُلوَّن) والدليل
 * (قائمتا البلد والمنطقة وأعدادهما). فما تُظهره الخارطة يجده الدليل.
 */
export type GeoCount = { total: number | null; sponsored: number | null; small: boolean };
export type GeoCountry = GeoCount & {
  /** النصّ كما في القاعدة — به يُفلتَر الدليل. */
  value: string;
  /** رمز ISO إن عُرف — به تُرسم الخارطة. */
  code: string | null;
  regions: Array<GeoCount & { value: string }>;
};
export type Geo = { available: boolean; countries: GeoCountry[] };

export function shapeGeo(rows: GeoCountryRow[], available: boolean): Geo {
  return {
    available,
    countries: rows.map((r) => ({
      value: r.country,
      code: resolveCountry(r.country),
      total: r.total,
      sponsored: r.sponsored,
      small: r.small,
      regions: r.regions.map((g) => ({
        value: g.region,
        total: g.total,
        sponsored: g.sponsored,
        small: g.small,
      })),
    })),
  };
}

export const geoQuery = queryOptions({
  queryKey: ["geo-stats"],
  queryFn: async () => {
    const res = await getGeoStats();
    return shapeGeo(res.countries, res.available);
  },
  staleTime: 5 * 60_000,
});

/** الدولة بقيمتها في القاعدة أو برمزها. */
export function findCountry(geo: Geo | undefined, key: string | null | undefined) {
  if (!geo || !key) return undefined;
  const code = resolveCountry(key);
  return geo.countries.find((c) => c.value === key || (code && c.code === code));
}
