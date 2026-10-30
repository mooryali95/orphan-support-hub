/**
 * دول العالم — قائمة ISO 3166-1 كاملة، بلا ترجمةٍ يدوية.
 *
 * الأسماء من المتصفّح نفسه (Intl.DisplayNames) بأي لغة، فلا قاموس
 * يُصان ولا دولة تُنسى. والقاعدة تحفظ البلد نصّاً حرّاً أحياناً
 * («ألبانيا» أو «Albania» أو «AL»)، فـ `resolveCountry` يردّه إلى رمزه.
 */
export type Continent = "AF" | "AS" | "EU" | "NA" | "SA" | "OC" | "AN";

const BY_CONTINENT: Record<Continent, string> = {
  AF: "DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU YT MA MZ NA NE NG RE RW SH ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW",
  AS: "AF AM AZ BH BD BT BN KH CN CY GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE IO CX CC",
  EU: "AX AL AD AT BY BE BA BG HR CZ DK EE FO FI FR DE GI GR GG HU IS IE IM IT JE XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SJ SE CH UA GB VA",
  NA: "AI AG AW BS BB BZ BM BQ VG CA KY CR CU CW DM DO SV GL GD GP GT HT HN JM MQ MX MS NI PA PR BL KN LC MF PM VC SX TT TC US VI UM",
  SA: "AR BO BR CL CO EC FK GF GY PY PE SR UY VE",
  OC: "AS AU CK FJ PF GU KI MH FM NR NC NZ NU NF MP PW PG PN WS SB TK TO TV VU WF",
  AN: "AQ BV TF HM GS",
};

export const CONTINENT_LABEL: Record<Continent, { ar: string; sq: string; en: string }> = {
  AF: { ar: "أفريقيا", sq: "Afrika", en: "Africa" },
  AS: { ar: "آسيا", sq: "Azia", en: "Asia" },
  EU: { ar: "أوروبا", sq: "Evropa", en: "Europe" },
  NA: { ar: "أمريكا الشمالية والكاريبي", sq: "Amerika e Veriut", en: "North America" },
  SA: { ar: "أمريكا الجنوبية", sq: "Amerika e Jugut", en: "South America" },
  OC: { ar: "أوقيانوسيا", sq: "Oqeania", en: "Oceania" },
  AN: { ar: "القارة القطبية", sq: "Antarktida", en: "Antarctica" },
};

export const CONTINENT_ORDER: Continent[] = ["AS", "AF", "EU", "NA", "SA", "OC", "AN"];

const CONTINENT_OF = new Map<string, Continent>();
for (const [c, codes] of Object.entries(BY_CONTINENT) as Array<[Continent, string]>) {
  for (const code of codes.split(" ")) CONTINENT_OF.set(code, c);
}

/** كل رموز الدول المعترف بها في القائمة (٢٥٠ تقريباً). */
export const COUNTRY_CODES: string[] = [...CONTINENT_OF.keys()].sort();

export function continentOf(code: string): Continent | null {
  return CONTINENT_OF.get(code.toUpperCase()) ?? null;
}

const namers = new Map<string, Intl.DisplayNames>();
/** اسم الدولة بلغةٍ ما — من المتصفّح، وعند الغياب يعود الرمز نفسه. */
export function countryName(code: string, lang = "ar"): string {
  const upper = code.toUpperCase();
  try {
    let n = namers.get(lang);
    if (!n) {
      n = new Intl.DisplayNames([lang], { type: "region", fallback: "code" });
      namers.set(lang, n);
    }
    return n.of(upper) ?? upper;
  } catch {
    return upper;
  }
}

/** تطبيعٌ للمقارنة: بلا تشكيل، والألف والياء والتاء المربوطة موحّدة، وبلا «ال». */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/\u0640/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/(^|\s)ال/g, "$1")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** أسماءٌ شائعة لا يعطيها Intl: المختصرة والمحلية. */
const ALIASES: Record<string, string[]> = {
  SA: ["السعودية", "Saudi"],
  AE: ["الإمارات", "UAE", "Emirates"],
  AL: ["Shqipëria", "Shqiperia"],
  XK: ["كوسوفو", "Kosova", "Kosovo"],
  US: ["أمريكا", "امريكا", "USA", "الولايات المتحدة"],
  GB: ["بريطانيا", "UK", "England", "المملكة المتحدة"],
  PS: ["فلسطين", "غزة", "Palestine"],
  SY: ["سوريا", "سورية"],
  TR: ["تركيا", "Turkey"],
  BA: ["البوسنة", "Bosnia"],
  MK: ["مقدونيا", "Macedonia"],
  CD: ["الكونغو الديمقراطية"],
  KR: ["كوريا الجنوبية"],
  KP: ["كوريا الشمالية"],
};

let index: Map<string, string> | null = null;
function nameIndex(): Map<string, string> {
  if (index) return index;
  index = new Map();
  for (const code of COUNTRY_CODES) {
    index.set(normalize(code), code);
    for (const lang of ["ar", "en", "sq", "fr", "tr"])
      index.set(normalize(countryName(code, lang)), code);
  }
  for (const [code, names] of Object.entries(ALIASES)) {
    for (const n of names) index.set(normalize(n), code);
  }
  return index;
}

/** نصّ البلد كما في القاعدة ← رمزه، أو null إن لم يُعرف. */
export function resolveCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^[A-Za-z]{2}$/.test(v) && CONTINENT_OF.has(v.toUpperCase())) return v.toUpperCase();
  return nameIndex().get(normalize(v)) ?? null;
}

/** كلمات البحث لدولة: اسمها بالعربية والإنجليزية ولغتها المحلية ورمزها. */
export function countryKeywords(code: string): string[] {
  return [
    code,
    ...["ar", "en", "sq", "fr"].map((l) => countryName(code, l)),
    ...(ALIASES[code] ?? []),
  ];
}

/** علم الدولة من رمزها — زخرفةٌ فقط؛ ويندوز يعرض الحرفين بدل العلم. */
export function flagOf(code: string): string {
  return /^[A-Z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : "";
}
