import { describe, expect, it } from "vitest";

import { WAMY_COUNTRIES } from "./wamy-network";
import { WAMY_PRESENCE } from "./wamy-presence";

describe("الحضور الخفيف", () => {
  it("مطابقٌ لملفّ البحث — شغّل npx tsx scripts/gen-wamy-presence.mjs بعد تعديله", () => {
    expect(WAMY_PRESENCE).toEqual(
      WAMY_COUNTRIES.map((c) => ({ code: c.code, nameAr: c.nameAr, presence: c.presence })),
    );
  });
});
