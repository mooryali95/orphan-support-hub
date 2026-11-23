/**
 * «الدورة الكاملة» في التجربة — ملفّ طفلٍ واحد يُرى ينتقل عبر كلّ الأدوار:
 * جهة الرعاية تُدخله وترفع مستنداته ← الإدارة توثّقها وتعتمده ← يُنشر في الدليل
 * ← كافلٌ يدعمه ← المكتب يرسل تقرير الشهر الأوّل.
 *
 * هي الخطوات نفسها في المنصّة الحقيقية، بلا تعقيداتها: لا رفع ملفّاتٍ فعلي، ولا
 * انتظار، ولا خادم. كلّ شيءٍ في جلسة المتصفّح ويختفي بإغلاقه. والملفّ المنشور
 * يُسجَّل في `TRY_CYCLE` فيجده `tryChild`: صفحته ودعمه و«أثري» والقاعة تعمل
 * عليه بالمسار نفسه الذي يعمل على كلّ أطفال التجربة.
 */
import { countryName } from "@/lib/countries";
import { TRY_CYCLE, type TryChild } from "@/lib/try-demo";
import { tryPlace } from "@/lib/try-places";
import { tryStore } from "@/lib/try-store";

export const CYCLE_KEY = "try-cycle:v1";
export const CYCLE_EVENT = "try-cycle-change";
export const CYCLE_CHILD_ID = "try-cycle-1";

/** المستندات الإلزامية كما في الإدخال الحقيقي، بمفاتيح التوثيق نفسها. */
export const CYCLE_DOCS = [
  "death_certificate",
  "birth_certificate",
  "guardianship_proof",
  "photo_consent",
] as const;
export type CycleDoc = (typeof CYCLE_DOCS)[number];

export type CycleStage = "draft" | "submitted" | "published";

export type Cycle = {
  stage: CycleStage;
  child: { name: string; age: number; co: string; need: number; story: string };
  docs: Record<CycleDoc, { uploaded: boolean; verified: boolean }>;
  publishedAt?: string;
  reportSent?: boolean;
  /** سطور «سجلّ التدقيق» التي كتبتها الدورة: من فعل ماذا، ومتى */
  log: Array<{ at: string; who: string; what: string }>;
};

export const emptyCycle = (): Cycle => ({
  stage: "draft",
  child: { name: "", age: 9, co: "SN", need: 120, story: "" },
  docs: Object.fromEntries(
    CYCLE_DOCS.map((d) => [d, { uploaded: false, verified: false }]),
  ) as Cycle["docs"],
  log: [],
});

export function loadCycle(): Cycle {
  try {
    const raw = tryStore()?.getItem(CYCLE_KEY);
    if (!raw) return emptyCycle();
    const v = JSON.parse(raw) as Cycle;
    return v && v.child && v.docs ? { ...emptyCycle(), ...v } : emptyCycle();
  } catch {
    return emptyCycle();
  }
}

export function saveCycle(c: Cycle) {
  try {
    tryStore()?.setItem(CYCLE_KEY, JSON.stringify(c));
  } catch {
    /* محجوب: تكتمل الدورة في هذه الصفحة */
  }
  sync(c);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CYCLE_EVENT));
}

export const withLog = (c: Cycle, who: string, what: string, now = new Date()): Cycle => ({
  ...c,
  log: [{ at: now.toISOString(), who, what }, ...c.log].slice(0, 30),
});

export const allUploaded = (c: Cycle) => CYCLE_DOCS.every((d) => c.docs[d].uploaded);
export const allVerified = (c: Cycle) => CYCLE_DOCS.every((d) => c.docs[d].verified);

/** الملفّ كما يراه الدليل بعد النشر: طفلٌ في التجربة بمعرّفٍ ثابت. */
export function cycleChild(c: Cycle): TryChild | null {
  if (c.stage !== "published" || !c.child.name.trim()) return null;
  const region = tryPlace(c.child.co)?.regions[0]?.hall ?? `${c.child.co}-r1`;
  return {
    id: CYCLE_CHILD_ID,
    code: `DEMO-NEW-${c.child.co}`,
    name: c.child.name.trim(),
    country: countryName(c.child.co, "ar"),
    age: c.child.age,
    stage: "",
    need: c.child.need,
    funded: 0,
    waitingDays: 1,
    co: c.child.co,
    region,
    covers: c.child.story.trim() || "الدراسة والغذاء والرعاية الصحية",
  };
}

function sync(c: Cycle) {
  const child = cycleChild(c);
  TRY_CYCLE.splice(0, TRY_CYCLE.length, ...(child ? [child] : []));
}

// عند التحميل: ملفٌّ نُشر في هذه الجلسة يبقى ظاهراً في الدليل وصفحته ودعمه.
if (typeof window !== "undefined") {
  sync(loadCycle());
  // «ابدأ من جديد» يمحو المفتاح ويُطلق الحدث: تُعاد القراءة فيختفي الملفّ من الدليل.
  window.addEventListener(CYCLE_EVENT, () => sync(loadCycle()));
}
