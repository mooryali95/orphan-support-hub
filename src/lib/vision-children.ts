/**
 * أطفال المجموعات في البيئة التجريبية — ملفاتٌ مستعارة تُشتقّ من حال المجموعة
 * في المحرّك، فتتحرّك معها: جلساتها، وقياسها، ومرحلتها.
 *
 * حدود العرض: اسمٌ مستعار بالحروف الأولى، وعمر، ورمز `DEMO-…` — لا صورة ولا
 * موقع ولا معرّفٌ يصلح لكفالةٍ أو دفع.
 */
import { type GroupState, isFunded, SESSIONS_PER_CYCLE } from "@/lib/vision-engine";

const AR = ["ب", "ن", "ع", "س", "م", "ر", "ي", "ك", "ح", "ف", "د", "ل", "أ", "ه", "ز", "ج"];
const EN = ["B", "N", "A", "S", "M", "R", "Y", "K", "H", "F", "D", "L", "E", "I", "Z", "J"];

export type Stage = "waiting" | "baseline" | "sessions" | "ready" | "measured";

export type DemoChild = {
  id: string;
  code: string;
  group: string;
  pseudonym: { ar: string; en: string };
  age: number;
  gender: "m" | "f";
  stage: Stage;
  sessions: number;
  before: number;
  after: number | null;
};

/** بذرةٌ ثابتة من نصّ: النتيجة نفسها في الخادم والمتصفّح. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function stageOf(g: GroupState): Stage {
  if (!isFunded(g)) return "waiting";
  if (g.after !== null) return "measured";
  if (g.sessionsDone >= SESSIONS_PER_CYCLE) return "ready";
  return g.sessionsDone === 0 ? "baseline" : "sessions";
}

export function childrenOf(g: GroupState): DemoChild[] {
  const stage = stageOf(g);
  return Array.from({ length: g.members }, (_, i) => {
    const h = hash(`${g.id}:${i}`);
    const a = h % AR.length;
    const b = (h >>> 5) % AR.length;
    const age = 8 + ((h >>> 10) % 8);
    const spread = (((h >>> 14) % 21) - 10) / 10; // ±1.0 حول متوسّط المجموعة
    const gain = (((h >>> 19) % 11) - 5) / 10; // ±0.5 حول ارتفاع المجموعة
    const before = +(g.before + spread).toFixed(1);
    return {
      id: `${g.id}-c${i + 1}`,
      code: `DEMO-${g.city.slice(0, 2).toUpperCase()}-${String((h % 9000) + 1000)}`,
      group: g.id,
      pseudonym: { ar: `«${AR[a]}. ${AR[b]}.»`, en: `“${EN[a]}. ${EN[b]}.”` },
      age,
      gender: (h >>> 24) % 2 ? "f" : "m",
      stage,
      sessions: g.sessionsDone,
      before,
      after: g.after === null ? null : +(before + (g.after - g.before) + gain).toFixed(1),
    };
  });
}
