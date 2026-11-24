import { describe, expect, it } from "vitest";
import { arCount, arNoun, FILES, SESSIONS } from "./plural";

describe("الجمع العربي", () => {
  it.each([
    [0, "لا ملفات"],
    [1, "ملفّ واحد"],
    [2, "ملفان"],
    [3, "3 ملفات"],
    [10, "10 ملفات"],
    [11, "11 ملفاً"],
    [99, "99 ملفاً"],
    [100, "100 ملفّ"],
    [103, "103 ملفات"],
  ])("%i", (n, want) => expect(arCount(n, FILES)).toBe(want));

  it("المعدود وحده", () => {
    expect(arNoun(12, SESSIONS)).toBe("جلسة");
    expect(arNoun(7, SESSIONS)).toBe("جلسات");
  });
});
