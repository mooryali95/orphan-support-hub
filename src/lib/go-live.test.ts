import { describe, expect, it } from "vitest";

import { goLiveSteps, readyToGoLive } from "./go-live";

describe("جاهزية الاعتماد", () => {
  it("لا جاهزية بلا ملفّاتٍ منشورة، ولو رُبطت المنصّة والدفع", () => {
    const s = goLiveSteps({ published: 0, linked: 2, payments: true });
    expect(s.find((x) => x.key === "children")!.done).toBe(false);
    expect(readyToGoLive(s)).toBe(false);
  });

  it("تعذّر التحقّق من الدفع ليس «جاهزاً»", () => {
    expect(readyToGoLive(goLiveSteps({ published: 3, linked: 1, payments: null }))).toBe(false);
  });

  it("جاهزةٌ حين تتحقّق الشروط الثلاثة", () => {
    expect(readyToGoLive(goLiveSteps({ published: 3, linked: 1, payments: true }))).toBe(true);
  });
});
