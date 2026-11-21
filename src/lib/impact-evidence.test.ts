import { describe, expect, it } from "vitest";

import {
  addMonths,
  evidenceFromLedger,
  evidenceTotals,
  impactMoments,
  monthLabel,
  sortEvidence,
  type EvidenceMonth,
} from "./impact-evidence";
import type { LedgerMonth, SponsorshipLedger } from "./ledger.functions";
import { childStanding, myImpact } from "./my-impact";
import { giftsAsSponsorships, type TryGift } from "./try-demo";
import { tryEvidence } from "./try-evidence";

const month = (over: Partial<LedgerMonth>): LedgerMonth => ({
  month: "2026-09-01",
  upcoming: false,
  due: 60,
  paid: 60,
  payment_status: "paid",
  delivery_status: "delivered",
  delivered_at: "2026-09-20T00:00:00Z",
  receipt: "a1b2c3",
  ...over,
});
const ledger = (months: LedgerMonth[]): SponsorshipLedger => ({
  sponsorship: {
    id: "s1",
    amount: 60,
    currency: "EUR",
    status: "active",
    type: "monthly",
    started_at: "2026-09-01T00:00:00Z",
    next_charge_at: null,
    is_anonymous: false,
    message: null,
    message_status: "none",
    created_at: "2026-09-01T00:00:00Z",
  },
  orphan: { id: "o1", code: "K-1", display_name: "سارة", country: null, age_band: "6-9" },
  months,
  totals: { paid: 0, months_paid: 0, months_delivered: 0 },
});

describe("سجلّ الأثر الموثّق", () => {
  it("يقرأ سلسلة الشهر من القيد: دُفع، حُوِّل، سُلِّم", () => {
    const rows = evidenceFromLedger(
      ledger([
        month({}),
        month({ month: "2026-10-01", delivery_status: "transferred", delivered_at: null }),
        month({ month: "2026-11-01", delivery_status: "scheduled", delivered_at: null }),
        month({
          month: "2026-12-01",
          upcoming: true,
          paid: 0,
          payment_status: null,
          delivery_status: null,
          delivered_at: null,
          receipt: null,
        }),
        month({
          month: "2027-01-01",
          paid: 0,
          payment_status: "failed",
          delivery_status: null,
          delivered_at: null,
        }),
      ]),
    );
    expect(rows.map((r) => r.reached)).toEqual([3, 2, 1, 0, 0]);
    expect(rows[0]).toMatchObject({
      month: "2026-09",
      child: "سارة",
      receipt: "a1b2c3",
      sponsorshipId: "s1",
    });
    expect(rows[3]).toMatchObject({ upcoming: true, amount: 60 });
    expect(rows[4]!.issue).toBe(true);
  });

  it("المجاميع ممّا قُيّد وحده: لا يُعدّ القادم ولا المتعثّر، ولا تُجمع عملتان", () => {
    const rows: EvidenceMonth[] = [
      ...evidenceFromLedger(
        ledger([
          month({}),
          month({ month: "2026-10-01", delivery_status: "transferred" }),
          month({ month: "2026-11-01", upcoming: true, paid: 0, delivery_status: null }),
          month({ month: "2026-12-01", paid: 0, payment_status: "failed", delivery_status: null }),
        ]),
      ),
      {
        id: "x",
        month: "2026-10",
        child: "Y",
        amount: 25,
        currency: "USD",
        reached: 3,
        upcoming: false,
        note: "n",
      },
    ];
    expect(evidenceTotals(rows)).toEqual({
      delivered: 2,
      paid: 3,
      reports: 1,
      given: [
        { currency: "EUR", amount: 120 },
        { currency: "USD", amount: 25 },
      ],
    });
    expect(evidenceTotals([])).toEqual({ delivered: 0, paid: 0, reports: 0, given: [] });
  });

  it("الأحدث أولاً", () => {
    const rows = evidenceFromLedger(ledger([month({}), month({ month: "2026-11-01" })]));
    expect(sortEvidence(rows).map((r) => r.month)).toEqual(["2026-11", "2026-09"]);
  });

  it("الأشهر تعبر السنة، واسم الشهر بأرقام لاتينية", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-11", 0)).toBe("2026-11");
    expect(monthLabel("2026-11", "en")).toBe("November 2026");
    expect(monthLabel("2026-11", "ar")).toMatch(/2026/);
    expect(monthLabel("2026-11", "ar")).not.toMatch(/[٠-٩]/);
  });
});

