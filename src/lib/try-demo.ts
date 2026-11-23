/**
 * «جرّب المنصّة» — وضع تجربةٍ للعميل بلا حساب ولا دفعٍ حقيقي. أطفالٌ افتراضيون بأسماءٍ
 * مستعارة ورموز DEMO-، منفصلون تماماً عن المعرّفات القابلة للدفع: لا يصل شيءٌ منهم إلى
 * الدليل الحقيقي ولا إلى بوابة الدفع. الكفالات المحاكاة تُحفظ في متصفّح الزائر وحده.
 */
import { tryStore, type TryStore } from "@/lib/try-store";
import { countryName } from "@/lib/countries";
import { formatMoney } from "@/lib/format";
import { copyOf, defineCopy, type Locale } from "@/lib/locale";
import { demoPayOptions, type PayOptions } from "@/lib/pay-options";
import type { MySponsorship } from "@/lib/sponsorships.functions";

export type TryChild = {
  id: string;
  code: string;
  name: string;
  country: string;
  age: number;
  stage: string;
  need: number;
  funded: number;
  waitingDays: number;
  /** where the child stands in the impact hall: country code and the hall's region id */
  co: string;
  region: string;
  /** what the monthly sponsorship covers for this child, in plain words */
  covers: string;
  /** a generated child's texts outside Arabic (`try-world`); the six below have theirs in `TRY_COPY` */
  en?: Pick<TryChild, "name" | "stage" | "covers">;
};

/** عملة حاجة أطفال التجربة: كل مبلغٍ محفوظ (حاجة، تمويل، عطاء) بها. */
export const TRY_CURRENCY = "EUR";

/**
 * عملات الدفع لطفل التجربة: عملة ملفّه، وعملة تشغيل بلده، والعملة الموحّدة —
 * من خريطة الدول وبذرة الأسعار الاسترشادية، بلا خادم.
 */
export const tryPayOptions = (c: Pick<TryChild, "co">): PayOptions =>
  demoPayOptions(c.co, TRY_CURRENCY);

export const TRY_CHILDREN: TryChild[] = [
  {
    id: "try-01",
    co: "AL",
    region: "tirana",
    code: "DEMO-TRY-01",
    name: "سارة",
    country: "ألبانيا",
    age: 9,
    stage: "الصف الرابع",
    need: 120,
    funded: 40,
    waitingDays: 214,
    covers: "الدراسة والغذاء والرعاية الصحية",
  },
  {
    id: "try-02",
    co: "SN",
    region: "SN-r1",
    code: "DEMO-TRY-02",
    name: "يوسف",
    country: "السنغال",
    age: 11,
    stage: "الصف السادس",
    need: 100,
    funded: 70,
    waitingDays: 160,
    covers: "الرسوم المدرسية والزيّ والغذاء",
  },
  {
    id: "try-03",
    co: "EG",
    region: "EG-r1",
    code: "DEMO-TRY-03",
    name: "مريم",
    country: "مصر",
    age: 7,
    stage: "الصف الثاني",
    need: 140,
    funded: 0,
    waitingDays: 301,
    covers: "الغذاء والسكن والمتابعة الصحية",
  },
  {
    id: "try-04",
    co: "KE",
    region: "KE-r1",
    code: "DEMO-TRY-04",
    name: "عمر",
    country: "كينيا",
    age: 13,
    stage: "المرحلة المتوسطة",
    need: 90,
    funded: 60,
    waitingDays: 98,
    covers: "الدراسة والمواصلات والكتب",
  },
  {
    id: "try-05",
    co: "BA",
    region: "BA-r1",
    code: "DEMO-TRY-05",
    name: "ليان",
    country: "البوسنة والهرسك",
    age: 10,
    stage: "الصف الخامس",
    need: 110,
    funded: 20,
    waitingDays: 187,
    covers: "الدراسة والأنشطة والرعاية النفسية",
  },
  {
    id: "try-06",
    co: "ID",
    region: "ID-r1",
    code: "DEMO-TRY-06",
    name: "آدم",
    country: "إندونيسيا",
    age: 8,
    stage: "الصف الثالث",
    need: 130,
    funded: 95,
    waitingDays: 45,
    covers: "الغذاء والدراسة وحلقات التحفيظ",
  },
];

/**
 * أطفال بقية دول التجربة (طفلٌ لكل دولةٍ على الخريطة): يملؤها `try-world` حين يُحمَّل، وهو
 * لا يدخل حزمة الدخول؛ يحمّله مسار التجربة قبل أيّ قراءة (`beforeLoad` في `routes/try`) والقاعة.
 */
export const TRY_WORLD_CHILDREN: TryChild[] = [];

export const tryChild = (id: string) =>
  TRY_CHILDREN.find((c) => c.id === id) ?? TRY_WORLD_CHILDREN.find((c) => c.id === id);
export const gapOf = (c: Pick<TryChild, "need" | "funded">) => Math.max(0, c.need - c.funded);

