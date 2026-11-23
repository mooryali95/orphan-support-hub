/**
 * قاعة الأثر وزرّ «رجوع» في المتصفّح: كلّ مرحلةٍ يتقدّم إليها الزائر داخل القاعة خطوةٌ في السجلّ،
 * فيعيده «رجوع» (ومفتاح Escape) مرحلةً واحدة، ومن أوّل مرحلةٍ يخرج إلى الصفحة التي جاء منها.
 *
 * خالصٌ ومختبَر: يحسب ما يُفعل بالسجلّ فقط. الصفحة (`routes/hall.lazy.tsx`) تنفّذه على سجلّ
 * المتصفّح، والمشهد ينفّذ الانتقال نفسه بدوالّه (`backToHall` و`backToWorld` و`backToCountry`).
 */

/** the stages the scene reports; the gate and the hall share the first history entry */
export type HallStage =
  "gate" | "hall" | "world" | "country" | "support" | "impactPending" | "impact" | "big";

/** a stage that owns a history entry: every one deeper than the hall itself */
export type HallStep = "world" | "country" | "support" | "impact" | "big";

const DEPTH: Record<"hall" | HallStep, number> = {
  hall: 0,
  world: 1,
  country: 2,
  support: 3,
  impact: 4,
  big: 5,
};
const isStep = (s: unknown): s is HallStep =>
  typeof s === "string" && s !== "hall" && Object.hasOwn(DEPTH, s);

/** what an entry of the hall carries in the browser's history state */
export type HallEntry = { hallDepth: number; hallStage: HallStep };

/** reads an entry back from `history.state`; anything else is the hall's first entry */
export function hallEntryOf(state: unknown): HallEntry | null {
  if (!state || typeof state !== "object") return null;
  const { hallDepth, hallStage } = state as Record<string, unknown>;
  return typeof hallDepth === "number" &&
    Number.isInteger(hallDepth) &&
    hallDepth > 0 &&
    isStep(hallStage)
    ? { hallDepth, hallStage }
    : null;
}

/** the stage the visitor stands on, for a stack of entries */
export const stageOf = (stack: readonly HallStep[]): "hall" | HallStep => stack.at(-1) ?? "hall";

/**
 * the scene moved to `stage` by itself (the visitor used the hall's own controls). Going deeper
 * adds one entry; going back with the hall's own buttons takes the entries above it away, so the
 * browser's Back never returns to a stage the visitor has already left.
 */
export function onStage(
  stack: readonly HallStep[],
  stage: HallStage,
): { stack: HallStep[]; pops: number; push: HallEntry | null } {
  const same = { stack: [...stack], pops: 0, push: null };
  if (stage === "gate" || stage === "impactPending" || stage === stageOf(stack)) return same;
  // entries are kept strictly deeper one after another: all that are not shallower than the new
  // stage go, except the stage itself when the visitor is returning to it
  const keep = stack.filter((s) => DEPTH[s] < DEPTH[stage]);
  if (stage !== "hall" && stack[keep.length] === stage) {
    return { stack: [...keep, stage], pops: stack.length - keep.length - 1, push: null };
  }
  const next = stage === "hall" ? keep : [...keep, stage];
  return {
    stack: next,
    pops: stack.length - keep.length,
    push: stage === "hall" ? null : { hallDepth: next.length, hallStage: stage },
  };
}

/** the stages the scene can open again when the visitor presses Forward, each from the one before */
const FORWARD: Partial<Record<"hall" | HallStep, HallStep>> = {
  hall: "world",
  world: "country",
  country: "support",
};

/**
 * the browser moved to an entry (Back, Forward or a jump). Back walks the scene to that entry's
 * stage; Forward reopens a stage the scene can reopen; anything else (an entry of an earlier
 * visit, a stage that needs a payment) is refused by moving `bounce` entries, back to where the
 * visitor stands.
 */
export function onPop(
  stack: readonly HallStep[],
  state: unknown,
): { stack: HallStep[]; goTo: "hall" | HallStep | null; bounce: number } {
  const entry = hallEntryOf(state);
  const depth = entry?.hallDepth ?? 0;
  if (depth === stack.length) return { stack: [...stack], goTo: null, bounce: 0 };
  if (depth < stack.length) {
    const next = stack.slice(0, depth);
    return { stack: next, goTo: stageOf(next), bounce: 0 };
  }
  if (entry && depth === stack.length + 1 && FORWARD[stageOf(stack)] === entry.hallStage) {
    return { stack: [...stack, entry.hallStage], goTo: entry.hallStage, bounce: 0 };
  }
  return { stack: [...stack], goTo: null, bounce: stack.length - depth };
}
