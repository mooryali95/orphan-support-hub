/**
 * «جرّب المنصّة» — وضع تجربةٍ للعميل بلا حساب ولا دفعٍ حقيقي. أطفالٌ افتراضيون بأسماءٍ
 * مستعارة ورموز DEMO-، منفصلون تماماً عن المعرّفات القابلة للدفع: لا يصل شيءٌ منهم إلى
 * الدليل الحقيقي ولا إلى بوابة الدفع. الكفالات المحاكاة تُحفظ في متصفّح الزائر وحده.
 */
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
};

export const TRY_CURRENCY = "EUR";

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

export const tryChild = (id: string) => TRY_CHILDREN.find((c) => c.id === id);
export const gapOf = (c: Pick<TryChild, "need" | "funded">) => Math.max(0, c.need - c.funded);

/** the longest-waiting first, as in the real directory */
export const tryChildrenByWait = () =>
  [...TRY_CHILDREN].sort((a, b) => b.waitingDays - a.waitingDays);

export type TryGift = {
  id: string;
  childId: string;
  amount: number;
  cadence: "monthly" | "one_time";
  at: string;
};

const KEY = "try-demo:v1";
export const TRY_EVENT = "try-demo-change";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const safe = (): Store | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

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
  const g: TryGift = { ...gift, id: `gift-${now.getTime()}`, at: now.toISOString() };
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
 * visualisation. A monthly gift is dated a few months back, so the constellation has months
 * to show; the child's funding includes this gift.
 */
export function giftsAsSponsorships(gifts: TryGift[], now: Date = new Date()): MySponsorship[] {
  return gifts.flatMap((g, i) => {
    const c = tryChild(g.childId);
    if (!c) return [];
    const started = new Date(now);
    if (g.cadence === "monthly") started.setMonth(started.getMonth() - (3 + (i % 4)));
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
  TRY_CHILDREN.filter((c) => c.co === co && c.region === region);
