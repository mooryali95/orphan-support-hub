import { describe, expect, it } from "vitest";

import { impactAt, impactSpan, monthsBetween, myImpact } from "./my-impact";
import type { MySponsorship } from "./sponsorships.functions";

const now = new Date("2026-11-18T00:00:00Z");
const base: MySponsorship = {
  id: "s1",
  amount: 60,
  currency: "EUR",
  type: "monthly",
  status: "active",
  created_at: "2026-01-10T00:00:00Z",
  started_at: "2026-02-15T00:00:00Z",
  ended_at: null,
  end_reason: null,
  cancel_effective_at: null,
  paused_until: null,
  provider_subscription_id: null,
  orphan: { id: "o1", display_name: "سارة", code: "K-1", monthly_need: 120, funded_monthly: 90 },
};

describe("أثري", () => {
  it("يعدّ الأشهر الكاملة منذ البدء، ولا يسالب", () => {
    expect(monthsBetween("2026-02-15T00:00:00Z", now)).toBe(9);
    expect(monthsBetween(null, now)).toBe(0);
    expect(monthsBetween("2027-01-01T00:00:00Z", now)).toBe(0);
  });

  it("حصّتك من الحاجة، وما غطّاه الجميع", () => {
    const m = myImpact([base], now);
    expect(m.inCare).toBe(1);
    expect(m.children[0]).toMatchObject({ months: 9, share: 0.5, covered: 0.75, active: true });
    expect(m.share).toBe(0.5);
  });

  it("المنتظرة للدفع لا تُحسب، والمنتهية تُحسب أشهرها حتى نهايتها لا رعايةً جارية", () => {
    const m = myImpact(
      [
        { ...base, id: "p", status: "pending_payment" },
        { ...base, id: "e", status: "completed", ended_at: "2026-05-15T00:00:00Z" },
      ],
      now,
    );
    expect(m.children.map((c) => c.id)).toEqual(["e"]);
    expect(m.inCare).toBe(0);
    expect(m.months).toBe(2);
  });

  it("الدعم لمرة واحدة شهرٌ واحد بلا حصّة شهرية، والحصّة لا تتجاوز الكلّ", () => {
    const m = myImpact(
      [
        { ...base, id: "o", type: "one_time" },
        { ...base, id: "x", amount: 500 },
      ],
      now,
    );
    expect(m.children.find((c) => c.id === "o")).toMatchObject({ months: 1, share: 0 });
    expect(m.children.find((c) => c.id === "x")!.share).toBe(1);
  });

  it("لا يقرأ من الطفل إلا بطاقة الكفالة المسموح بها", () => {
    const keys = Object.keys(myImpact([base], now).children[0]!).sort();
    expect(keys).toEqual(
      [
        "active",
        "amount",
        "covered",
        "currency",
        "id",
        "months",
        "name",
        "need",
        "share",
        "since",
      ].sort(),
    );
    // `need` is the card's own monthly_need, nothing new is read from the child
    expect(myImpact([base], now).children[0]!.need).toBe(120);
  });

  it("شريط الزمن: قبل أشهرٍ يظهر ما بدأ وقتها فقط، بأشهره حتى وقتها", () => {
    const m = myImpact(
      [base, { ...base, id: "s2", started_at: "2026-08-20T00:00:00Z", amount: 30 }],
      now,
    );
    expect(impactSpan(m)).toBe(9);
    expect(impactAt(m, 0)).toBe(m);
    const back = impactAt(m, 5);
    expect(back.inCare).toBe(1);
    expect(back.children[0]).toMatchObject({ id: "s1", months: 4 });
    expect(impactAt(m, 9).children).toEqual([]);
  });
});
