import { describe, expect, it } from "vitest";

import type { LedgerMonth, LedgerPayment, SponsorshipLedger } from "@/lib/ledger.functions";
import type { MySponsorship } from "@/lib/sponsorships.functions";
import {
  actionItems,
  applyFilter,
  childMilestones,
  coverageWith,
  currentMonth,
  deliveredShare,
  endsOn,
  isFirstMonth,
  journeyByMonth,
  packageLine,
  resumesOn,
  statementFor,
  statementYears,
  stepReached,
} from "./sponsor-center";

const pay = (o: Partial<LedgerPayment> & Pick<LedgerPayment, "invoice_no">): LedgerPayment => ({
  provider: "creem",
  provider_payment_id: null,
  amount: 50,
  currency: "EUR",
  status: "paid",
  paid_at: null,
  receipt_url: null,
  ...o,
});
const month = (o: Partial<LedgerMonth> & Pick<LedgerMonth, "month">): LedgerMonth => ({
  upcoming: false,
  due: 50,
  paid: 0,
  payment_status: null,
  delivery_status: null,
  delivered_at: null,
  ...o,
});
const ledger = (
  id: string,
  months: LedgerMonth[],
  o: Partial<SponsorshipLedger["sponsorship"]> = {},
): SponsorshipLedger => ({
  sponsorship: {
    id,
    amount: 50,
    currency: "EUR",
    status: "active",
    type: "monthly",
    started_at: "2025-03-10T00:00:00Z",
    next_charge_at: null,
    is_anonymous: false,
    message: null,
    message_status: "none",
    created_at: "2025-03-01T00:00:00Z",
    ...o,
  },
  orphan: {
    id: `o-${id}`,
    code: `C-${id}`,
    display_name: `Child ${id}`,
    country: null,
    age_band: "6-9",
  },
  months,
  totals: { paid: 0, months_paid: 0, months_delivered: 0 },
});
const sp = (o: Partial<MySponsorship> & Pick<MySponsorship, "id">): MySponsorship => ({
  amount: 50,
  currency: "EUR",
  type: "monthly",
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  started_at: "2026-01-01T00:00:00Z",
  ended_at: null,
  end_reason: null,
  cancel_effective_at: null,
  paused_until: null,
  provider_subscription_id: null,
  orphan: { id: "o1", display_name: "A", code: "C1", monthly_need: 200, funded_monthly: 100 },
  ...o,
});

describe("statementFor — سجلّ التبرّعات", () => {
  const eur = ledger("a", [
    month({
      month: "2025-12",
      payments: [pay({ invoice_no: "I-1", paid_at: "2025-12-03T00:00:00Z" })],
    }),
    month({
      month: "2026-01",
      payments: [
        pay({ invoice_no: "I-2", paid_at: "2026-01-03T00:00:00Z" }),
        pay({ invoice_no: "I-3", status: "refunded", amount: 20, paid_at: "2026-01-04T00:00:00Z" }),
        pay({ invoice_no: "I-4", status: "failed" }),
        pay({ invoice_no: "I-5", status: "pending" }),
        pay({ invoice_no: "I-6", status: "disputed", paid_at: "2026-01-09T00:00:00Z" }),
      ],
    }),
    month({
      month: "2026-02",
      payments: [pay({ invoice_no: "I-7", amount: 50.5, paid_at: "2026-02-02T00:00:00Z" })],
    }),
  ]);
  const usd = ledger("b", [
    month({
      month: "2026-01",
      payments: [
        pay({ invoice_no: "U-1", currency: "USD", amount: 70, paid_at: "2026-01-05T00:00:00Z" }),
      ],
    }),
  ]);

  it("counts only paid invoices of the year, per currency, never summed across currencies", () => {
    const s = statementFor(2026, [eur, usd]);
    expect(s.totals).toEqual([
      { currency: "EUR", received: 120.5, refunded: 20, net: 100.5 },
      { currency: "USD", received: 70, refunded: 0, net: 70 },
    ]);
  });

  it("lists refunded invoices separately and subtracts them", () => {
    const s = statementFor(2026, [eur]);
    const a = s.children[0]!;
    expect(a.paid.map((p) => p.invoice_no)).toEqual(["I-2", "I-7"]);
    expect(a.refunded.map((p) => p.invoice_no)).toEqual(["I-3"]);
    expect(s.totals[0]!.net).toBe(100.5);
  });

  it("leaves failed, pending and disputed invoices out", () => {
    const all = statementFor(2026, [eur]).children.flatMap((c) => [...c.paid, ...c.refunded]);
    expect(all.map((p) => p.invoice_no)).not.toContain("I-4");
    expect(all.map((p) => p.invoice_no)).not.toContain("I-5");
    expect(all.map((p) => p.invoice_no)).not.toContain("I-6");
  });

  it("keeps years apart and omits children with nothing in the year", () => {
    expect(statementFor(2025, [eur, usd]).children.map((c) => c.sponsorshipId)).toEqual(["a"]);
    expect(statementFor(2024, [eur]).children).toEqual([]);
    expect(statementYears([eur, usd])).toEqual([2026, 2025]);
  });
});

