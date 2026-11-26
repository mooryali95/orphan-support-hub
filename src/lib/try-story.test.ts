import { describe, expect, it } from "vitest";

import {
  storyCreate,
  storyFacts,
  storyHandOver,
  storySeed,
  storySettle,
  storyUpload,
} from "@/lib/try-verification";

/** القصّة الموجّهة على طبقة التحقق المحاكاة: من سجلّ الندوة إلى ملفٍّ حُسم بعينين. */
describe("قصّة الثقة", () => {
  it("تمرّ بالربط ثم الرصد ثم الحسم، وتُعاد من أوّلها", () => {
    storySeed();
    expect(storyFacts()).toMatchObject({ linked: false, flagged: false });

    storyCreate();
    expect(storyFacts()).toMatchObject({ linked: true, trust: "verified" });

    storyUpload();
    const flagged = storyFacts();
    expect(flagged).toMatchObject({ flagged: true, trust: "flagged", mine: true });
    expect(flagged.open).toBe(2);

    // المشرف الثاني يتسلّم: ما فُتح لم يعد منسوباً إليه
    storyHandOver(true);
    expect(storyFacts().mine).toBe(false);

    storySettle();
    expect(storyFacts()).toMatchObject({ settled: true, open: 0, trust: "verified" });

    storySeed();
    expect(storyFacts()).toMatchObject({ linked: false, flagged: false, settled: false });
  });
});