describe("سجلّ التجربة ولحظات الأثر", () => {
  const gift: TryGift = {
    id: "g1",
    childId: "try-01",
    amount: 80,
    cadence: "monthly",
    at: "2026-11-21T10:00:00Z",
  };
  const at = (ahead: number) =>
    new Date(Date.parse(gift.at) + ahead * 30.44 * 86_400_000 + 3_600_000);

  it("اليوم: دفعةٌ مقيّدة فقط، ولا تسليم يُدَّعى قبل أن يمضي شهره", () => {
    const rows = tryEvidence([gift], 0, "en");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reached: 1,
      receipt: null,
      note: null,
      month: "2026-11",
      child: "Sara",
    });
    expect(evidenceTotals(rows)).toMatchObject({ delivered: 0, paid: 1, reports: 0 });
  });

  it("بعد n أشهر: n شهراً مسلَّماً بمرجع DEMO- وسطر تقرير، والجاري ينتظر", () => {
    const rows = tryEvidence([gift], 3, "en");
    expect(rows.map((r) => r.reached)).toEqual([3, 3, 3, 1]);
    expect(rows[0]!.receipt).toBe("DEMO-TRY-01-2026-11");
    expect(rows.slice(0, 3).every((r) => r.receipt!.startsWith("DEMO-") && r.note)).toBe(true);
    expect(evidenceTotals(rows)).toEqual({
      delivered: 3,
      paid: 4,
      reports: 3,
      given: [{ currency: "EUR", amount: 320 }],
    });
    // matches «أشهر الرعاية» in the hero at the same moment
    expect(myImpact(giftsAsSponsorships([gift], "en"), at(3)).months).toBe(3);
  });

  it("العطاء لمرّة واحدة شهرٌ واحد، بلا تقارير متوالية", () => {
    const rows = tryEvidence([{ ...gift, cadence: "one_time" }], 5, "ar");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reached: 3, note: null });
  });

  it("اللحظات بما قُيّد: اكتمال الحاجة ثم أوّل تسليم ثم البدء", () => {
    const impact = myImpact(giftsAsSponsorships([gift], "en"), at(0));
    expect(impactMoments(impact, tryEvidence([gift], 0, "en")).map((m) => m.key)).toEqual([
      "completed",
      "begun",
    ]);
    expect(impactMoments(impact, tryEvidence([gift], 2, "en"))).toEqual([
      { key: "completed", child: "Sara" },
      { key: "delivered", child: "Sara", month: "2026-11" },
      { key: "begun", child: "Sara" },
    ]);
    const partial = { ...gift, amount: 20 };
    expect(
      impactMoments(
        myImpact(giftsAsSponsorships([partial], "en"), at(0)),
        tryEvidence([partial], 0, "en"),
      ).map((m) => m.key),
    ).toEqual(["begun"]);
    expect(impactMoments(myImpact([], at(0)), [])).toEqual([]);
  });

  it("بحصّتك وبدونها: من بطاقة الكفالة وحدها", () => {
    const [c] = myImpact(giftsAsSponsorships([{ ...gift, amount: 60 }], "en"), at(0)).children;
    const s = childStanding(c!);
    expect(Math.round(s.without * 100)).toBe(33);
    expect(Math.round(s.withYou * 100)).toBe(83);
    expect(s).toMatchObject({ complete: false, open: 20 });
    const [full] = myImpact(giftsAsSponsorships([gift], "en"), at(0)).children;
    expect(childStanding(full!)).toMatchObject({ complete: true, open: 0, withYou: 1 });
  });
});
