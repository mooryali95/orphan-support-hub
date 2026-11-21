/**
 * «أثر الدعم بحسب نوعه» — الشكل المشترك لما يراه الداعم من تعهّد تأهيلٍ أو تعهّدٍ عيني.
 *
 * الكفالة المادية لها سجلّها (`impact-evidence`): دُفع ← حُوِّل ← سُلِّم. وهنا النوعان
 * الآخران، كلٌّ بما تقيّده المنصّة فعلاً ولا شيء سواه:
 *
 * - التأهيل لطفلٍ بعينه: ما تعيده `orphan_qualification` — جلسات البرنامج المقبولة من
 *   المقرّرة (`units_accepted`/`units_total`)، ووجود المشرف والإذن، ووقوع القياس القبلي
 *   والبعدي. الدرجات نفسها لا تُعرض: بابها نطاق «السمات» (`orphan_traits`).
 * - التأهيل لمجموعةٍ أو منطقةٍ أو دولة: مجاميع المكان — أطفالٌ في التأهيل، رحلاتٌ تمّت،
 *   جلساتٌ انعقدت، ومتوسّط كل بُعدٍ من أوّل قياسٍ إلى آخره (`orphan_trait_scores`)؛ ولا
 *   يُنشر متوسّطٌ دون حدّ الحشد.
 * - العيني: صفوف `pledge_deliveries` — «يُجهَّز» ثم «سُلِّم» بمستند.
 *
 * حسابٌ خالص بلا خادم: وضع التجربة يملؤه من `try-support`، واللوحة الحقيقية تملؤه من
 * قراءاتها حين تُضاف.
 */

export type SupportKind = "qualification" | "in_kind";
export type SupportScope = "orphan" | "group" | "region" | "country" | "institution";

/** ما دون هذا العدد لا يُنشر رقمه ولا متوسّطه — كما في القاعدة (cohort_min). */
export const IMPACT_COHORT_MIN = 5;

/** a person shows that person's progress; anything wider shows aggregate reach */
export const isAggregate = (scope: SupportScope) => scope !== "orphan";

/** what every pledge card carries, whatever its kind */
export type PledgeCard = {
  id: string;
  kind: SupportKind;
  scope: SupportScope;
  /** the target as the donor reads it: a display name, a group, a region, a country */
  label: string;
  /** where it is, when the label alone does not say (the country of a child, group or region) */
  place: string | null;
  /** the monthly amount, in the currency it was pledged in (never converted) */
  amount: number;
  currency: string;
  /** when the pledge was recorded */
  at: string;
  /** whole months since then (30.44-day months, as `monthsBetween`) */
  months: number;
  /** a reference shown beside the label (trial pledges carry a DEMO- one) */
  code?: string;
};

/** one child's funded journey, as `orphan_qualification` reports it */
export type QualificationJourney = {
  program: string;
  /** the trait the programme targets, by name */
  trait: string | null;
  /** `units_total`: the programme's sessions */
  sessionsPlanned: number;
  /** `units_accepted`: sessions whose output the supervisor accepted */
  sessionsHeld: number;
  hasSupervisor: boolean;
  hasConsent: boolean;
  /** that a baseline measurement exists — never its scores */
  measuredBefore: boolean;
  /** that a final measurement exists — never its scores */
  measuredAfter: boolean;
};

/** one dimension of the trait model, averaged over the children measured in an area */
export type TraitMovement = {
  key: string;
  label: string;
  /** average of each child's first observation, 0..100 */
  before: number;
  /** average of each child's latest observation, 0..100 */
  latest: number;
};

/** «التطوّر في المنطقة»: what the area's qualification work has on record */
export type AreaDevelopment = {
  /** children enrolled in a qualification programme here; null below the cohort minimum */
  enrolled: number | null;
  /** of those, children with a baseline measurement */
  started: number | null;
  /** of those, children whose journey closed with a final measurement */
  completed: number | null;
  sessionsPlanned: number;
  sessionsHeld: number;
  /** averages by dimension; null until enough children are measured to publish one */
  traits: TraitMovement[] | null;
};

export type QualificationImpact = PledgeCard & { kind: "qualification" } & (
    | { journey: QualificationJourney; area?: undefined }
    | { area: AreaDevelopment; journey?: undefined }
  );

export type DeliveryStage = "recorded" | "preparing" | "delivered";

export type DeliveryRow = {
  id: string;
  /** YYYY-MM */
  month: string;
  stage: DeliveryStage;
  /** a delivery document is on file (always so for a delivered row in the database) */
  documented: boolean;
  /** the document's reference, when one is shown */
  ref?: string | null;
};

export type InKindImpact = PledgeCard & { kind: "in_kind"; deliveries: DeliveryRow[] };

const clamp = (n: number, lo: number, hi: number) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;

/** a count as it may be published: itself at or above the cohort minimum, otherwise nothing */
export const cohortSafe = (n: number, min: number = IMPACT_COHORT_MIN): number | null =>
  Number.isFinite(n) && n >= min ? Math.floor(n) : null;

/** sessions held of those planned, 0..1 (0 when nothing is planned) */
export const sessionShare = (held: number, planned: number) =>
  planned > 0 ? clamp(held / planned, 0, 1) : 0;

export type JourneyStepKey = "supervisor" | "before" | "sessions" | "after";
export type JourneyStep = { key: JourneyStepKey; done: boolean; current: boolean };

/**
 * the four things the record can say about one child's journey, in order: a supervisor is
 * assigned, the baseline was measured, the sessions were all accepted, the final measurement
 * was taken. `current` marks the first one still open.
 */
