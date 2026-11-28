/**
 * لغتا الوليّ والمشرف في الميدان: العربية والألبانية.
 *
 * قاموسٌ صغير بمفاتيح ثابتة، لا مكتبة: الصفحات المترجمة قليلة، والنصّ
 * الحسّاس (نصّ الموافقة) يُعرض بالعربية دائماً لأنه المحفوظ في السجلّ
 * حرفياً، وترجمته تُعرض تحته للفهم.
 */
export type Lang = "ar" | "sq" | "en";

const DICT = {
  guardianTitle: { ar: "مساحة ولي الأمر", sq: "Hapësira e kujdestarit", en: "Guardian space" },
  guardianIntro: {
    ar: "أين وصل من ترعاهم، وما المطلوب منك.",
    sq: "Ku kanë arritur fëmijët në kujdesin tuaj dhe çfarë kërkohet nga ju.",
    en: "Where the children in your care stand, and what is asked of you.",
  },
  progress: {
    ar: "التقدّم في البرنامج",
    sq: "Përparimi në program",
    en: "Progress in the program",
  },
  sessionsOf: { ar: "جلسات مقبولة من", sq: "seanca të pranuara nga", en: "sessions accepted of" },
  nextSession: { ar: "الجلسة التالية", sq: "Seanca e radhës", en: "Next session" },
  notEnrolled: {
    ar: "لم يلتحق ببرنامج بعد.",
    sq: "Ende nuk është regjistruar në program.",
    en: "Not enrolled in a program yet.",
  },
  needsYou: { ar: "ينتظر موافقتك", sq: "Pret miratimin tuaj", en: "Awaiting your consent" },
  agree: { ar: "أوافق", sq: "Pajtohem", en: "I agree" },
  notNow: { ar: "ليس الآن", sq: "Jo tani", en: "Not now" },
  photos: { ar: "صور الطفل", sq: "Fotot e fëmijës", en: "Photos of the child" },
  photoNone: { ar: "لا صور", sq: "Pa foto", en: "No photos" },
  photoHidden: { ar: "صور بلا وجه", sq: "Foto pa fytyrë", en: "Photos without the face" },
  photoFull: { ar: "صور بالوجه", sq: "Foto me fytyrë", en: "Photos with the face" },
  photoWithdraw: { ar: "سحب الموافقة", sq: "Tërhiq miratimin", en: "Withdraw consent" },
  saved: { ar: "حُفظت موافقتك", sq: "Miratimi u ruajt", en: "Your consent was saved" },
  noChildren: {
    ar: "لا ملفات مرتبطة بحسابك",
    sq: "Asnjë dosje e lidhur me llogarinë tuaj",
    en: "No files linked to your account",
  },
  statementNote: {
    ar: "يُحفظ هذا النصّ مع اسمك ووقت الموافقة.",
    sq: "Ky tekst ruhet me emrin tuaj dhe kohën e miratimit.",
    en: "This text is saved with your name and the time of consent.",
  },
  today: { ar: "اليوم", sq: "Sot", en: "Today" },
  nothingToday: {
    ar: "لا شيء ينتظرك اليوم.",
    sq: "Asgjë nuk ju pret sot.",
    en: "Nothing awaits you today.",
  },
  task_review_unit: {
    ar: "مخرَجٌ مسلَّم ينتظر قرارك",
    sq: "Një punë e dorëzuar pret vendimin tuaj",
    en: "A delivered output awaits your decision",
  },
  task_consent_missing: {
    ar: "موافقة الوليّ غير موثّقة",
    sq: "Miratimi i kujdestarit mungon",
    en: "Guardian consent is not documented",
  },
  task_baseline_missing: {
    ar: "القياس الأوّلي لم يُسجَّل",
    sq: "Matja fillestare nuk është regjistruar",
    en: "The baseline measure is not recorded",
  },
  task_final_missing: {
    ar: "القياس الختامي لم يُسجَّل",
    sq: "Matja përfundimtare nuk është regjistruar",
    en: "The final measure is not recorded",
  },
} as const;

export type I18nKey = keyof typeof DICT;

export function t(key: I18nKey, lang: Lang): string {
  return DICT[key][lang];
}

const KEY = "kahatayn:lang";

/** اللغة المحفوظة؛ وبلا اختيارٍ محفوظ تتبع لغة الواجهة (`fallback`). */
export function readLang(fallback: Lang = "ar"): Lang {
  try {
    const v = localStorage.getItem(KEY);
    return v === "sq" || v === "ar" || v === "en" ? v : fallback;
  } catch {
    return fallback;
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

/** ترجمةٌ إنجليزية للفهم تحت نصّ الموافقة العربي المحفوظ. */
export const CONSENT_EN: Record<string, string> = {
  "enrollment:granted":
    "As guardian, I agree that the child joins the capability program, that their progress is measured and their traits observed, and that this is shown to those the administration permits.",
  "photo:face_hidden":
    "I agree to publishing photos of the child in which the face does not appear.",
  "photo:granted":
    "I agree to publishing photos of the child in which the face appears, and I know I can withdraw consent at any time and the photo is deleted.",
  "photo:withdrawn": "I withdraw my consent to publishing photos of the child.",
};
