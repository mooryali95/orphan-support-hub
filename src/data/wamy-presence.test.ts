import { describe, expect, it } from "vitest";

import { WAMY_COUNTRIES, WAMY_NEED } from "./wamy-network";
import { WAMY_PRESENCE } from "./wamy-presence";

// الحضور مصدره الوحيد wamy-presence.ts (يدوي)، والحاجة والسياق في WAMY_NEED.
describe("الحضور مصدرٌ واحد", () => {
  const codes = WAMY_PRESENCE.map((c) => c.code);

  it("الرموز فريدة", () => {
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("كلّ مؤشّرات حاجةٍ لدولةٍ في الحضور", () => {
    expect(Object.keys(WAMY_NEED).filter((c) => !codes.includes(c))).toEqual([]);
  });

  it("قائمة الدول تأخذ الحضور نفسه بالترتيب نفسه ولا تنسخه", () => {
    expect(WAMY_COUNTRIES.map((c) => c.code)).toEqual(codes);
    WAMY_COUNTRIES.forEach((c, i) => {
      expect(c.presence).toBe(WAMY_PRESENCE[i]!.presence);
      expect(c.nameAr).toBe(WAMY_PRESENCE[i]!.nameAr);
    });
  });
});