/** the longest-waiting first, as in the real directory */
export const tryChildrenByWait = () =>
  [...TRY_CHILDREN].sort((a, b) => b.waitingDays - a.waitingDays);

/** ما دُفع فعلاً حين اختار الداعم عملةً غير عملة الملف، بسعره وتاريخه. */
export type TryPaid = {
  amount: number;
  currency: string;
  /** السعر كما طُبّق: وحدةٌ من عملة الدفع بعملة الملف. */
  rate: number;
  asOf: string;
  indicative: boolean;
};

export type TryGift = {
  id: string;
  childId: string;
  /** ما قُيِّد لحاجة الطفل، بعملة الملف (`TRY_CURRENCY`) دائماً. */
  amount: number;
  cadence: "monthly" | "one_time";
  at: string;
  /** whom the donor gives it on behalf of («صدقة جارية عن…»), as they typed it */
  dedication?: string;
  /** غائبٌ حين دُفع بعملة الملف نفسها. */
  paid?: TryPaid;
};

/** ما دُفع كما حُفظ: مبلغٌ موجب بعملةٍ من ثلاثة أحرف وسعرٍ موجب بتاريخه؛ وإلا لا شيء. */
export const cleanPaid = (v: unknown): TryPaid | undefined => {
  if (!v || typeof v !== "object") return undefined;
  const p = v as Record<string, unknown>;
  const amount = Number(p["amount"]);
  const rate = Number(p["rate"]);
  const currency = String(p["currency"] ?? "");
  const asOf = String(p["asOf"] ?? "");
  if (!(amount > 0) || !(rate > 0) || !Number.isFinite(amount) || !Number.isFinite(rate)) {
    return undefined;
  }
  if (!/^[A-Z]{3}$/.test(currency) || currency === TRY_CURRENCY) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return undefined;
  return { amount, currency, rate, asOf, indicative: p["indicative"] !== false };
};

/** a dedication as typed: trimmed, single line, short; empty means none */
export const cleanDedication = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim().slice(0, 40);
  return t || undefined;
};

const KEY = "try-demo:v1";
export const TRY_EVENT = "try-demo-change";

type Store = TryStore;
/* the browser's store, or this tab's memory when the browser denies it (see `try-store`) */
const safe = (): Store | null => tryStore();

export function loadGifts(store: Pick<Storage, "getItem"> | null = safe()): TryGift[] {
  try {
    const v = JSON.parse(store?.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((g) => g && tryChild(g.childId) && g.amount > 0) : [];
  } catch {
    return [];
  }
}

export function addGift(
  gift: Omit<TryGift, "id" | "at">,
  store: Store | null = safe(),
  now: Date = new Date(),
): TryGift {
  const dedication = cleanDedication(gift.dedication);
  const paid = cleanPaid(gift.paid);
  const g: TryGift = {
    childId: gift.childId,
    amount: gift.amount,
    cadence: gift.cadence,
    id: `gift-${now.getTime()}`,
    at: now.toISOString(),
    ...(dedication ? { dedication } : {}),
    ...(paid ? { paid } : {}),
  };
  try {
    store?.setItem(KEY, JSON.stringify([g, ...loadGifts(store)].slice(0, 20)));
  } catch {
    /* storage blocked: the demo still completes on this page */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TRY_EVENT));
  return g;
}

export function resetGifts(store: Store | null = safe()) {
  try {
    store?.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TRY_EVENT));
}

/**
 * the simulated gifts in the shape «أثري» already reads, so the demo shows the real
 * visualisation. A gift starts when it was made; «قدّم شهراً» reads it from a later date, so
 * months are never claimed before they pass. The child's funding includes this gift.
 */
export function giftsAsSponsorships(gifts: TryGift[], locale: Locale = "ar"): MySponsorship[] {
  return gifts.flatMap((g) => {
    const k = tryChild(g.childId);
    if (!k) return [];
    const c = localTryChild(k, locale);
    const started = new Date(g.at);
    return [
      {
        id: g.id,
        amount: g.amount,
        currency: TRY_CURRENCY,
        type: g.cadence,
        status: "active" as const,
        created_at: started.toISOString(),
        started_at: started.toISOString(),
        ended_at: null,
        end_reason: null,
        cancel_effective_at: null,
        paused_until: null,
        provider_subscription_id: null,
        orphan: {
          id: c.id,
          display_name: c.name,
          code: c.code,
          monthly_need: c.need,
          funded_monthly: Math.min(c.need, c.funded + (g.cadence === "monthly" ? g.amount : 0)),
        },
      },
    ];
  });
}

/** the demo children standing in one region of the hall (the hall lists them under that column) */
export const tryChildrenIn = (co: string, region: string) =>
  [...TRY_CHILDREN, ...TRY_WORLD_CHILDREN].filter((c) => c.co === co && c.region === region);

/** how full the child's monthly need stands once this amount is added (monthly only), 0..100 */
export const coverageAfter = (
  c: Pick<TryChild, "need" | "funded">,
  amount: number,
  cadence: TryGift["cadence"],
) =>
  Math.min(
    100,
    Math.round(((c.funded + (cadence === "monthly" ? Math.max(0, amount) : 0)) / c.need) * 100),
  );

