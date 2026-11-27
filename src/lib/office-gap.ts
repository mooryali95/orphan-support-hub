/**
 * «تحتاج مكتباً» — حسابٌ خالص لقرار التوسّع، بلا DOM ولا شبكة.
 *
 * لكلّ دولةٍ ليس فيها مكتبٌ مؤكَّد للندوة (`field` أو `unconfirmed`) نقدّر
 * عدد الأيتام من البحث، ونزنه بدرجة الثقة بالرقم، ثم نصنّفها:
 *
 * - التقدير: `orphans_total` إن وُجد، وإلا (سكان دون ١٨ × نسبة اليُتم) حين
 *   يتوفّر الاثنان — ويُوسم «تقديرياً» —، وإلا أيتام الحرب (`conflict_orphans`)
 *   كحال غزّة. ما وُسم «تعذّر التحقّق» لا يدخل الحساب أبداً.
 * - الوزن: ثقة عالية ١، متوسطة ٠٫٨، منخفضة ٠٫٦ (والمشتقّ يأخذ أضعف مدخليه).
 * - الفئة: «أولوية عالية» إن بلغ الموزون مليوناً، «متوسطة» دونه، و«تحتاج
 *   بيانات» حين لا رقم موثوقاً — لا نخمّن رقماً لدولة.
 *
 * والدول التي فيها مكتب تأخذ «التغطية» بدل الأولوية: الحاجة مقابل الحضور.
 */
import {
  type Confidence,
  type Indicator,
  type NetworkCountry,
  type PublicPresence,
  WAMY_COUNTRIES,
} from "@/data/wamy-network";
import { formatCount } from "@/lib/format";
import { copyOf, defineCopy, type Locale } from "@/lib/locale";

export const CONFIDENCE_WEIGHT: Record<Confidence, number> = { high: 1, medium: 0.8, low: 0.6 };
/** الحدّ الأدنى (أيتامٌ موزونون بالثقة) لـ«أولوية عالية». */
export const HIGH_PRIORITY_MIN = 1_000_000;

export type Tier = "high" | "medium" | "data";
export const TIERS: readonly Tier[] = ["high", "medium", "data"];

export type OrphanEstimate = {
  value: number;
  /** سنة الرقم (أو سنة السكان حين يُشتقّ). */
  year: number | null;
  /** سنة النسبة حين يُشتقّ الرقم أو تكون سنته غير سنة النسبة. */
  rateYear: number | null;
  source: string;
  url: string;
  confidence: Confidence;
  derived: boolean;
  basis: "total" | "derived" | "conflict";
};

export type PriorityItem = {
  code: string;
  status: "field" | "unconfirmed";
  tier: Tier;
  estimate: OrphanEstimate | null;
  /** الأيتام موزونين بالثقة — به يُرتَّب؛ صفرٌ لمن لا بيانات له. */
  score: number;
  /** رقمٌ متداول تعذّر التحقّق منه — يُذكر في التعليل ولا يُحسب. */
  unverified: Indicator | null;
};

export type CoverageItem = {
  code: string;
  presence: PublicPresence;
  estimate: OrphanEstimate | null;
  score: number;
};

const CONF_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
const weaker = (a: Confidence, b: Confidence): Confidence => (CONF_RANK[a] <= CONF_RANK[b] ? a : b);

export function yearOf(text: string): number | null {
  const m = /(?:19|20)\d\d/.exec(text);
  return m ? Number(m[0]) : null;
}

/** آخر سنةٍ مذكورة في النصّ («2023 (rate from 2019)» ← 2019 للنسبة). */
function lastYearOf(text: string): number | null {
  const all = text.match(/(?:19|20)\d\d/g);
  return all ? Number(all[all.length - 1]) : null;
}

function usable(c: NetworkCountry, key: Indicator["key"]): Indicator | undefined {
  const i = c.need.find((x) => x.key === key);
  return i && i.check !== "unverifiable" ? i : undefined;
}

/** تقدير الأيتام للدولة من بياناتها وحدها، أو null حين لا رقم موثوق. */
export function estimateOrphans(c: NetworkCountry): OrphanEstimate | null {
  const total = usable(c, "orphans_total");
  const rate = usable(c, "orphan_rate_pct");
  const pop = usable(c, "child_pop_u18");
  if (total) {
    const y = yearOf(total.year);
    const ry = total.derived ? (rate ? yearOf(rate.year) : lastYearOf(total.year)) : null;
    return {
      value: total.value,
      year: y,
      rateYear: ry !== y ? ry : null,
      source: total.sourceShort,
      url: total.url,
      confidence: total.confidence,
      derived: total.derived,
      basis: "total",
    };
  }
  if (pop && rate) {
    return {
      value: Math.round((pop.value * rate.value) / 100),
      year: yearOf(pop.year),
      rateYear: yearOf(rate.year),
      source: `${pop.sourceShort} × ${rate.sourceShort}`,
      url: rate.url,
      confidence: weaker(pop.confidence, rate.confidence),
      derived: true,
      basis: "derived",
    };
  }
  const war = usable(c, "conflict_orphans");
  if (war) {
    return {
      value: war.value,
      year: yearOf(war.year),
      rateYear: null,
      source: war.sourceShort,
      url: war.url,
      confidence: war.confidence,
      derived: war.derived,
      basis: "conflict",
    };
  }
  return null;
}

export const weightedScore = (e: OrphanEstimate | null) =>
  e ? Math.round(e.value * CONFIDENCE_WEIGHT[e.confidence]) : 0;

