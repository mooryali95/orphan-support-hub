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

/* ── الأثر: السمات الستّ ومستويات النموّ ─────────────────────────── */

/** مستويات السمة على مقياسٍ من 25 (عتباتٌ توضيحية تُضبط مع منهج الرواد): البداية ← نامٍ ← متمكّن ← متميّز. */
export type Level = "start" | "growing" | "capable" | "distinct";
export const LEVELS: Level[] = ["start", "growing", "capable", "distinct"];
export function levelOf(score: number): Level {
  if (score >= 19) return "distinct";
  if (score >= 17.5) return "capable";
  if (score >= 16) return "growing";
  return "start";
}

export type TraitScore = { key: string; before: number; after: number | null };

/**
 * سماتُ الطفل الستّ: متوسّط كلّ سمةٍ في التشغيل (TRAITS) مُزاحاً بانحراف
 * الطفل عن مجموعته، والارتفاع بنسبة ارتفاعه هو — فتتّسق مع رقمه الواحد.
 */
export function traitsOf(
  child: DemoChild,
  base: ReadonlyArray<{ key: string; before: number; after: number }>,
): TraitScore[] {
  const h = hash(child.id);
  const ratio = child.after === null ? 0 : (child.after - child.before) / 2;
  return base.map((t, i) => {
    const jitter = (((h >>> (i * 3)) % 9) - 4) / 10;
    const before = +(t.before + (child.before - 17) * 0.6 + jitter).toFixed(1);
    const after =
      child.after === null ? null : +(before + Math.max(0, t.after - t.before) * ratio).toFixed(1);
    return { key: t.key, before, after };
  });
}

/** متوسّط سمات الطفل قبل وبعد، ومستواه في كلٍّ منهما. */
export function growthOf(scores: TraitScore[]) {
  const avg = (xs: number[]) => +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
  const before = avg(scores.map((s) => s.before));
  const after = scores.every((s) => s.after !== null) ? avg(scores.map((s) => s.after!)) : null;
  return {
    before,
    after,
    from: levelOf(before),
    to: after === null ? null : levelOf(after),
    leveledUp: after !== null && LEVELS.indexOf(levelOf(after)) > LEVELS.indexOf(levelOf(before)),
  };
}

/** السمات «الآن»: بعد القياس (إن وُجد) مضافاً إليها أثر الكفالة والدعم العيني. */
export function nowTraits(
  scores: TraitScore[],
  boosts: Record<string, number> | undefined,
): Array<TraitScore & { now: number; lift: number }> {
  return scores.map((t) => {
    const lift = boosts?.[t.key] ?? 0;
    return { ...t, lift, now: +((t.after ?? t.before) + lift).toFixed(1) };
  });
}