export function journeySteps(j: QualificationJourney): JourneyStep[] {
  const done: Record<JourneyStepKey, boolean> = {
    supervisor: j.hasSupervisor,
    before: j.measuredBefore,
    sessions: j.sessionsPlanned > 0 && j.sessionsHeld >= j.sessionsPlanned,
    after: j.measuredAfter,
  };
  const order: JourneyStepKey[] = ["supervisor", "before", "sessions", "after"];
  const open = order.find((k) => !done[k]);
  return order.map((key) => ({ key, done: done[key], current: key === open }));
}

/** the journey is complete once the final measurement exists */
export const journeyComplete = (j: QualificationJourney) => j.measuredAfter;

/** whole points a dimension's average moved from first to latest observation */
export const traitDelta = (t: TraitMovement) =>
  Math.round(clamp(t.latest, 0, 100)) - Math.round(clamp(t.before, 0, 100));

export type DeliveryTotals = {
  /** months delivered */
  delivered: number;
  /** of those, with a document on file */
  documented: number;
  /** months the office is still preparing */
  preparing: number;
};

export function deliveryTotals(rows: DeliveryRow[]): DeliveryTotals {
  let delivered = 0;
  let documented = 0;
  let preparing = 0;
  for (const r of rows) {
    if (r.stage === "delivered") {
      delivered += 1;
      if (r.documented) documented += 1;
    } else if (r.stage === "preparing") preparing += 1;
  }
  return { delivered, documented, preparing };
}

/** how far one month's delivery has come: 1 recorded, 2 preparing, 3 delivered */
export const deliveryReached = (r: DeliveryRow): 1 | 2 | 3 =>
  r.stage === "delivered" ? 3 : r.stage === "preparing" ? 2 : 1;

/** newest month first */
export const sortDeliveries = (rows: DeliveryRow[]) =>
  [...rows].sort((a, b) => b.month.localeCompare(a.month) || b.id.localeCompare(a.id));

/**
 * a real pledge's delivery rows (`my_pledges().deliveries`) in this shape. The database keeps
 * one row per stage change; a month's furthest stage is the one shown.
 */
export function deliveriesFromPledge(
  pledgeId: string,
  rows: ReadonlyArray<{ stage: "preparing" | "delivered"; at: string; documented: boolean }>,
): DeliveryRow[] {
  const byMonth = new Map<string, DeliveryRow>();
  for (const r of rows) {
    const month = r.at.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const prev = byMonth.get(month);
    if (prev?.stage === "delivered" && r.stage !== "delivered") continue;
    byMonth.set(month, {
      id: `${pledgeId}:${month}`,
      month,
      stage: r.stage,
      documented: r.stage === "delivered" && r.documented,
    });
  }
  return sortDeliveries([...byMonth.values()]);
}

/* ── the server's own rows, and how they become the views' shapes ── */

/** a pledge as `my_pledges()` returns it (`MyPledge` in `support.functions`), field for field */
export type PledgeRow = {
  id: string;
  kind: SupportKind;
  target_type: SupportScope;
  /** the target's display name, as the server resolved it */
  target: string | null;
  amount: number;
  currency: string;
  status: "pending" | "active" | "fulfilled" | "cancelled";
  created_at: string;
  deliveries?: Array<{ stage: "preparing" | "delivered"; at: string; documented: boolean }>;
};

const DAY = 86_400_000;
/** whole 30.44-day months between two instants, never negative (as `monthsBetween`) */
const wholeMonths = (from: string, to: Date) => {
  const t = Date.parse(from);
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((to.getTime() - t) / (30.44 * DAY)));
};

/** the card every view opens with, from the pledge row alone */
export function pledgeCard(p: PledgeRow, now: Date = new Date()): PledgeCard {
  return {
    id: p.id,
    kind: p.kind,
    scope: p.target_type,
    label: p.target ?? "",
    place: null,
    amount: Number(p.amount) || 0,
    currency: p.currency,
    at: p.created_at,
    months: wholeMonths(p.created_at, now),
  };
}

/**
 * the delivery view of the donor's in-kind pledges, from `my_pledges()` rows. A pledge with no
 * delivery row yet shows one month, «سُجِّل»: recorded and waiting for the office. Cancelled
 * pledges are left out.
 */
export function inKindFromPledges(rows: PledgeRow[], now: Date = new Date()): InKindImpact[] {
  return rows
    .filter((p) => p.kind === "in_kind" && p.status !== "cancelled")
    .map((p): InKindImpact => {
      const deliveries = deliveriesFromPledge(p.id, p.deliveries ?? []);
      const month = p.created_at.slice(0, 7);
      return {
        ...pledgeCard(p, now),
        kind: "in_kind",
        deliveries: deliveries.length
          ? deliveries
          : [{ id: `${p.id}:${month}`, month, stage: "recorded", documented: false }],
      };
    });
}

/** the fields of one `orphan_qualification(_orphan)` entry the journey view reads */
export type QualificationRow = {
  program: string;
  target_trait: string | null;
  units_total: number;
  units_accepted: number;
  has_supervisor: boolean;
  has_consent: boolean;
  measured_before: boolean;
  measured_after: boolean;
};

export const journeyFromQualification = (q: QualificationRow): QualificationJourney => ({
  program: q.program,
  trait: q.target_trait,
  sessionsPlanned: Number(q.units_total) || 0,
  sessionsHeld: Number(q.units_accepted) || 0,
  hasSupervisor: q.has_supervisor,
  hasConsent: q.has_consent,
  measuredBefore: q.measured_before,
  measuredAfter: q.measured_after,
});
