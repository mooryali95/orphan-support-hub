/**
 * أماكن التجربة — تتمّة `try-demo` ومصدرها الواحد لكل ما يُعرض عن الأماكن (الخريطة، ورقة
 * الدعم، «أثري»، والقاعة). في ملفٍّ مستقلّ لأنّ `try-demo` يدخل حزمة الدخول (محمّل صفحة
 * الطفل)، وهذه لا يحتاجها إلا مسار الدعم والأثر؛ والحقيقة الواحدة لا تُكتب في الملفّين:
 * الأطفال هناك، وأماكنهم ومجموعاتهم وسماتهم هنا، واختبارٌ يقفل الربط بينهما.
 */
import { copyOf, defineCopy, type Locale } from "@/lib/locale";
import { TRY_CHILDREN, type TryChild } from "@/lib/try-demo";

/**
 * دول أطفال التجربة الست، ولكلٍّ منها منطقتان ومجموعةٌ واحدة. عدد أطفال المنطقة هو نفسه ما
 * تعرضه قاعة الأثر لمنطقتها (`hall`: معرّف المنطقة في `lib/hall/model`، واختبارٌ يقفل
 * التطابق)؛ وعدد الدولة مجموع منطقتيها، لا رقمٌ ثالث. المجموعة أوّل ثمانية أطفالٍ في المنطقة
 * الأولى، وطفل التجربة أوّلهم. كلّها أعدادٌ نموذجية، والمعرّفات لا تشبه معرّفات الدفع.
 */
export type TryRegion = {
  /** the map's own region id (admin-1) */
  id: string;
  /** the region's Latin name in the map file: the key the map matches its figures by */
  en: string;
  /** the same region in the impact hall (`regionsFor` in `lib/hall/model`) */
  hall: string;
  /** sample: children with a file here (the hall region's `need`) */
  children: number;
};

export type TryPlace = {
  co: string;
  regions: readonly [TryRegion, TryRegion];
  /** a fictional group: the first `children` children of the first region */
  group: { id: string; children: number };
};

/** sample: a group's size, as the hall forms them */
export const TRY_GROUP_SIZE = 8;
/** sample: sessions in a qualification journey, as the hall says («ستّ جلسات بين قياسين») */
export const TRY_SESSIONS = 6;
/** the six traits the trial names, in the hall's order (`TRAITS` in `lib/hall/model`) */
export const TRY_TRAITS = ["rushd", "ukhuwwa", "sumud", "kifayat", "dirayah", "himmah"] as const;
export type TryTrait = (typeof TRY_TRAITS)[number];

const group = (co: string) => ({ id: `DEMO-GRP-${co}`, children: TRY_GROUP_SIZE });

export const TRY_PLACES: readonly TryPlace[] = [
  {
    co: "AL",
    regions: [
      { id: "ALB-1529", en: "Tirana", hall: "tirana", children: 88 },
      { id: "ALB-1498", en: "Shkodër", hall: "shkoder", children: 40 },
    ],
    group: group("AL"),
  },
  {
    co: "SN",
    regions: [
      { id: "SEN-759", en: "Dakar", hall: "SN-r1", children: 37 },
      { id: "SEN-768", en: "Thiès", hall: "SN-r2", children: 39 },
    ],
    group: group("SN"),
  },
  {
    co: "EG",
    regions: [
      { id: "EGY-1533", en: "Cairo", hall: "EG-r1", children: 44 },
      { id: "EGY-1544", en: "Giza", hall: "EG-r2", children: 34 },
    ],
    group: group("EG"),
  },
  {
    co: "KE",
    regions: [
      { id: "KEN-1196", en: "Nairobi", hall: "KE-r1", children: 44 },
      { id: "KEN-1193", en: "Coast", hall: "KE-r2", children: 30 },
    ],
    group: group("KE"),
  },
  {
    co: "BA",
    regions: [
      { id: "BIH-2890", en: "Sarajevo Canton", hall: "BA-r1", children: 57 },
      { id: "BIH-2887", en: "Tuzla Canton", hall: "BA-r2", children: 59 },
    ],
    group: group("BA"),
  },
  {
    co: "ID",
    regions: [
      { id: "IDN-1227", en: "Jakarta", hall: "ID-r1", children: 24 },
      { id: "IDN-1223", en: "West Java", hall: "ID-r2", children: 48 },
    ],
    group: group("ID"),
  },
];

