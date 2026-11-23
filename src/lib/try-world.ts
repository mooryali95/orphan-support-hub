/**
 * كتالوج التجربة لبقية دول العالم — تتمّة الدول الست المكتوبة باليد في `try-places` و`try-demo`.
 * المبدأ: التجربة تجربةٌ كاملة لا تحتاج بياناتٍ حقيقية، فكل دولةٍ ترسمها الخريطة تُدخَل وتُدعَم:
 * للمنظمة فيها مكتبٌ أو نشاطٌ أو لا شيء. لكل دولةٍ منطقتان (اسماهما حقيقيان من ملفّ الخريطة،
 * `try-world.data`) ومجموعةٌ وطفلٌ باسمٍ مستعار ورمز DEMO-، وكل ما عدا اسم المنطقة افتراضي.
 *
 * يُشتقّ كل رقمٍ واسمٍ من رمز الدولة ببذرةٍ ثابتة، فلا يتغيّر بين تحميلٍ وآخر ولا بين القاعة
 * والصفحات. لا يدخل حزمة الدخول ولا صفحات الرؤية: يحمّله مسار التجربة والقاعة وحدهما، وحين
 * يُحمَّل يضيف أطفاله إلى `TRY_WORLD_CHILDREN` فيجدهم `tryChild`.
 */
import { continentOf, countryName } from "@/lib/countries";
import { copyOf, defineCopy, type Locale } from "@/lib/locale";
import { TRY_WORLD_CHILDREN, TRY_WORLD_EXTRA, type TryChild } from "@/lib/try-demo";
import type { TryPlace } from "@/lib/try-places";
import { TRY_WORLD_ROWS } from "@/lib/try-world.data";

/** a stable number from a string (FNV-1a): the seed of every sample figure here */
const seed = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
/** a whole number in `from..to`, fixed for a country and a purpose */
const pick = (co: string, what: string, from: number, to: number) =>
  from + (seed(`${co}:${what}`) % (to - from + 1));

/** which pool of pseudonyms a country draws from: by language and culture, then by continent */
const POOLS = {
  arab: "DZ BH IQ JO KW LB LY MA MR OM PS QA SA SD SY TN AE YE KM",
  horn: "DJ SO ER ET",
  sahel: "TD NE GN NG CM ML CI BF BJ TG GH GM GW SL LR CV CF GA GQ CG ST",
  swahili: "TZ RW UG BI CD MZ MW ZM ZW ZA SS MG SC MU NA BW LS SZ AO",
  balkan: "MK XK ME RS HR SI BG RO MD GR CY",
  turkic: "TR AZ KZ KG UZ TM TJ MN",
  southAsia: "BD PK IN AF IR LK NP MV BT",
  malay: "MY BN TH PH SG KH VN LA MM TL",
  latin: "MX GT HN SV NI CR PA CU DO BZ ES PT",
} as const;
type Pool = keyof typeof POOLS | "global";
const POOL_OF = new Map<string, Pool>();
for (const [pool, codes] of Object.entries(POOLS) as Array<[Pool, string]>) {
  for (const code of codes.split(" ")) POOL_OF.set(code, pool);
}
const poolOf = (co: string): Pool => {
  const own = POOL_OF.get(co);
  if (own) return own;
  const continent = continentOf(co);
  return continent === "SA" ? "latin" : continent === "AF" ? "swahili" : "global";
};

/**
 * الأسماء المستعارة وصفات الملفّ النموذجية. القائمتان متناظرتان موضعاً بموضع: الاسم العربي
 * ومقابله بالحرف اللاتيني، فيُختار الموضع نفسه في اللغتين.
 */
