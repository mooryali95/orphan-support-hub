/**
 * الجمع العربي بقواعد اللغة لا بـ «إن كان واحداً»: صفر، واحد، اثنان،
 * ٣–١٠، ١١–٩٩، ومئة فما فوق — عبر Intl.PluralRules.
 *
 *   arCount(1,  SESSION) → «جلسة واحدة»
 *   arCount(2,  SESSION) → «جلستان»
 *   arCount(7,  SESSION) → «7 جلسات»
 *   arCount(12, SESSION) → «12 جلسة»
 */
export type ArForms = {
  zero: string;
  one: string;
  two: string;
  few: string;
  many: string;
  other: string;
};

const rules = new Intl.PluralRules("ar");

/** الصيغة كاملة بالعدد. «{n}» في الصيغة يُستبدل بالرقم. */
export function arCount(n: number, forms: ArForms): string {
  return forms[rules.select(n) as keyof ArForms].replace("{n}", String(n));
}

/** المعدود وحده بلا رقم — حين يُعرض الرقم منفصلاً («7 من 12 جلسة»). */
export function arNoun(n: number, forms: ArForms): string {
  return forms[rules.select(n) as keyof ArForms].replace("{n}", "").trim();
}

export const FILES: ArForms = {
  zero: "لا ملفات",
  one: "ملفّ واحد",
  two: "ملفان",
  few: "{n} ملفات",
  many: "{n} ملفاً",
  other: "{n} ملفّ",
};

export const SESSIONS: ArForms = {
  zero: "لا جلسات",
  one: "جلسة واحدة",
  two: "جلستان",
  few: "{n} جلسات",
  many: "{n} جلسة",
  other: "{n} جلسة",
};

export const MEMBERS: ArForms = {
  zero: "لا أعضاء",
  one: "عضو واحد",
  two: "عضوان",
  few: "{n} أعضاء",
  many: "{n} عضواً",
  other: "{n} عضو",
};

/**
 * صفة الجهة المانحة كما تُكتب في القاعدة. الحقل نصٌّ حرّ («وقف»، «شركة»)،
 * لكنّ ما يصل بمفتاحٍ إنجليزي («waqf»، «foundation») يُعرض بالعربية؛ وغيره كما كُتب.
 */
const ENTITY_TYPES: Record<string, string> = {
  waqf: "وقف",
  foundation: "مؤسسة",
  company: "شركة",
  corporate: "شركة",
  charity: "جمعية خيرية",
  ngo: "منظّمة غير ربحية",
  association: "جمعية",
  mosque: "مسجد",
  family: "عائلة",
  government: "جهة حكومية",
  individual: "فرد",
};
export function entityTypeLabel(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  return ENTITY_TYPES[v.toLowerCase()] ?? v;
}

export const COUNTRIES: ArForms = {
  zero: "لا دول",
  one: "دولة واحدة",
  two: "دولتان",
  few: "{n} دول",
  many: "{n} دولة",
  other: "{n} دولة",
};
