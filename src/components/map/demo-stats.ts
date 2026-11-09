import type { Geo, GeoCount } from "@/lib/geo";

/**
 * ما تحتاجه الخارطة من مصدر الجغرافيا (`geo_stats`)، مفهرساً برمز الدولة.
 *
 * والبيانات التجريبية هنا تُعرض **فقط** حين تتعذّر القاعدة (متوقّفة أو لم
 * تُطبَّق الهجرة)، وعليها شارةٌ ظاهرة. أرقامها مختلَقة ولا تمثّل أطفالاً.
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

const n = (
  total: number,
  sponsored: number | null = null,
  delivered: number | null = null,
): GeoCount => {
  const small = total < COHORT_MIN;
  return {
    total: small ? null : total,
    sponsored,
    small,
    // فجوةٌ تقريبية: من لم يُكفل بعد × ٤٠ دولاراً.
    gap: small ? null : (total - (sponsored ?? 0)) * 40,
    currency: small ? null : "USD",
    delivered,
  };
};

export const DEMO_GEO: Geo = {
  available: false,
  countries: [
    {
      value: "ألبانيا",
      code: "AL",
      ...n(96, 61, 44),
      regions: [
        { value: "Tirana", ...n(38, 27, 22) },
        { value: "Durrës", ...n(17, 12, 7) },
        { value: "Shkodër", ...n(12, 6) },
        { value: "Elbasan", ...n(11, 7) },
        { value: "Korçë", ...n(8, 5) },
        { value: "Vlorë", ...n(7) },
        { value: "Kukës", ...n(3) },
      ],
    },
    {
      value: "كوسوفو",
      code: "XK",
      ...n(24, 9),
      regions: [
        { value: "Gjakova", ...n(14, 6) },
        { value: "Peja", ...n(10) },
      ],
    },
    {
      value: "اليمن",
      code: "YE",
      ...n(57, 20, 9),
      regions: [
        { value: "Ta'izz", ...n(31, 9) },
        { value: "Al Hudaydah", ...n(26, 11) },
      ],
    },
    {
      value: "السودان",
      code: "SD",
      ...n(41, 13),
      regions: [
        { value: "Khartoum", ...n(25, 8) },
        { value: "North Darfur", ...n(16, 5) },
      ],
    },
  ],
};
