import { queryOptions } from "@tanstack/react-query";

import { getGeoStats, type GeoCountryRow } from "@/lib/protection.functions";
import { resolveCountry } from "@/lib/countries";
import { DEMO_MODE, demoGeography } from "@/lib/demo-network";

/**
 * الجغرافيا من مصدرٍ واحد — `geo_stats` في القاعدة.
 *
 * تقرأ منها الخارطة (أيّ الدول تُفتح وأيّ المناطق تُلوَّن) والدليل
 * (قائمتا البلد والمنطقة وأعدادهما). فما تُظهره الخارطة يجده الدليل.
 */
export type GeoCount = {
  total: number | null;
  sponsored: number | null;
  small: boolean;
  /** الحاجة الشهرية غير المغطّاة بالعملة الغالبة — تُحجب كالعدد إن صغر الحشد. */
  gap: number | null;
  currency: string | null;
  /** أطفالٌ وصلهم تسليمٌ موثّق خلال ٩٠ يوماً — بحماية تقسيم «مكفول/ينتظر» نفسها. */
  delivered: number | null;
};

/** صفٌّ من القاعدة ← العدّ الموحّد (الحقول الجديدة قد تغيب قبل تطبيق الهجرة). */
function countOf(r: {
  total: number | null;
  sponsored: number | null;
  small: boolean;
  gap?: number | string | null;
  currency?: string | null;
  delivered?: number | null;
}): GeoCount {
  return {
    total: r.total,
    sponsored: r.sponsored,
    small: r.small,
    gap: r.gap == null ? null : Number(r.gap),
    currency: r.currency ?? null,
    delivered: r.delivered ?? null,
  };
}
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
      ...countOf(r),
      regions: r.regions.map((g) => ({ value: g.region, ...countOf(g) })),
    })),
  };
}

export const geoQuery = queryOptions({
  queryKey: ["geo-stats"],
  queryFn: async () => {
    if (DEMO_MODE) return demoGeography();
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
