import { describe, expect, it } from "vitest";

import {
  cohortSafe,
  deliveriesFromPledge,
  deliveryReached,
  deliveryTotals,
  inKindFromPledges,
  isAggregate,
  journeyFromQualification,
  journeyComplete,
  journeySteps,
  pledgeCard,
  sessionShare,
  sortDeliveries,
  traitDelta,
  type DeliveryRow,
  type PledgeRow,
  type QualificationJourney,
} from "./support-impact";

const journey = (over: Partial<QualificationJourney> = {}): QualificationJourney => ({
  program: "p",
  trait: null,
  sessionsPlanned: 8,
  sessionsHeld: 0,
  hasSupervisor: false,
  hasConsent: true,
  measuredBefore: false,
  measuredAfter: false,
  ...over,
});

describe("أثر الدعم بحسب نوعه", () => {
  it("الطفل تقدّمه هو، وما عداه مجاميع", () => {
    expect(isAggregate("orphan")).toBe(false);
    for (const s of ["group", "region", "country", "institution"] as const) {
      expect(isAggregate(s)).toBe(true);
    }
  });

  it("لا يُنشر عددٌ دون حدّ الحشد", () => {
    expect(cohortSafe(4)).toBeNull();
    expect(cohortSafe(5)).toBe(5);
    expect(cohortSafe(Number.NaN)).toBeNull();
    expect(cohortSafe(2, 2)).toBe(2);
  });

  it("محطّات الرحلة بترتيبها، والجارية أوّل ما لم يكتمل", () => {
    expect(journeySteps(journey()).map((s) => [s.key, s.done, s.current])).toEqual([
      ["supervisor", false, true],
      ["before", false, false],
      ["sessions", false, false],
      ["after", false, false],
    ]);
    const mid = journeySteps(
      journey({ hasSupervisor: true, measuredBefore: true, sessionsHeld: 4 }),
    );
    expect(mid.find((s) => s.current)?.key).toBe("sessions");
    const done = journey({
      hasSupervisor: true,
      measuredBefore: true,
      sessionsHeld: 8,
      measuredAfter: true,
    });
    expect(journeySteps(done).every((s) => s.done && !s.current)).toBe(true);
    expect(journeyComplete(done)).toBe(true);
    // a programme with no sessions planned never reads as "sessions complete"
    expect(journeySteps(journey({ sessionsPlanned: 0 }))[2]!.done).toBe(false);
  });

  it("نصيب الجلسات محصور بين 0 و1", () => {
    expect(sessionShare(4, 8)).toBe(0.5);
    expect(sessionShare(9, 8)).toBe(1);
    expect(sessionShare(1, 0)).toBe(0);
  });

  it("حركة البُعد بنقاطٍ صحيحة", () => {
    expect(traitDelta({ key: "k", label: "l", before: 41.4, latest: 47.6 })).toBe(7);
    expect(traitDelta({ key: "k", label: "l", before: 50, latest: 50 })).toBe(0);
  });

  it("يُعدّ الموثّق من المسلَّم، وما يُجهَّز وحده", () => {
    const rows: DeliveryRow[] = [
      { id: "a", month: "2026-09", stage: "delivered", documented: true },
      { id: "b", month: "2026-10", stage: "delivered", documented: false },
      { id: "c", month: "2026-11", stage: "preparing", documented: false },
      { id: "d", month: "2026-12", stage: "recorded", documented: false },
    ];
    expect(deliveryTotals(rows)).toEqual({ delivered: 2, documented: 1, preparing: 1 });
    expect(rows.map(deliveryReached)).toEqual([3, 3, 2, 1]);
    expect(sortDeliveries(rows).map((r) => r.month)[0]).toBe("2026-12");
  });

  it("صفوف التسليم الحقيقية: أبعد مرحلةٍ في الشهر، والأحدث أوّلاً", () => {
    const rows = deliveriesFromPledge("p1", [
      { stage: "preparing", at: "2026-10-03T00:00:00Z", documented: false },
      { stage: "delivered", at: "2026-10-20T00:00:00Z", documented: true },
      { stage: "preparing", at: "2026-10-25T00:00:00Z", documented: false },
      { stage: "preparing", at: "2026-11-02T00:00:00Z", documented: false },
      { stage: "delivered", at: "bad", documented: true },
    ]);
    expect(rows).toEqual([
      { id: "p1:2026-11", month: "2026-11", stage: "preparing", documented: false },
      { id: "p1:2026-10", month: "2026-10", stage: "delivered", documented: true },
    ]);
  });

  it("صفّ my_pledges يصير بطاقةً ومنظر تسليم، وصفّ orphan_qualification رحلةً", () => {
    const now = new Date("2026-12-20T00:00:00Z");
    const row: PledgeRow = {
      id: "p1",
      kind: "in_kind",
      target_type: "region",
      target: "Cairo",
      amount: 50,
      currency: "USD",
      status: "active",
      created_at: "2026-10-01T00:00:00Z",
    };
    expect(pledgeCard(row, now)).toMatchObject({ scope: "region", label: "Cairo", months: 2 });
    const [fresh] = inKindFromPledges([row], now);
    expect(fresh!.deliveries).toEqual([
      { id: "p1:2026-10", month: "2026-10", stage: "recorded", documented: false },
    ]);
    const list = inKindFromPledges(
      [
        { ...row, deliveries: [{ stage: "delivered", at: "2026-11-03", documented: true }] },
        { ...row, id: "p2", status: "cancelled" },
        { ...row, id: "p3", kind: "qualification" },
      ],
      now,
    );
    expect(list).toHaveLength(1);
    expect(list[0]!.deliveries[0]).toMatchObject({ stage: "delivered", documented: true });
    expect(
      journeyFromQualification({
        program: "p",
        target_trait: "t",
        units_total: 6,
        units_accepted: 2,
        has_supervisor: true,
        has_consent: true,
        measured_before: true,
        measured_after: false,
      }),
    ).toMatchObject({ sessionsPlanned: 6, sessionsHeld: 2, trait: "t", measuredBefore: true });
  });
});
