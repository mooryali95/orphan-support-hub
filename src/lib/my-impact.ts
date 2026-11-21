/**
 * «أثري» — الصورة الشخصية للداعم من كفالاته هو وحدها. لا يقرأ إلا ما في بطاقة
 * الكفالة المسموح بها (الاسم المعروض، الرمز، الحاجة الشهرية، الممول منها)؛ فلا صور
 * ولا أماكن — تلك خلف بوابة الوصول إلى الطفل.
 */
import type { MySponsorship } from "@/lib/sponsorships.functions";

export type ImpactChild = {
  id: string;
  name: string;
  /** months this donor's care has run, whole months since it started */
  months: number;
  /** share of the child's monthly need this donor covers, 0..1 */
  share: number;
  /** share of the need covered by everyone, 0..1 */
  covered: number;
  active: boolean;
  /** whole months from when this care began until now (for the time rail) */
  since: number;
  amount: number;
  currency: string;
  /** the child's whole monthly need, in the sponsorship's currency (0 when unknown) */
  need: number;
};

export type MyImpact = {
  children: ImpactChild[];
  /** children with a running (active or paused) sponsorship */
  inCare: number;
  /** total months of care across all sponsorships */
  months: number;
  /** average share of their needs this donor covers, over children in care, 0..1 */
  share: number;
};

const DAY = 86_400_000;

/** whole months between two dates (30.44-day months), never negative */
export function monthsBetween(from: string | null, to: Date): number {
  if (!from) return 0;
  const t = Date.parse(from);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((to.getTime() - t) / (30.44 * DAY)));
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

export function myImpact(list: MySponsorship[], now: Date = new Date()): MyImpact {
  const children: ImpactChild[] = [];
  for (const s of list) {
    if (!s.orphan || s.status === "pending_payment") continue;
    const need = Number(s.orphan.monthly_need) || 0;
    const end = s.ended_at ? new Date(s.ended_at) : now;
    const running = s.status === "active" || s.status === "paused";
    children.push({
      id: s.id,
      name: s.orphan.display_name,
      months: s.type === "one_time" ? 1 : monthsBetween(s.started_at ?? s.created_at, end),
      share: need > 0 && s.type !== "one_time" ? clamp01(s.amount / need) : 0,
      covered: need > 0 ? clamp01(Number(s.orphan.funded_monthly) / need) : 0,
      active: running,
      since: monthsBetween(s.started_at ?? s.created_at, now),
      amount: s.amount,
      currency: s.currency,
      need,
    });
  }
  const inCare = children.filter((c) => c.active);
  return {
    children,
    inCare: inCare.length,
    months: children.reduce((a, c) => a + c.months, 0),
    share: inCare.length ? inCare.reduce((a, c) => a + c.share, 0) / inCare.length : 0,
  };
}

/** how far back the time rail reaches: the oldest care, at least a month */
export const impactSpan = (m: MyImpact) => Math.max(1, ...m.children.map((c) => c.since));

/**
 * the picture as it stood `back` whole months ago: only care begun by then, each with the
 * months it had run by then (a care that has since ended keeps its months, never more).
 */
export function impactAt(m: MyImpact, back: number): MyImpact {
  if (back <= 0) return m;
  const children = m.children
    .filter((c) => c.since > back)
    .map((c) => ({ ...c, months: Math.min(c.months, c.since - back) }));
  const inCare = children.filter((c) => c.active);
  return {
    children,
    inCare: inCare.length,
    months: children.reduce((a, c) => a + c.months, 0),
    share: inCare.length ? inCare.reduce((a, c) => a + c.share, 0) / inCare.length : 0,
  };
}

/**
 * «بحصّتك وبدونها»: where the child's monthly need stands with this donor's share and
 * without it, and what is still open each month. It says "without your share", never
 * "before you": other sponsors may have joined since, and the card does not record when.
 */
export function childStanding(c: ImpactChild) {
  const without = Math.max(0, c.covered - c.share);
  return {
    without,
    withYou: c.covered,
    complete: c.share > 0 && c.covered >= 1,
    /** what is still uncovered each month, in money (0 once complete or when need is unknown) */
    open: Math.max(0, Math.round(c.need * (1 - c.covered))),
  };
}
