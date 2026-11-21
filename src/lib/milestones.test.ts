import { describe, expect, it } from "vitest";

import { milestones, nextMilestone } from "./milestones";
import type { ImpactChild, MyImpact } from "./my-impact";

const child = (over: Partial<ImpactChild>): ImpactChild => ({
  id: "c",
  name: "س",
  months: 1,
  share: 0.5,
  covered: 0.5,
  active: true,
  since: 1,
  amount: 50,
  currency: "EUR",
  need: 100,
  ...over,
});
const impact = (children: ImpactChild[]): MyImpact => ({
  children,
  inCare: children.filter((c) => c.active).length,
  months: children.reduce((a, c) => a + c.months, 0),
  share: 0,
});
const done = (m: MyImpact) =>
  milestones(m)
    .filter((x) => x.done)
    .map((x) => x.key);

describe("محطّات الداعم", () => {
  it("بلا كفالة: لا محطّة، والقادمة هي الأولى", () => {
    expect(done(impact([]))).toEqual([]);
    expect(nextMilestone(milestones(impact([])))!.key).toBe("first");
  });

  it("تُمنح بما تحقّق فعلاً: الأشهر بأطول كفالة، والاكتمال لمن هو من كافليه", () => {
    expect(done(impact([child({ months: 4 })]))).toEqual(["first", "m3"]);
    expect(done(impact([child({ months: 1, covered: 1 })]))).toEqual(["first", "complete"]);
    // حاجةٌ اكتملت بعطاء غيره (حصّته صفر) لا تُحسب له
    expect(done(impact([child({ covered: 1, share: 0 })]))).toEqual(["first"]);
    expect(
      done(impact([child({ id: "a", months: 12, covered: 1 }), child({ id: "b", months: 2 })])),
    ).toEqual(["first", "complete", "m3", "two", "m6", "y1"]);
  });

  it("حين تتحقّق كلّها لا محطّة قادمة", () => {
    const all = impact([child({ id: "a", months: 12, covered: 1 }), child({ id: "b" })]);
    expect(nextMilestone(milestones(all))).toBeNull();
  });
});
