import { describe, expect, it } from "vitest";
import { shouldWarm } from "./idle-warm";

describe("hall background warm-up", () => {
  it("warms on a normal connection", () =>
    expect(shouldWarm({ effectiveType: "4g" }, true)).toBe(true));
  it("skips when the visitor saves data", () =>
    expect(shouldWarm({ saveData: true }, true)).toBe(false));
  it("skips on 2g", () => expect(shouldWarm({ effectiveType: "slow-2g" }, true)).toBe(false));
  it("skips on 3g", () => expect(shouldWarm({ effectiveType: "3g" }, true)).toBe(false));
  it("skips on phone-sized screens", () =>
    expect(shouldWarm({ effectiveType: "4g" }, true, true)).toBe(false));
  it("skips without WebGL 2", () => expect(shouldWarm(undefined, false)).toBe(false));
});
