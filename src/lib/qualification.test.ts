import { describe, expect, it } from "vitest";

import { QUALIFICATION_JOURNEY, stageReached } from "./qualification.functions";
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