/**
 * نصوص أطفال التجربة بلغة الواجهة. البيانات أعلاه تبقى كما هي (القاعة والاختبارات تقرؤها)،
 * والعربية هنا نسخةٌ منها حرفاً بحرف للفهرس؛ وغير العربية اسمٌ مستعار مقابل.
 */
const TRY_COPY = defineCopy("lib/try-demo", {
  ar: {
    children: {
      "try-01": {
        name: "سارة",
        stage: "الصف الرابع",
        covers: "الدراسة والغذاء والرعاية الصحية",
      },
      "try-02": {
        name: "يوسف",
        stage: "الصف السادس",
        covers: "الرسوم المدرسية والزيّ والغذاء",
      },
      "try-03": {
        name: "مريم",
        stage: "الصف الثاني",
        covers: "الغذاء والسكن والمتابعة الصحية",
      },
      "try-04": {
        name: "عمر",
        stage: "المرحلة المتوسطة",
        covers: "الدراسة والمواصلات والكتب",
      },
      "try-05": {
        name: "ليان",
        stage: "الصف الخامس",
        covers: "الدراسة والأنشطة والرعاية النفسية",
      },
      "try-06": {
        name: "آدم",
        stage: "الصف الثالث",
        covers: "الغذاء والدراسة وحلقات التحفيظ",
      },
    },
    monthNotes: [
      "انتظم في الدراسة هذا الشهر.",
      "اكتملت لوازمه المدرسية.",
      "أتمّ الفحص الصحي الدوري.",
      "تحسّن تحصيله في القراءة.",
      "شارك في نشاط المجموعة.",
      "أنهى الفصل الدراسي بتقدّم.",
    ],
    transferTitle: "حُوِّل عطاؤك",
    transferText: (amount: string) => `${amount} إلى الجهة الميدانية.`,
    deliveryTitle: (name: string) => `سُلِّم لـ${name}`,
    deliveryText: "بمستند استلامٍ في ملفّ الكفالة.",
    noteTitle: "كلمة المشرف",
  },
  en: {
    children: {
      "try-01": {
        name: "Sara",
        stage: "Grade 4",
        covers: "Schooling, food and healthcare",
      },
      "try-02": {
        name: "Yusuf",
        stage: "Grade 6",
        covers: "School fees, uniform and food",
      },
      "try-03": {
        name: "Maryam",
        stage: "Grade 2",
        covers: "Food, housing and health follow-up",
      },
      "try-04": {
        name: "Omar",
        stage: "Middle school",
        covers: "Schooling, transport and books",
      },
      "try-05": {
        name: "Layan",
        stage: "Grade 5",
        covers: "Schooling, activities and emotional care",
      },
      "try-06": {
        name: "Adam",
        stage: "Grade 3",
        covers: "Food, schooling and Qur'an study circles",
      },
    },
    monthNotes: [
      "Attended school regularly this month.",
      "School supplies are now complete.",
      "Completed the routine health check.",
      "Reading has improved.",
      "Took part in the group activity.",
      "Finished the term with good progress.",
    ],
    transferTitle: "Your gift was transferred",
    transferText: (amount: string) => `${amount} to the field organization.`,
    deliveryTitle: (name: string) => `Delivered to ${name}`,
    deliveryText: "With a receipt kept in the sponsorship file.",
    noteTitle: "A note from the supervisor",
  },
});

type TryChildId = keyof (typeof TRY_COPY)["ar"]["children"];

/**
 * the same demo child with its display texts in the interface language. Arabic returns the data
 * untouched; ids, codes and amounts never change. The country is named from its code.
 */
export function localTryChild(c: TryChild, locale: Locale): TryChild {
  if (locale === "ar") return c;
  const t = copyOf(TRY_COPY, locale).children[c.id as TryChildId] ?? c.en;
  return t ? { ...c, ...t, country: countryName(c.co, locale) } : c;
}

/** what the donor receives in the n-th month of a sponsorship (simulated, for «قدّم شهراً») */
export function monthStory(
  c: Pick<TryChild, "name">,
  amount: number,
  n: number,
  locale: Locale = "ar",
): Array<{ key: "transfer" | "delivery" | "note"; title: string; text: string }> {
  const t = copyOf(TRY_COPY, locale);
  return [
    {
      key: "transfer",
      title: t.transferTitle,
      text: t.transferText(formatMoney(amount, TRY_CURRENCY, locale)),
    },
    { key: "delivery", title: t.deliveryTitle(c.name), text: t.deliveryText },
    {
      key: "note",
      title: t.noteTitle,
      text: t.monthNotes[(Math.max(1, n) - 1) % t.monthNotes.length]!,
    },
  ];
}

/** the longest-waiting demo child this visitor has not given to yet */
export const nextTryChild = (gifts: Pick<TryGift, "childId">[]) =>
  tryChildrenByWait().find((c) => !gifts.some((g) => g.childId === c.id));