describe("packageLine — خطّ الطرد", () => {
  it("follows the recorded delivery only", () => {
    expect(packageLine(month({ month: "2026-01" })).reached).toBeNull();
    expect(packageLine(month({ month: "2026-01", paid: 50 })).reached).toBe("scheduled");
    expect(packageLine(month({ month: "2026-01", delivery_status: "transferred" })).reached).toBe(
      "transferred",
    );
    const d = packageLine(month({ month: "2026-01", paid: 50, delivery_status: "delivered" }));
    expect(d.reached).toBe("delivered");
    expect(stepReached(d, "scheduled") && stepReached(d, "transferred")).toBe(true);
  });

  it("flags failed and disputed months, and says refunded plainly", () => {
    expect(packageLine(month({ month: "2026-01", payment_status: "failed" })).issue).toBe("failed");
    expect(packageLine(month({ month: "2026-01", payment_status: "disputed" })).issue).toBe(
      "disputed",
    );
    expect(packageLine(month({ month: "2026-01", payment_status: "refunded" })).refunded).toBe(
      true,
    );
  });

  it("takes the latest month that is not upcoming", () => {
    const l = ledger("a", [
      month({ month: "2026-02", upcoming: true }),
      month({ month: "2026-01" }),
      month({ month: "2025-12" }),
    ]);
    expect(currentMonth(l)?.month).toBe("2026-01");
  });
});

describe("actionItems — شريط الإجراء", () => {
  const now = new Date("2026-03-01T00:00:00Z");
  it("is empty when nothing needs the sponsor", () => {
    expect(actionItems([sp({ id: "a" })], {}, now)).toEqual([]);
  });
  it("lists pending payments, failed months and pauses that end soon; never ended ones", () => {
    const items = actionItems(
      [
        sp({ id: "p", status: "pending_payment" }),
        sp({ id: "f" }),
        sp({ id: "z", status: "paused", paused_until: "2026-03-10T00:00:00Z" }),
        sp({ id: "far", status: "paused", paused_until: "2026-05-10T00:00:00Z" }),
        sp({ id: "x", status: "cancelled" }),
      ],
      {
        f: ledger("f", [month({ month: "2026-02", payment_status: "failed" })]),
        x: ledger("x", [month({ month: "2026-02", payment_status: "failed" })]),
      },
      now,
    );
    expect(items).toEqual([
      { kind: "pending", sponsorshipId: "p" },
      { kind: "failed", sponsorshipId: "f", month: "2026-02" },
      { kind: "resumes", sponsorshipId: "z", on: "2026-03-10T00:00:00Z" },
    ]);
  });
});

describe("childMilestones and journeyByMonth", () => {
  const l = ledger("a", [
    month({ month: "2025-03", paid: 50, delivery_status: "delivered" }),
    month({ month: "2025-04", paid: 50, delivery_status: "delivered" }),
    month({ month: "2026-04", paid: 50, delivery_status: "transferred" }),
    month({ month: "2026-05", upcoming: true }),
  ]);
  it("derives the first delivered month and the anniversaries that have come", () => {
    expect(childMilestones(l, new Date("2026-04-01T00:00:00Z"))).toEqual([
      { kind: "first_delivered", month: "2025-03" },
      { kind: "anniversary", years: 1, on: "2026-03-10T00:00:00.000Z" },
    ]);
    expect(
      childMilestones(l, new Date("2027-03-11T00:00:00Z")).filter((m) => m.kind === "anniversary"),
    ).toHaveLength(2);
  });
  it("groups every event by month, newest first, without upcoming months", () => {
    const g = journeyByMonth(
      l,
      [{ id: "r1", period: "April", published_at: "2026-04-02T00:00:00Z" }],
      { "2025-04": ["Unit 1"] },
      new Date("2026-04-20T00:00:00Z"),
    );
    expect(g.map((x) => x.month)).toEqual(["2026-04", "2026-03", "2025-04", "2025-03"]);
    expect(g[0]!.events.map((e) => e.kind).sort()).toEqual(["month", "report"]);
  });
});

describe("evidence and management", () => {
  it("phrases evidence by month counts", () => {
    expect(deliveredShare({ paid: 0, months_paid: 9, months_delivered: 8 })).toEqual({
      delivered: 8,
      paid: 9,
      all: false,
    });
    expect(deliveredShare({ paid: 0, months_paid: 0, months_delivered: 0 }).all).toBe(false);
  });
  it("computes the resume and end dates as the database does", () => {
    const now = new Date("2026-03-15T00:00:00Z");
    expect(resumesOn("2026-04-01T00:00:00Z", 2, now)).toBe("2026-06-01T00:00:00.000Z");
    expect(resumesOn(null, 1, now)).toBe("2026-04-15T00:00:00.000Z");
    expect(endsOn({ status: "pending_payment" }, "2026-04-01T00:00:00Z", now).immediate).toBe(true);
    expect(endsOn({ status: "active" }, "2026-04-01T00:00:00Z", now)).toEqual({
      at: "2026-04-01T00:00:00.000Z",
      immediate: false,
    });
  });
  it("shows the coverage effect of a new amount", () => {
    expect(coverageWith(sp({ id: "a" }), 50)).toBe(50);
    expect(coverageWith(sp({ id: "a" }), 20)).toBe(35);
    expect(coverageWith(sp({ id: "a", status: "pending_payment" }), 50)).toBe(75);
    expect(coverageWith(sp({ id: "a" }), 500)).toBe(100);
  });
  it("filters by status and knows the first month", () => {
    const list = [
      sp({ id: "a" }),
      sp({ id: "b", status: "paused" }),
      sp({ id: "c", status: "completed" }),
    ];
    expect(applyFilter(list, "ended").map((s) => s.id)).toEqual(["c"]);
    expect(applyFilter(list, "all")).toHaveLength(3);
    expect(isFirstMonth(sp({ id: "a" }), new Date("2026-01-20T00:00:00Z"))).toBe(true);
    expect(isFirstMonth(sp({ id: "a" }), new Date("2026-03-20T00:00:00Z"))).toBe(false);
  });
});
