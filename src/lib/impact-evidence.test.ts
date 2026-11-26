import { describe, expect, it } from "vitest";

import {
  addMonths,
  evidenceFromLedger,
  evidenceTotals,
  monthLabel,
  sortEvidence,
  type EvidenceMonth,
} from "./impact-evidence";
import type { LedgerMonth, SponsorshipLedger } from "./ledger.functions";

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