export function tierOf(e: OrphanEstimate | null): Tier {
  if (!e) return "data";
  return weightedScore(e) >= HIGH_PRIORITY_MIN ? "high" : "medium";
}

/** الأولوية لدولةٍ بلا مكتبٍ مؤكَّد؛ null لمن فيها مكتب (لها «التغطية»). */
export function priorityOf(c: NetworkCountry): PriorityItem | null {
  if (c.presence.status === "office") return null;
  const estimate = estimateOrphans(c);
  const raw = c.need.find(
    (x) =>
      (x.key === "orphans_total" || x.key === "conflict_orphans") && x.check === "unverifiable",
  );
  return {
    code: c.code,
    status: c.presence.status,
    tier: tierOf(estimate),
    estimate,
    score: weightedScore(estimate),
    unverified: estimate ? null : (raw ?? null),
  };
}

/** الترتيب: العالية ثم المتوسطة بالموزون تنازلياً، ثم «تحتاج بيانات» بالرمز. */
export function rankPriorities(list: NetworkCountry[] = WAMY_COUNTRIES): PriorityItem[] {
  const order: Record<Tier, number> = { high: 0, medium: 1, data: 2 };
  return list
    .map(priorityOf)
    .filter((x): x is PriorityItem => x !== null)
    .sort(
      (a, b) => order[a.tier] - order[b.tier] || b.score - a.score || a.code.localeCompare(b.code),
    );
}

/** التغطية: دول المكاتب مرتّبةً بالحاجة الموزونة — أين الحضور أمام أكبر حاجة. */
export function coverage(list: NetworkCountry[] = WAMY_COUNTRIES): CoverageItem[] {
  return list
    .flatMap((c) =>
      c.presence.status === "office"
        ? [
            {
              code: c.code,
              presence: c.presence,
              estimate: estimateOrphans(c),
              score: weightedScore(estimateOrphans(c)),
            },
          ]
        : [],
    )
    .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
}

/** ما يُعرض للزوّار: المكاتب والنشاط الميداني؛ غير المؤكَّد لا يُعرض مكتباً. */
export function isPublicPresence(c: NetworkCountry): c is NetworkCountry & {
  presence: PublicPresence;
} {
  return c.presence.status !== "unconfirmed";
}

export const NETWORK_BY_CODE: ReadonlyMap<string, NetworkCountry> = new Map(
  WAMY_COUNTRIES.map((c) => [c.code, c]),
);

/* ── سطر التعليل ─────────────────────────────────────────────────── */

const COPY = defineCopy("lib/office-gap", {
  ar: {
    orphans: (n: string) => `نحو ${n} يتيم`,
    warOrphans: (n: string) => `أكثر من ${n} طفل فقدوا أحد الوالدين أو كليهما في الحرب`,
    when: (year: string, source: string) => ` (${year}، ${source})`,
    derivedYears: (pop: string, rate: string) => `سكان ${pop} × نسبة ${rate}`,
    derived: " — تقديري",
    field: "نشاطٌ ميداني للندوة بلا مكتبٍ مؤكَّد",
    absent: "لا حضور مؤكَّداً للندوة حالياً",
    sep: "؛ ",
    end: ".",
    noData: "لا رقم موثوقاً لعدد الأيتام بعد، يلزم مصدرٌ رسمي قبل الترتيب",
    unverified: (n: string, year: string) => `الرقم المتداول (${n}، ${year}) تعذّر التحقّق منه`,
  },
  en: {
    orphans: (n: string) => `About ${n} orphans`,
    warOrphans: (n: string) => `More than ${n} children who lost one or both parents in the war`,
    when: (year: string, source: string) => ` (${year}, ${source})`,
    derivedYears: (pop: string, rate: string) => `${pop} population × ${rate} rate`,
    derived: " — estimate",
    field: "WAMY field activity, no confirmed office",
    absent: "no confirmed WAMY presence at the moment",
    sep: "; ",
    end: ".",
    noData: "No reliable orphan figure yet; an official source is needed before ranking",
    unverified: (n: string, year: string) =>
      `the circulating figure (${n}, ${year}) could not be verified`,
  },
});

/** عزلُ المصدر اللاتيني وسط سطرٍ عربي. */
const iso = (s: string) => `⁨${s}⁩`;

/** «2023» أو «سكان 2023 × نسبة 2016» — بلا سنةٍ إن لم تُعرف. */
export function yearsText(e: OrphanEstimate, locale: Locale): string {
  const t = copyOf(COPY, locale);
  if (e.year && e.rateYear) return t.derivedYears(String(e.year), String(e.rateYear));
  return e.year ? String(e.year) : "—";
}

/** سطرٌ واحد يبرّر موضع الدولة: الرقم وسنته ومصدره، ثم حال الحضور. */
export function rationale(item: PriorityItem, locale: Locale): string {
  const t = copyOf(COPY, locale);
  const presence = item.status === "field" ? t.field : t.absent;
  const e = item.estimate;
  if (!e) {
    const extra = item.unverified
      ? t.sep +
        t.unverified(
          formatCount(item.unverified.value, locale, { compact: true }),
          item.unverified.year.slice(0, 4),
        )
      : "";
    return `${t.noData}${extra}${t.sep}${presence}${t.end}`;
  }
  const n = formatCount(e.value, locale, { compact: true });
  const head = e.basis === "conflict" ? t.warOrphans(n) : t.orphans(n);
  return `${head}${t.when(yearsText(e, locale), iso(e.source))}${e.derived ? t.derived : ""}${t.sep}${presence}${t.end}`;
}
