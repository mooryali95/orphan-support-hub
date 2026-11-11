/**
 * Explicit showcase mode — off. The home map now shows the researched WAMY
 * network (`@/data/wamy-network`), and child cards/counts come only from the
 * database. The fictional offices and child cards below stay for showcase use
 * only and must never be presented as real or payable.
 */
export const DEMO_MODE: boolean = false;

export const DEMO_OFFICES = [
  ["TD", "تشاد", "أنجمينا"],
  ["ID", "إندونيسيا", "جاكرتا"],
  ["KG", "قيرغيزستان", "بشكيك"],
  ["ML", "مالي", "باماكو"],
  ["NG", "نيجيريا", "أبوجا"],
  ["CM", "الكاميرون", "ياوندي"],
  ["GN", "غينيا", "كوناكري"],
  ["BD", "بنغلاديش", null],
  ["SD", "السودان", "الخرطوم"],
  ["NE", "النيجر", "نيامي"],
  ["SO", "الصومال", "مقديشو"],
  ["BA", "البوسنة والهرسك", "سراييفو"],
  ["EG", "مصر", "القاهرة"],
  ["TH", "تايلاند", "بانكوك"],
  ["KE", "كينيا", "نيروبي"],
  ["DJ", "جيبوتي", "جيبوتي"],
  ["SN", "السنغال", "دكار"],
  ["BR", "البرازيل", "ساو برناردو"],
  ["XK", "كوسوفو", "فريزاي"],
  ["MR", "موريتانيا", null],
  ["ZA", "جنوب أفريقيا", "ديربن"],
  ["PS", "فلسطين", "غزة"],
  ["IQ", "كردستان العراق", "أربيل"],
  ["YE", "اليمن", "عدن"],
  ["PH", "الفلبين", null],
  ["MY", "ماليزيا", "كاجنغ"],
  ["AL", "ألبانيا", null],
  ["MK", "مقدونيا الشمالية", null],
  ["ET", "إثيوبيا", null],
  ["TZ", "تنزانيا", null],
  ["RW", "رواندا", null],
  ["CI", "ساحل العاج", null],
  ["TJ", "طاجيكستان", null],
  ["UG", "أوغندا", null],
] as const;

export const DEMO_COUNTRIES = DEMO_OFFICES.map(([code, name]) => ({ code, name }));

export function demoGeography() {
  return {
    available: true,
    countries: DEMO_COUNTRIES.map(({ code, name }) => ({
      code,
      value: name,
      total: 8,
      sponsored: null,
      small: false,
      gap: null,
      currency: null,
      delivered: null,
      regions: [],
    })),
  };
}

export type DemoChild = {
  id: string;
  country: string;
  countryCode: string;
  gender: "male" | "female";
  ageBand: "age_6_11" | "age_12_14";
};

export function demoChildren(filters: {
  country?: string;
  search?: string;
  gender?: string;
  ageBand?: string;
  funding?: string;
  region?: string;
  educationStage?: string;
  group?: string;
  building?: boolean;
  sort?: string;
  offset?: number;
  limit?: number;
}) {
  let rows: DemoChild[] = DEMO_COUNTRIES.flatMap(({ code, name }) =>
    Array.from({ length: 8 }, (_, i) => ({
      id: `DEMO-${code}-${String(i + 1).padStart(2, "0")}`,
      country: name,
      countryCode: code,
      gender: i % 2 === 0 ? ("male" as const) : ("female" as const),
      ageBand: i < 4 ? ("age_6_11" as const) : ("age_12_14" as const),
    })),
  );
  rows = rows.filter(
    (r) =>
      (!filters.country || filters.country === r.country || filters.country === r.countryCode) &&
      (!filters.search ||
        `${r.id} ${r.country}`.toLowerCase().includes(filters.search.toLowerCase())) &&
      (!filters.gender || filters.gender === r.gender) &&
      (!filters.ageBand || filters.ageBand === r.ageBand),
  );
  if (
    filters.funding === "full" ||
    filters.region ||
    filters.educationStage ||
    filters.group ||
    filters.building
  )
    rows = [];
  if (filters.sort === "newest") rows.reverse();
  const total = rows.length;
  const offset = filters.offset ?? 0;
  return { rows: rows.slice(offset, offset + (filters.limit ?? 24)), total };
}
