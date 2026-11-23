/**
 * قاعة الداعم — أثره هو في الوضع الغامر، من المصدر نفسه الذي تقرؤه لوحته:
 * كفالاته من `listMySponsorships` (ببوّابتها نفسها)، ثم `myImpact` و`impactStats` اللذان يكتب بهما
 * رأس اللوحة أرقامه. لا رقم هنا يُحسب مرّةً ثانية، فلا يمكن أن يختلف عن اللوحة.
 *
 * الدولة وحدها تأتي من بطاقة الطفل العامّة (`orphan_view` بلا هويّة قارئ، ما تعرضه صفحة ملفّه
 * لأيّ زائر): لا منطقة ولا مدينة ولا صورة. طفلٌ لا تنشر بطاقته دولته يُعدّ في الأرقام ولا يُوضع
 * على الكرة. ولا شيء من كتالوج التجربة يدخل هنا.
 *
 * خالص: لا عميل قاعدة ولا DOM. الصفحة تجلب، وهذا الملفّ يشكّل، والمشهد يعرض.
 */
import { resolveCountry } from "@/lib/countries";
import {
  impactPercent,
  impactStats,
  myImpact,
  type ImpactChild,
  type MyImpact,
} from "@/lib/my-impact";
import type { MySponsorship } from "@/lib/sponsorships.functions";

export type DonorChild = {
  /** the child's display name, as on the sponsorship card */
  name: string;
  /** whole months this donor's care has run */
  months: number;
  /** the donor's share of the child's monthly need, written as the dashboard writes it */
  share: string;
  /** a running (active or paused) sponsorship */
  active: boolean;
  /** the child's public file */
  href: string;
};

export type DonorCountry = {
  code: string;
  /** children here in the donor's care now */
  inCare: number;
  children: DonorChild[];
};

export type DonorHall = {
  /** the dashboard's own picture, untouched */
  impact: MyImpact;
  /** the three figures exactly as the dashboard's hero writes them */
  stats: ReturnType<typeof impactStats>;
  /** countries of the donor's children, the dashboard's order (newest sponsorship first) */
  countries: DonorCountry[];
  /** children whose public card names no country: counted above, placed nowhere */
  unplaced: number;
  /** the country the hall lands on: the first with a child in care, else the first */
  start: string | null;
};

/** the id every money function accepts; a child without one is never linked */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** the orphans whose public card the page asks for: each real child once */
export function donorOrphanIds(list: readonly MySponsorship[]): string[] {
  return [
    ...new Set(
      list.flatMap((s) =>
        s.orphan && s.status !== "pending_payment" && UUID.test(s.orphan.id) ? [s.orphan.id] : [],
      ),
    ),
  ];
}

/**
 * the donor's hall for a list of their sponsorships. `countryOf` answers with the country on a
 * child's public card (a name or a code, as the directory stores it), or nothing.
 */
export function donorHall(
  list: MySponsorship[],
  countryOf: (orphanId: string) => string | null | undefined,
  now: Date = new Date(),
): DonorHall {
  const impact = myImpact(list, now);
  const orphanOf = new Map(list.map((s) => [s.id, s.orphan?.id ?? null]));
  const byCode = new Map<string, DonorCountry>();
  let unplaced = 0;
  const row = (c: ImpactChild, orphan: string): DonorChild => ({
    name: c.name,
    months: c.months,
    share: impactPercent(c.share),
    active: c.active,
    href: `/orphans/${orphan}`,
  });
  for (const c of impact.children) {
    const orphan = orphanOf.get(c.id);
    const code = orphan && UUID.test(orphan) ? resolveCountry(countryOf(orphan)) : null;
    if (!orphan || !code) {
      unplaced++;
      continue;
    }
    let co = byCode.get(code);
    if (!co) byCode.set(code, (co = { code, inCare: 0, children: [] }));
    co.children.push(row(c, orphan));
    if (c.active) co.inCare++;
  }
  const countries = [...byCode.values()];
  return {
    impact,
    stats: impactStats(impact),
    countries,
    unplaced,
    start: (countries.find((c) => c.inCare > 0) ?? countries[0])?.code ?? null,
  };
}