const COPY = defineCopy("lib/try-world", {
  ar: {
    names: {
      arab: ["أحمد", "خالد", "حمزة", "سلمان", "فاطمة", "نور", "هدى", "ريم"],
      horn: ["عبدي", "إدريس", "بلال", "محمود", "حليمة", "أمينة", "زهرة", "هودان"],
      sahel: ["أمادو", "موسى", "إبراهيما", "عثمان", "فاتو", "أميناتا", "مريمة", "عائشتو"],
      swahili: ["جمعة", "سليمان", "رشيدي", "بكاري", "زينب", "رحمة", "نيما", "آمنة"],
      balkan: ["دامير", "أمير", "بسيم", "عدنان", "أمينة", "ليلى", "ألما", "أرتا"],
      turkic: ["تيمور", "أيبك", "رستم", "نورلان", "أيغول", "مدينة", "زرينة", "ديلنوزا"],
      southAsia: ["راشد", "عمران", "فيصل", "كريم", "عائشة", "نسرين", "رقية", "شبانة"],
      malay: ["رزقي", "فجر", "حفيظ", "أحمد", "ستي", "نور", "دوي", "عائشة"],
      latin: ["ماتيو", "دييغو", "لوكاس", "غابرييل", "لوسيا", "صوفيا", "كاميلا", "إيلينا"],
      global: ["آدم", "يوسف", "إلياس", "نوح", "سارة", "مريم", "ليلى", "حنّة"],
    } satisfies Record<Pool, string[]>,
    grades: [
      "الصف الأول",
      "الصف الثاني",
      "الصف الثالث",
      "الصف الرابع",
      "الصف الخامس",
      "الصف السادس",
      "المرحلة المتوسطة",
    ],
    covers: [
      "الدراسة والغذاء والرعاية الصحية",
      "الرسوم المدرسية والزيّ والغذاء",
      "الغذاء والسكن والمتابعة الصحية",
      "الدراسة والمواصلات والكتب",
      "الدراسة والأنشطة والرعاية النفسية",
      "الغذاء والدراسة وحلقات التحفيظ",
    ],
    groups: [
      "مجموعة الفجر",
      "مجموعة النور",
      "مجموعة الأمل",
      "مجموعة البشائر",
      "مجموعة الوفاء",
      "مجموعة الهدى",
      "مجموعة الإحسان",
      "مجموعة السلام",
      "مجموعة العزم",
      "مجموعة الرحمة",
      "مجموعة اليقين",
      "مجموعة البركة",
    ],
  },
  en: {
    names: {
      arab: ["Ahmad", "Khalid", "Hamza", "Salman", "Fatima", "Nour", "Huda", "Reem"],
      horn: ["Abdi", "Idris", "Bilal", "Mahamud", "Halima", "Amina", "Zahra", "Hodan"],
      sahel: ["Amadou", "Moussa", "Ibrahima", "Ousmane", "Fatou", "Aminata", "Mariama", "Aissatou"],
      swahili: ["Juma", "Suleiman", "Rashidi", "Bakari", "Zainabu", "Rehema", "Neema", "Amina"],
      balkan: ["Damir", "Emir", "Besim", "Adnan", "Amina", "Lejla", "Alma", "Arta"],
      turkic: ["Timur", "Aybek", "Rustam", "Nurlan", "Aygul", "Madina", "Zarina", "Dilnoza"],
      southAsia: ["Rashid", "Imran", "Faisal", "Karim", "Ayesha", "Nasrin", "Ruqayya", "Shabana"],
      malay: ["Rizki", "Fajar", "Hafiz", "Ahmad", "Siti", "Nur", "Dewi", "Aisyah"],
      latin: ["Mateo", "Diego", "Lucas", "Gabriel", "Lucia", "Sofia", "Camila", "Elena"],
      global: ["Adam", "Yusuf", "Elias", "Noah", "Sara", "Maryam", "Layla", "Hanna"],
    } satisfies Record<Pool, string[]>,
    grades: ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Middle school"],
    covers: [
      "Schooling, food and healthcare",
      "School fees, uniform and food",
      "Food, housing and health follow-up",
      "Schooling, transport and books",
      "Schooling, activities and emotional care",
      "Food, schooling and Qur'an study circles",
    ],
    groups: [
      "Dawn group",
      "Light group",
      "Hope group",
      "Glad Tidings group",
      "Loyalty group",
      "Guidance group",
      "Kindness group",
      "Peace group",
      "Resolve group",
      "Mercy group",
      "Certainty group",
      "Blessing group",
    ],
  },
});

