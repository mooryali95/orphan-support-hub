import { describe, expect, it } from "vitest";

import { hallEntryHref, isTrial, showTrialLink, sponsorEntry } from "./platform";

describe("وضع المنصّة", () => {
  it("التجربة: «اكفل يتيماً» يقود إلى /try، ولا رابطٌ ثانٍ إليها", () => {
    expect(isTrial("trial", true)).toBe(true);
    expect(sponsorEntry("trial", true)).toBe("/try");
    expect(showTrialLink("trial", true, true)).toBe(false);
    expect(hallEntryHref(true)).toBe("/hall?try=1");
  });

  it("الحقيقي: الأزرار إلى الدليل، والتجربة رابطٌ هادئ إن أُبقيت", () => {
    expect(sponsorEntry("live", true)).toBe("/orphans");
    expect(showTrialLink("live", true, true)).toBe(true);
    expect(showTrialLink("live", false, true)).toBe(false);
  });

  it("بعد حذف التجربة: لا رابط إليها ولو بقي الوضع trial", () => {
    expect(isTrial("trial", false)).toBe(false);
    expect(sponsorEntry("trial", false)).toBe("/orphans");
    expect(showTrialLink("live", true, false)).toBe(false);
    expect(hallEntryHref(false)).toBe("/hall");
  });
});
