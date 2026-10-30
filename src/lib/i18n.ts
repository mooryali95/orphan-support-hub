/**
 * لغتا الوليّ والمشرف في الميدان: العربية والألبانية.
 *
 * قاموسٌ صغير بمفاتيح ثابتة، لا مكتبة: الصفحات المترجمة قليلة، والنصّ
 * الحسّاس (نصّ الموافقة) يُعرض بالعربية دائماً لأنه المحفوظ في السجلّ
 * حرفياً، وترجمته تُعرض تحته للفهم.
 */
export type Lang = "ar" | "sq";

const DICT = {
  guardianTitle: { ar: "مساحة ولي الأمر", sq: "Hapësira e kujdestarit" },
  guardianIntro: {
    ar: "أين وصل من ترعاهم، وما المطلوب منك.",
    sq: "Ku kanë arritur fëmijët në kujdesin tuaj dhe çfarë kërkohet nga ju.",
  },
  progress: { ar: "التقدّم في البرنامج", sq: "Përparimi në program" },
  sessionsOf: { ar: "جلسات مقبولة من", sq: "seanca të pranuara nga" },
  nextSession: { ar: "الجلسة التالية", sq: "Seanca e radhës" },
  notEnrolled: { ar: "لم يلتحق ببرنامج بعد.", sq: "Ende nuk është regjistruar në program." },
  needsYou: { ar: "ينتظر موافقتك", sq: "Pret miratimin tuaj" },
  agree: { ar: "أوافق", sq: "Pajtohem" },
  notNow: { ar: "ليس الآن", sq: "Jo tani" },
  photos: { ar: "صور الطفل", sq: "Fotot e fëmijës" },
  photoNone: { ar: "لا صور", sq: "Pa foto" },
  photoHidden: { ar: "صور بلا وجه", sq: "Foto pa fytyrë" },
  photoFull: { ar: "صور بالوجه", sq: "Foto me fytyrë" },
  photoWithdraw: { ar: "سحب الموافقة", sq: "Tërhiq miratimin" },
  saved: { ar: "حُفظت موافقتك", sq: "Miratimi u ruajt" },
  noChildren: { ar: "لا ملفات مرتبطة بحسابك", sq: "Asnjë dosje e lidhur me llogarinë tuaj" },
  statementNote: {
    ar: "يُحفظ هذا النصّ مع اسمك ووقت الموافقة.",
    sq: "Ky tekst ruhet me emrin tuaj dhe kohën e miratimit.",
  },
  today: { ar: "اليوم", sq: "Sot" },
  nothingToday: { ar: "لا شيء ينتظرك اليوم.", sq: "Asgjë nuk ju pret sot." },
  task_review_unit: {
    ar: "مخرَجٌ مسلَّم ينتظر قرارك",
    sq: "Një punë e dorëzuar pret vendimin tuaj",
  },
  task_consent_missing: { ar: "موافقة الوليّ غير موثّقة", sq: "Miratimi i kujdestarit mungon" },
  task_baseline_missing: {
    ar: "القياس الأوّلي لم يُسجَّل",
    sq: "Matja fillestare nuk është regjistruar",
  },
  task_final_missing: {
    ar: "القياس الختامي لم يُسجَّل",
    sq: "Matja përfundimtare nuk është regjistruar",
  },
} as const;

export type I18nKey = keyof typeof DICT;

export function t(key: I18nKey, lang: Lang): string {
  return DICT[key][lang];
}

const KEY = "kahatayn:lang";

export function readLang(): Lang {
  try {
    return localStorage.getItem(KEY) === "sq" ? "sq" : "ar";
  } catch {
    return "ar";
  }
}

export function saveLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* التخزين غير متاح: تبقى اللغة للجلسة فقط */
  }
}

/** ترجمةٌ للفهم تحت نصّ الموافقة العربي المحفوظ. */
export const CONSENT_SQ: Record<string, string> = {
  "enrollment:granted":
    "Si kujdestar, pajtohem që fëmija të regjistrohet në programin e kualifikimit, që të matet përparimi i tij dhe t'u tregohet atyre që lejon administrata.",
  "photo:face_hidden": "Pajtohem me publikimin e fotove të fëmijës pa iu dukur fytyra.",
  "photo:granted":
    "Pajtohem me publikimin e fotove ku duket fytyra e fëmijës dhe e di që mund ta tërheq miratimin në çdo kohë.",
  "photo:withdrawn": "Tërheq miratimin për publikimin e fotove të fëmijës.",
};