export const tryPlace = (co: string) => TRY_PLACES.find((p) => p.co === co);
/** a country's children: the sum of its regions, never a figure of its own */
export const placeChildren = (p: TryPlace) => p.regions.reduce((a, r) => a + r.children, 0);
/** the trial child standing in a country (one each) */
export const tryChildOf = (co: string) => TRY_CHILDREN.find((c) => c.co === co);
/** the map region a trial child is listed under: the one the hall also puts them in */
export const tryRegionOfChild = (c: Pick<TryChild, "co" | "region">) =>
  tryPlace(c.co)?.regions.find((r) => r.hall === c.region);

const COPY = defineCopy("lib/try-places", {
  ar: {
    regions: {
      "ALB-1529": "تيرانا",
      "ALB-1498": "إشقودرة",
      "EGY-1533": "القاهرة",
      "EGY-1544": "الجيزة",
      "SEN-759": "داكار",
      "SEN-768": "ثيس",
      "KEN-1196": "نيروبي",
      "KEN-1193": "المحافظة الساحلية",
      "BIH-2890": "كانتون سراييفو",
      "BIH-2887": "كانتون توزلا",
      "IDN-1227": "جاكرتا",
      "IDN-1223": "جاوة الغربية",
    },
    groups: {
      "DEMO-GRP-AL": "مجموعة الفجر",
      "DEMO-GRP-EG": "مجموعة النور",
      "DEMO-GRP-SN": "مجموعة الأمل",
      "DEMO-GRP-KE": "مجموعة البشائر",
      "DEMO-GRP-BA": "مجموعة الوفاء",
      "DEMO-GRP-ID": "مجموعة الهدى",
    },
    program: "رحلة التأهيل الأساسية",
    traits: {
      rushd: "الرشد",
      ukhuwwa: "الأخوّة الإيمانية",
      sumud: "الصمود",
      kifayat: "الكفايات",
      dirayah: "الدراية",
      himmah: "الهمّة",
    } satisfies Record<TryTrait, string>,
  },
  en: {
    regions: {
      "ALB-1529": "Tirana",
      "ALB-1498": "Shkodër",
      "EGY-1533": "Cairo",
      "EGY-1544": "Giza",
      "SEN-759": "Dakar",
      "SEN-768": "Thiès",
      "KEN-1196": "Nairobi",
      "KEN-1193": "Coast",
      "BIH-2890": "Sarajevo Canton",
      "BIH-2887": "Tuzla Canton",
      "IDN-1227": "Jakarta",
      "IDN-1223": "West Java",
    },
    groups: {
      "DEMO-GRP-AL": "Dawn group",
      "DEMO-GRP-EG": "Light group",
      "DEMO-GRP-SN": "Hope group",
      "DEMO-GRP-KE": "Glad Tidings group",
      "DEMO-GRP-BA": "Loyalty group",
      "DEMO-GRP-ID": "Guidance group",
    },
    program: "Foundation qualification journey",
    traits: {
      rushd: "Sound judgement",
      ukhuwwa: "Brotherhood in faith",
      sumud: "Steadfastness",
      kifayat: "Competencies",
      dirayah: "Discernment",
      himmah: "Drive",
    } satisfies Record<TryTrait, string>,
  },
});

type TryRegionId = keyof (typeof COPY)["ar"]["regions"];
type TryGroupId = keyof (typeof COPY)["ar"]["groups"];

/** the names of the trial's places and of its sample programme, in the interface language */
export const tryRegionName = (id: string, locale: Locale) =>
  copyOf(COPY, locale).regions[id as TryRegionId] ?? id;
export const tryGroupName = (id: string, locale: Locale) =>
  copyOf(COPY, locale).groups[id as TryGroupId] ?? id;
export const tryProgramName = (locale: Locale) => copyOf(COPY, locale).program;
export const tryTraitName = (key: TryTrait, locale: Locale) => copyOf(COPY, locale).traits[key];
