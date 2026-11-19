import { describe, expect, it } from "vitest";

import { isTrial, showTrialLink, sponsorEntry } from "./platform";

describe("وضع المنصّة", () => {
  it("التجربة: «اكفل يتيماً» يقود إلى /try، ولا رابطٌ ثانٍ إليها", () => {
    expect(isTrial("trial")).toBe(true);
    expect(sponsorEntry("trial")).toBe("/try");
    expect(showTrialLink("trial", true)).toBe(false);
  });

  it("الحقيقي: الأزرار إلى الدليل، والتجربة رابطٌ هادئ إن أُبقيت", () => {
    expect(sponsorEntry("live")).toBe("/orphans");
    expect(showTrialLink("live", true)).toBe(true);
    expect(showTrialLink("live", false)).toBe(false);
  });
});