/** sample ranges, in the spirit of the six hand-written countries */
const REGION_CHILDREN = [18, 64] as const;
const GROUP_SIZE = 8;

const AR = copyOf(COPY, "ar");
const EN = copyOf(COPY, "en");

type Names = { ar: string; en: string };
const regionNames = new Map<string, Names>();
const groupIndex = new Map<string, number>();
const places: TryPlace[] = [];
const children: TryChild[] = [];
const extras: TryChild[] = [];

/** أطفالٌ إضافيون في كلّ منطقة لدليل التجربة: ثابتون محسوبون، لا عشوائيون. */
export const EXTRA_PER_REGION = 4;

export function makeChild(
  co: string,
  key: string,
  region: string,
  id: string,
  code: string,
): TryChild {
  const pool = poolOf(co);
  const n = seed(`${key}:name`) % AR.names[pool].length;
  const age = pick(key, "age", 6, 14);
  const grade = Math.min(age - 6, AR.grades.length - 1);
  const covers = seed(`${key}:covers`) % AR.covers.length;
  const need = 10 * pick(key, "need", 8, 15);
  // always an open need of at least 20, so the child can be sponsored
  const funded = 5 * pick(key, "funded", 0, (need - 20) / 5);
  return {
    id,
    co,
    region,
    code,
    name: AR.names[pool][n]!,
    country: countryName(co, "ar"),
    age,
    stage: AR.grades[grade]!,
    need,
    funded,
    waitingDays: pick(key, "wait", 30, 320),
    covers: AR.covers[covers]!,
    en: { name: EN.names[pool][n]!, stage: EN.grades[grade]!, covers: EN.covers[covers]! },
  };
}

for (const line of TRY_WORLD_ROWS.trim().split("\n")) {
  const [co, id1, en1, ar1, id2, en2, ar2] = line.split("|") as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  regionNames.set(id1, { ar: ar1, en: en1 });
  regionNames.set(id2, { ar: ar2, en: en2 });
  const group = `DEMO-GRP-${co}`;
  groupIndex.set(group, seed(`${co}:group`) % AR.groups.length);
  places.push({
    co,
    regions: [
      { id: id1, en: en1, hall: `${co}-r1`, children: pick(co, "r1", ...REGION_CHILDREN) },
      { id: id2, en: en2, hall: `${co}-r2`, children: pick(co, "r2", ...REGION_CHILDREN) },
    ],
    group: { id: group, children: GROUP_SIZE },
  });

  // the country's trial child: the first child of its first region, as in the six
  children.push(makeChild(co, co, `${co}-r1`, `try-${co.toLowerCase()}`, `DEMO-TRY-${co}`));
  for (const r of [1, 2]) {
    for (let i = 1; i <= EXTRA_PER_REGION; i += 1) {
      extras.push(
        makeChild(
          co,
          `${co}:r${r}:${i}`,
          `${co}-r${r}`,
          `try-${co.toLowerCase()}-${r}${i}`,
          `DEMO-TRY-${co}-${r}${i}`,
        ),
      );
    }
  }
}

TRY_WORLD_CHILDREN.splice(0, TRY_WORLD_CHILDREN.length, ...children);
TRY_WORLD_EXTRA.splice(0, TRY_WORLD_EXTRA.length, ...extras);

/** every generated country, in code order; the six hand-written ones are not here */
export const WORLD_PLACES: readonly TryPlace[] = places;
/** each generated country's trial child, in the same order */
export const WORLD_CHILDREN: readonly TryChild[] = children;
/** the extra children of each region, for the trial directory (not the map's featured child) */
export const WORLD_EXTRA_CHILDREN: readonly TryChild[] = extras;

/** a generated region's name as the map file gives it; undefined for an id that is not generated */
export const worldRegionName = (id: string, locale: Locale) => {
  const n = regionNames.get(id);
  return n && (locale === "ar" ? n.ar : n.en);
};
/** a generated group's name; undefined for an id that is not generated */
export const worldGroupName = (id: string, locale: Locale) => {
  const i = groupIndex.get(id);
  return i === undefined ? undefined : copyOf(COPY, locale).groups[i];
};
