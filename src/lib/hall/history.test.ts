/**
 * «رجوع» في القاعة: كلّ مرحلةٍ خطوة في السجلّ، والرجوع مرحلةً مرحلة، ومن أوّلها خروج.
 */
import { describe, expect, it } from "vitest";

import { hallEntryOf, onPop, onStage, stageOf, type HallStage, type HallStep } from "./history";

/** a browser history of the hall: the entry the visitor arrived on, then the hall's own */
function browser() {
  let stack: HallStep[] = [];
  const entries: unknown[] = ["origin", null];
  let at = 1;
  const went: string[] = [];
  return {
    /** the scene reports a stage the visitor reached with the hall's own controls */
    stage(s: HallStage) {
      const r = onStage(stack, s);
      at -= r.pops;
      if (r.push) {
        entries.length = at + 1;
        entries.push(r.push);
        at++;
      }
      stack = r.stack;
    },
    /** the visitor presses Back (-1) or Forward (+1): where the scene is told to go */
    go(by: number) {
      at += by;
      if (at < 1) return "left";
      const r = onPop(stack, entries[at]);
      stack = r.stack;
      at += r.bounce;
      if (r.goTo) went.push(r.goTo);
      return r.goTo;
    },
    get stack() {
      return stack;
    },
    get length() {
      return entries.length;
    },
    went,
  };
}

describe("كلّ مرحلةٍ خطوة، والرجوع مرحلةً مرحلة", () => {
  it("من أعمق مرحلة: الأثر ← الدعم ← الدولة ← العالم ← القاعة، ثم خروج", () => {
    const b = browser();
    for (const s of ["hall", "world", "country", "support", "impactPending", "impact", "big"]) {
      b.stage(s as HallStage);
    }
    expect(b.stack).toEqual(["world", "country", "support", "impact", "big"]);
    expect([b.go(-1), b.go(-1), b.go(-1), b.go(-1), b.go(-1)]).toEqual([
      "impact",
      "support",
      "country",
      "world",
      "hall",
    ]);
    expect(b.stack).toEqual([]);
    expect(b.go(-1)).toBe("left");
  });

  it("البوّابة والقاعة لا تضيفان خطوة: الرجوع منهما يخرج", () => {
    const b = browser();
    b.stage("gate");
    b.stage("hall");
    expect(b.length).toBe(2);
    expect(b.go(-1)).toBe("left");
  });

  it("ما يبلّغه المشهد بعد رجوع المتصفّح لا يضيف خطوة ولا يدور", () => {
    const b = browser();
    b.stage("world");
    b.stage("country");
    expect(b.go(-1)).toBe("world");
    const before = b.length;
    b.stage("world"); // the scene arrived where Back sent it
    expect(b.length).toBe(before);
    expect(b.stack).toEqual(["world"]);
  });

  it("أزرار القاعة نفسها تزيل ما فوقها: «دولة أخرى» ثم رجوع يعيد إلى القاعة", () => {
    const b = browser();
    for (const s of ["world", "country", "support"] as const) b.stage(s);
    b.stage("world"); // «دولة أخرى»
    expect(b.stack).toEqual(["world"]);
    expect(b.go(-1)).toBe("hall");
    const c = browser();
    for (const s of ["world", "country", "support", "impact", "big"] as const) c.stage(s);
    c.stage("support"); // «دعمٌ آخر» من الخلاصة
    expect(c.stack).toEqual(["world", "country", "support"]);
    c.stage("hall"); // «عودة إلى القاعة»
    expect(c.stack).toEqual([]);
    expect(c.go(-1)).toBe("left");
  });

  it("الدخول إلى دولةٍ من القاعة مباشرةً (?c=): رجوعٌ واحد إلى القاعة، ثم «دولة أخرى» تستبدل", () => {
    const b = browser();
    b.stage("country");
    expect(b.stack).toEqual(["country"]);
    b.stage("world");
    expect(b.stack).toEqual(["world"]);
    expect(b.go(-1)).toBe("hall");
  });

  it("«تقدّم» يعيد فتح ما يستطيع المشهد فتحه، ويُرفض ما يحتاج دفعاً أو زيارةً سابقة", () => {
    const b = browser();
    for (const s of ["world", "country", "support", "impact"] as const) b.stage(s);
    b.go(-1);
    b.go(-1);
    expect(b.stack).toEqual(["world", "country"]);
    expect(b.go(1)).toBe("support");
    expect(b.go(1)).toBeNull(); // the impact stage needs a recorded support
    expect(b.stack).toEqual(["world", "country", "support"]);
    // an entry left by an earlier visit (after a reload) is refused the same way
    expect(onPop([], { hallDepth: 3, hallStage: "support" })).toEqual({
      stack: [],
      goTo: null,
      bounce: -3,
    });
  });

  it("حالة السجلّ تُقرأ بحذر: ما ليس خطوةً للقاعة هو مدخلها الأوّل", () => {
    expect(hallEntryOf({ hallDepth: 2, hallStage: "country" })).toEqual({
      hallDepth: 2,
      hallStage: "country",
    });
    for (const bad of [null, 1, {}, { hallDepth: 0, hallStage: "world" }, { hallDepth: 1 }]) {
      expect(hallEntryOf(bad)).toBeNull();
    }
    expect(hallEntryOf({ hallDepth: 1, hallStage: "hall" })).toBeNull();
    expect(stageOf([])).toBe("hall");
  });
});
