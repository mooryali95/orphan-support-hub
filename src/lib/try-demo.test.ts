import { describe, expect, it } from "vitest";

import { byCode, regionsFor } from "./hall/model";
import { myImpact } from "./my-impact";
import {
  addGift,
  cleanPaid,
  cleanDedication,
  coverageAfter,
  giftsAsSponsorships,
  loadGifts,
  tryPayOptions,
  localTryChild,
  monthStory,
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

  it("عطاءٌ بعملةٍ أخرى: المقيَّد بعملة الملف، وما دُفع بسعره وتاريخه", () => {
    const s = mem();
    const paid = {
      amount: 54,
      currency: "USD",
      rate: 1 / 1.08,
      asOf: "2026-11-21",
      indicative: true,
    };
    addGift({ childId: "try-01", amount: 50, cadence: "monthly", paid }, s, now);
    const [g] = loadGifts(s);
    expect(g!.amount).toBe(50);
    expect(g!.paid).toEqual(paid);
    // «أثري» reads the credited amount in the file currency, whatever was paid
    expect(giftsAsSponsorships(loadGifts(s))[0]).toMatchObject({ amount: 50, currency: "EUR" });
    // a malformed or same-currency record is dropped, never guessed
    expect(cleanPaid({ ...paid, currency: "EUR" })).toBeUndefined();
    expect(cleanPaid({ ...paid, rate: 0 })).toBeUndefined();
    expect(cleanPaid({ ...paid, asOf: "today" })).toBeUndefined();
    expect(cleanPaid("54 USD")).toBeUndefined();
  });

  it("عملات الدفع: عملة الملف ثم عملة بلد الطفل أو الموحّدة", () => {
    expect(tryPayOptions({ co: "AL" }).options.map((o) => [o.currency, o.kind])).toEqual([
      ["EUR", "operating"],
      ["USD", "unified"],
    ]);
    expect(tryPayOptions({ co: "KE" }).options.map((o) => [o.currency, o.kind])).toEqual([
      ["EUR", "need"],
      ["USD", "operating"],
    ]);
  });

  it("يتجاهل ما ليس طفلاً من التجربة أو التخزين التالف", () => {
    const s = mem();
    s.setItem("try-demo:v1", JSON.stringify([{ childId: "real-uuid", amount: 10 }]));
    expect(loadGifts(s)).toEqual([]);
    s.setItem("try-demo:v1", "{bad");
    expect(loadGifts(s)).toEqual([]);
  });

  it("تُقرأ في «أثري» بالمنطق نفسه: تبدأ يوم العطاء، وتُعدّ أشهرها حين تمرّ", () => {
    const s = mem();
    addGift({ childId: "try-01", amount: 80, cadence: "monthly" }, s, now);
    addGift({ childId: "try-03", amount: 50, cadence: "one_time" }, s, now);
    const list = giftsAsSponsorships(loadGifts(s));
    const m = myImpact(list, now);
    expect(m.inCare).toBe(2);
    const sara = m.children.find((c) => c.name === "سارة")!;
    expect(sara.share).toBeCloseTo(80 / 120);
    expect(sara.covered).toBe(1);
    expect(sara.months).toBe(0); // لا أشهر تُدّعى قبل أن تمرّ
    expect(m.children.find((c) => c.name === "مريم")).toMatchObject({ months: 1, share: 0 });
    // «قدّم شهراً»: بعد أربعة أشهر تُقرأ أربعة
    const later = new Date("2027-03-20T00:00:00Z");
    expect(myImpact(list, later).children.find((c) => c.name === "سارة")!.months).toBe(4);
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

  it("الإهداء يُحفظ كما كُتب، قصيراً وسطراً واحداً، والفارغ لا يُحفظ", () => {
    const s = mem();
    addGift(
      { childId: "try-01", amount: 80, cadence: "monthly", dedication: "  والدي \n رحمه الله " },
      s,
      now,
    );
    addGift({ childId: "try-02", amount: 30, cadence: "monthly", dedication: "   " }, s, now);
    const [second, first] = loadGifts(s);
    expect(first!.dedication).toBe("والدي رحمه الله");
    expect(second).not.toHaveProperty("dedication");
    expect(cleanDedication("x".repeat(90))).toHaveLength(40);
    expect(cleanDedication(7)).toBeUndefined();
  });

  it("التغطية بعد العطاء: الشهرية ترفعها حتى الاكتمال، والمرّة الواحدة لا تغيّرها", () => {
    const sara = TRY_CHILDREN[0]!; // need 120, funded 40
    expect(coverageAfter(sara, 0, "monthly")).toBe(33);
    expect(coverageAfter(sara, 40, "monthly")).toBe(67);
    expect(coverageAfter(sara, 500, "monthly")).toBe(100);
    expect(coverageAfter(sara, 80, "one_time")).toBe(33);
  });

  it("نصوص الطفل تتبع لغة الواجهة، والعربية هي البيانات نفسها بلا تغيير", () => {
    for (const c of TRY_CHILDREN) {
      expect(localTryChild(c, "ar")).toBe(c);
      const en = localTryChild(c, "en");
      expect({ id: en.id, code: en.code, need: en.need, co: en.co }).toEqual({
        id: c.id,
        code: c.code,
        need: c.need,
        co: c.co,
      });
      for (const v of [en.name, en.country, en.stage, en.covers])
        expect(v).not.toMatch(/[\u0600-\u06FF]/);
    }
    const sara = TRY_CHILDREN[0]!;
    expect(monthStory(sara, 80, 1).map((s) => s.title)).toEqual([
      "حُوِّل عطاؤك",
      "سُلِّم لـسارة",
      "كلمة المشرف",
    ]);
    const story = monthStory(localTryChild(sara, "en"), 80, 7, "en");
    expect(story[1]!.title).toBe("Delivered to Sara");
    expect(story[0]!.text).toContain("80");
    expect(story.map((s) => s.title + s.text).join("")).not.toMatch(/[\u0600-\u06FF]/);
  });
});
