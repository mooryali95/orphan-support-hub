import { describe, expect, it } from "vitest";

import { byCode, regionsFor } from "./hall/model";
import { myImpact } from "./my-impact";
import {
  addGift,
  giftsAsSponsorships,
  loadGifts,
  resetGifts,
  TRY_CHILDREN,
  tryChildrenByWait,
} from "./try-demo";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
const now = new Date("2026-11-18T00:00:00Z");

describe("وضع التجربة", () => {
  it("أطفالٌ افتراضيون برموز DEMO- لا تشبه معرّفات الدفع", () => {
    for (const c of TRY_CHILDREN) {
      expect(c.code.startsWith("DEMO-")).toBe(true);
      expect(c.id).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/); // never a database uuid
    }
    expect(tryChildrenByWait()[0]!.waitingDays).toBeGreaterThanOrEqual(
      tryChildrenByWait().at(-1)!.waitingDays,
    );
  });

  it("الكفالة المحاكاة تُحفظ وتُقرأ وتُمحى", () => {
    const s = mem();
    addGift({ childId: "try-01", amount: 80, cadence: "monthly" }, s, now);
    addGift({ childId: "try-02", amount: 30, cadence: "one_time" }, s, now);
    expect(loadGifts(s).map((g) => g.childId)).toEqual(["try-02", "try-01"]);
    resetGifts(s);
    expect(loadGifts(s)).toEqual([]);
  });

  it("يتجاهل ما ليس طفلاً من التجربة أو التخزين التالف", () => {
    const s = mem();
    s.setItem("try-demo:v1", JSON.stringify([{ childId: "real-uuid", amount: 10 }]));
    expect(loadGifts(s)).toEqual([]);
    s.setItem("try-demo:v1", "{bad");
    expect(loadGifts(s)).toEqual([]);
  });

  it("تُقرأ في «أثري» بالمنطق نفسه: الشهرية حصّةٌ وأشهر، والمرّة الواحدة شهر", () => {
    const s = mem();
    addGift({ childId: "try-01", amount: 80, cadence: "monthly" }, s, now);
    addGift({ childId: "try-03", amount: 50, cadence: "one_time" }, s, now);
    const m = myImpact(giftsAsSponsorships(loadGifts(s), now), now);
    expect(m.inCare).toBe(2);
    const sara = m.children.find((c) => c.name === "سارة")!;
    expect(sara.share).toBeCloseTo(80 / 120);
    expect(sara.covered).toBe(1);
    expect(sara.months).toBeGreaterThanOrEqual(3);
    expect(m.children.find((c) => c.name === "مريم")).toMatchObject({ months: 1, share: 0 });
  });

  it("كلّ طفلٍ في التجربة يقف في دولةٍ ومنطقةٍ موجودتين في القاعة", () => {
    for (const c of TRY_CHILDREN) {
      const co = byCode(c.co);
      expect(co, c.co).toBeTruthy();
      expect(
        regionsFor(co!).some((r) => r.id === c.region),
        `${c.co} ${c.region}`,
      ).toBe(true);
    }
  });
});
