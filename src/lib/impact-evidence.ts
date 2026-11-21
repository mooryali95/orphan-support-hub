/**
 * «سجلّ الأثر الموثّق» — سلسلة كلّ شهر كما قيّدتها المنصّة: دُفع ← حُوِّل إلى جهة الرعاية ←
 * سُلِّم بمستند. لا يُعدّ هنا إلا ما له قيد: الشهر الحقيقي يأتي من `sponsorship_ledger`
 * (حالة الدفع، حالة التسليم، بصمة الإيصال)، وشهر التجربة يُبنى في `try-evidence` ويوسم
 * نموذجاً. لا وجبات ولا أيام دراسة: المنصّة لا تسجّلها، فلا تُدَّعى.
 */
import type { CurrencyTotal } from "@/lib/format";
import type { SponsorshipLedger } from "@/lib/ledger.functions";
import type { MyImpact } from "@/lib/my-impact";

export type EvidenceMonth = {
  id: string;
  /** YYYY-MM */
  month: string;
  /** the child's display name, as on the sponsorship card */
  child: string;
  amount: number;
  currency: string;
  /** how far the record has this month: 0 nothing yet, 1 paid, 2 transferred, 3 delivered */
  reached: 0 | 1 | 2 | 3;
  /** a month that has not come due yet */
  upcoming: boolean;
  /** the payment failed, was refunded or is disputed */
  issue?: boolean;
  deliveredAt?: string | null;
  /** the month's receipt reference (a fingerprint of its facts) */
  receipt?: string | null;
  /** a line from the approved report of that month, when there is one */
  note?: string | null;
  /** the real sponsorship whose full ledger this month belongs to */
  sponsorshipId?: string;
};

export type EvidenceTotals = {
  /** months that reached the child with a delivery document */
  delivered: number;
  /** months paid, delivered or not yet */
  paid: number;
  /** what was paid in those months, per currency (never summed across currencies) */
  given: CurrencyTotal[];
  /** months that carry a report line */
  reports: number;
};

const monthOf = (v: string) => v.slice(0, 7);

/** one real sponsorship's ledger as evidence rows; months with nothing due are left out */
export function evidenceFromLedger(l: SponsorshipLedger): EvidenceMonth[] {
  return l.months.map((m) => {
    const paid = Number(m.paid) || 0;
    const reached =
      m.delivery_status === "delivered"
        ? 3
        : m.delivery_status === "transferred"
          ? 2
          : paid > 0
            ? 1
            : 0;
    return {
      id: `${l.sponsorship.id}:${monthOf(m.month)}`,
      month: monthOf(m.month),
      child: l.orphan.display_name,
      amount: paid > 0 ? paid : Number(m.due) || 0,
      currency: l.sponsorship.currency,
      reached,
      upcoming: m.upcoming,
      issue:
        m.payment_status === "failed" ||
        m.payment_status === "refunded" ||
        m.payment_status === "disputed",
      deliveredAt: m.delivered_at,
      receipt: m.receipt ?? null,
      sponsorshipId: l.sponsorship.id,
    };
  });
}

/** newest month first; within a month, the furthest along first, then by name */
export const sortEvidence = (rows: EvidenceMonth[]) =>
  [...rows].sort(
    (a, b) =>
      b.month.localeCompare(a.month) || b.reached - a.reached || a.child.localeCompare(b.child),
  );

export function evidenceTotals(rows: EvidenceMonth[]): EvidenceTotals {
  const sums = new Map<string, number>();
  let delivered = 0;
  let paid = 0;
  let reports = 0;
  for (const r of rows) {
    if (r.note) reports += 1;
    if (r.reached === 0 || r.issue) continue;
    paid += 1;
    if (r.reached === 3) delivered += 1;
    sums.set(r.currency, (sums.get(r.currency) ?? 0) + r.amount);
  }
  return {
    delivered,
    paid,
    reports,
    given: [...sums.entries()]
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency)),
  };
}

export type ImpactMoment =
  | { key: "completed"; child: string }
  | { key: "delivered"; child: string; month: string }
  | { key: "begun"; child: string };

/**
 * what has really happened so far that deserves a formal acknowledgement, the weightiest
 * first. Each one stands on a record: a need at 100% with this donor among the sponsors, a
 * month with a delivery document, a first payment entered.
 */
export function impactMoments(impact: MyImpact, rows: EvidenceMonth[]): ImpactMoment[] {
  const out: ImpactMoment[] = [];
  const done = impact.children.find((c) => c.active && c.share > 0 && c.covered >= 1);
  if (done) out.push({ key: "completed", child: done.name });
  const first = [...rows]
    .filter((r) => r.reached === 3)
    .sort((a, b) => a.month.localeCompare(b.month))[0];
  if (first) out.push({ key: "delivered", child: first.child, month: first.month });
  const begun = rows.find((r) => r.reached >= 1 && !r.issue);
  if (begun) out.push({ key: "begun", child: begun.child });
  return out;
}

/** `YYYY-MM` plus `n` whole months, as `YYYY-MM` */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = (y ?? 0) * 12 + ((m ?? 1) - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** «نوفمبر 2026» / "November 2026", with Latin digits in every language */
export function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-latn" : locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}
