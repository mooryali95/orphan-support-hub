/**
 * بيانات تجريبية للخارطة — المرحلة الأولى فقط، لعرض الحركة قبل ربط القاعدة.
 * تُستبدل في المرحلة الثانية بدالّةٍ في القاعدة تُرجع الأعداد بحماية
 * «أقل من ٥». الأرقام هنا مختلَقة ولا تمثّل أطفالاً حقيقيين.
 */
export type RegionStat = { total: number; sponsored: number };
export type CountryStat = { total: number; sponsored: number; regions: Record<string, RegionStat> };
export type MapStats = Record<string, CountryStat>;

export const DEMO_STATS: MapStats = {
  AL: {
    total: 96,
    sponsored: 61,
    regions: {
      Tirana: { total: 38, sponsored: 27 },
      Durrës: { total: 17, sponsored: 12 },
      Shkodër: { total: 12, sponsored: 6 },
      Elbasan: { total: 11, sponsored: 7 },
      Korçë: { total: 8, sponsored: 5 },
      Vlorë: { total: 7, sponsored: 3 },
      Kukës: { total: 3, sponsored: 1 },
    },
  },
  XK: {
    total: 24,
    sponsored: 9,
    regions: { Gjakova: { total: 14, sponsored: 6 }, Peja: { total: 10, sponsored: 3 } },
  },
  YE: {
    total: 57,
    sponsored: 20,
    regions: { "Ta'izz": { total: 31, sponsored: 9 }, "Al Hudaydah": { total: 26, sponsored: 11 } },
  },
  SD: {
    total: 41,
    sponsored: 13,
    regions: { Khartoum: { total: 25, sponsored: 8 }, "North Darfur": { total: 16, sponsored: 5 } },
  },
};

/** ما دون هذا العدد لا يُعرض رقمه — كما في بقية المنصّة. */
export const COHORT_MIN = 5;
