import { describe, expect, it } from "vitest";

import { compareAssessments, QUALIFICATION_JOURNEY, stageReached } from "./qualification.functions";
import type { QualificationStage } from "@/integrations/supabase/types.extra";

describe("رحلة بناء الأهلية", () => {
  it("المحطّات ست بترتيب المنهجية", () => {
    expect(QUALIFICATION_JOURNEY.map((s) => s.stage)).toEqual([
      "concept",
      "trait",
      "system",
      "actions",
      "measurement",
      "qualified",
    ]);
  });

  it("المحطّة الحالية مبلوغة، وما قبلها مبلوغ", () => {
    expect(stageReached("actions", "concept")).toBe(true);
    expect(stageReached("actions", "system")).toBe(true);
    expect(stageReached("actions", "actions")).toBe(true);
  });

  it("وما بعدها ليس مبلوغاً — فالقياس لا يسبق الأفعال", () => {
    expect(stageReached("actions", "measurement")).toBe(false);
    expect(stageReached("actions", "qualified")).toBe(false);
  });

  it("البداية لا تبلغ إلا نفسها", () => {
    const rest = QUALIFICATION_JOURNEY.slice(1).map((s) => s.stage);
    expect(stageReached("concept", "concept")).toBe(true);
    for (const s of rest) expect(stageReached("concept", s)).toBe(false);
  });

  it("والأهلية تبلغ كل ما قبلها", () => {
    for (const step of QUALIFICATION_JOURNEY) {
      expect(stageReached("qualified", step.stage)).toBe(true);
    }
  });

  it("الترتيب متعدٍّ: لا محطّة تسبق نفسها", () => {
    const order = QUALIFICATION_JOURNEY.map((s) => s.stage as QualificationStage);
    for (let i = 0; i < order.length; i += 1) {
      for (let j = 0; j < order.length; j += 1) {
        expect(stageReached(order[i]!, order[j]!)).toBe(i >= j);
      }
    }
  });
});

describe("مقياس ما قبل البرنامج وبعده", () => {
  const at = (d: string) => `2026-0${d}-01T00:00:00Z`;

  const base = {
    phase: "baseline" as const,
    scores: { dirayah: 35, himmah: 30, azm: 20, tadbir: 15 },
    core_trait: null,
    below_threshold: true,
    assessed_at: at("1"),
  };
  const final = {
    phase: "final" as const,
    scores: { dirayah: 55, himmah: 23, azm: 12, tadbir: 10 },
    core_trait: "الدراية",
    below_threshold: false,
    assessed_at: at("6"),
  };

  it("بلا قياسٍ أوّليّ لا مقارنة — والفراغ أصدق من جدولٍ نصفه فارغ", () => {
    expect(compareAssessments([final])).toBeNull();
  });

  it("وبلا قياسٍ ثانٍ كذلك", () => {
    expect(compareAssessments([base])).toBeNull();
  });

  it("يرصد استقرار البناء حول سمة قائدة — وهو الدالّ لا الأرقام", () => {
    const c = compareAssessments([base, final])!;
    expect(c.settled).toBe(true);
    expect(c.unsettled).toBe(false);
    expect(c.topBefore).toBe(35);
    expect(c.topAfter).toBe(55);
  });

  it("ويرصد فقدانه ولا يُخفيه", () => {
    const c = compareAssessments([
      {
        ...base,
        core_trait: "الدراية",
        below_threshold: false,
        scores: { dirayah: 52, himmah: 48 },
      },
      { ...final, core_trait: null, below_threshold: true, scores: { dirayah: 40, himmah: 60 } },
    ])!;
    expect(c.unsettled).toBe(true);
    expect(c.settled).toBe(false);
  });

  it("الانخفاض إعادةُ توزيعٍ لا تراجع: مجموع الفروق صفر", () => {
    const c = compareAssessments([base, final])!;
    expect(c.deltas.reduce((s, d) => s + d.shift, 0)).toBe(0);
    expect(c.deltas.find((d) => d.slug === "himmah")!.shift).toBe(-7);
    expect(c.deltas.find((d) => d.slug === "dirayah")!.shift).toBe(20);
  });

  it("الختامي أولى بالمقارنة من مرحليٍّ بعده — فهو حصيلة البرنامج", () => {
    const progress = {
      ...final,
      phase: "progress" as const,
      assessed_at: at("8"),
      scores: { dirayah: 51, himmah: 49 },
    };
    const c = compareAssessments([base, progress, final])!;
    expect(c.after.phase).toBe("final");
    expect(c.topAfter).toBe(55);
  });

  it("وبلا ختاميٍّ يُقارَن بآخر مرحليّ", () => {
    const progress = { ...final, phase: "progress" as const, assessed_at: at("4") };
    const c = compareAssessments([base, progress])!;
    expect(c.after.phase).toBe("progress");
  });

  it("سمةٌ غابت عن إحدى الخريطتين تُحسب صفراً لا تُسقَط", () => {
    const c = compareAssessments([
      { ...base, scores: { dirayah: 100 } },
      { ...final, scores: { dirayah: 60, rushd: 40 } },
    ])!;
    expect(c.deltas.find((d) => d.slug === "rushd")).toEqual({
      slug: "rushd",
      before: 0,
      after: 40,
      shift: 40,
    });
  });
});
