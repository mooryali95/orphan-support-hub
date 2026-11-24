/**
 * قاعة الأثر — المنطق الخالص (بلا DOM ولا WebGL)، ومصادره من المستودع:
 *   - الحضور والمدينة والنشاط من `@/data/wamy-network` (البحث العامّ)؛
 *   - أرقام التشغيل الافتراضية من `simFor` في `@/data/vision-network`؛
 *   - مدن ألبانيا وحاجتها وتمويلها من `@/data/vision-demo`؛
 *   - الحدود ونقاط اليابسة من `@/data/hall-geo` (Natural Earth).
 * غير المؤكَّد يُخفى افتراضياً كما في خريطة الشبكة، ويظهر في «النموذج الكامل».
 *
 * أرقام هذا الملفّ (المناطق وحاجتها وتمويلها، وأسعار الوحدات، ومقياس السمات) للقاعة الحيّة
 * وحدها. قاعة التجربة لا تقرأ منها رقماً: نموذجها من كتالوج التجربة (`./trial`)، وتأخذ من هنا
 * الشبكة والحدود وموضع العمود (`nx`/`ny`) لا غير.
 */
import { SHAPES } from "@/data/hall-geo";
import { ALBANIA, TRAITS as DEMO_TRAITS } from "@/data/vision-demo";
import { simFor } from "@/data/vision-network";
import { WAMY_COUNTRIES } from "@/data/wamy-network";

export type Status = "hq" | "office" | "field" | "unconfirmed";
export type Track = "qualify" | "sponsor" | "kiswa";
export type Pt = [number, number];

export type HallCountry = {
  code: string;
  ar: string;
  st: Status;
  /** where the presence is, what it is and what it does, in Arabic and English (public research) */
  city: Named | null;
  type: Named | null;
  act: Named | null;
  year: number | null;
  lat: number;
  lon: number;
  span: number;
  off: [number, number];
  rings: Pt[][];
  sim: ReturnType<typeof simFor>;
};

export type Named = { ar: string; en: string };

export type Region = {
  id: string;
  /** the name the scene writes: Arabic here, replaced by the interface language's (`./live`) */
  ar: string;
  /** the Latin name (a city of Albania), or the region's number for the numbered sample regions */
  en: string;
  nx: number;
  ny: number;
  need: number;
  funded: number;
  qualified: number;
  clothed: number;
  sponsored: number;
};

/**
 * the sample unit price of each kind of support, in the hall's one currency (the platform's
 * unified currency, `./live`). Their names are copy, in `./live`, in the interface language.
 */
export const TRACKS: Record<Track, { unit: number }> = {
  qualify: { unit: 600 },
  sponsor: { unit: 300 },
  kiswa: { unit: 300 },
};
/** the sample amounts the support sheet offers, and the one it opens on */
export const AMOUNTS = { min: 1000, max: 100_000, step: 500, initial: 10_000 } as const;
export const AMOUNT_PRESETS = [1000, 5000, 10_000, 25_000, 50_000] as const;

/** السمات الستّ ومتوسّطاها (قبل، بعد) كما في منصّة الرؤية: من `vision-demo`، لا نسخةٌ ثانية. */
export const TRAITS: Array<[string, number, number]> = DEMO_TRAITS.map((t) => [
  t.name.ar,
  t.before,
  t.after,
]);

export function fnv(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const COUNTRIES: HallCountry[] = WAMY_COUNTRIES.flatMap((c) => {
  const sh = SHAPES[c.code];
  if (!sh) return [];
  const p = c.presence;
  const st: Status = p.status === "unconfirmed" ? "unconfirmed" : p.hq ? "hq" : p.status;
  const rings = sh.rings.map((r) => {
    const out: Pt[] = [];
    for (let i = 0; i + 1 < r.length; i += 2) out.push([r[i]! / 1000, r[i + 1]! / 1000]);
    return out;
  });
  const pub = p.status === "unconfirmed" ? null : p;
  return [
    {
      code: c.code,
      ar: c.nameAr,
      st,
      city: pub?.city ?? null,
      type: pub?.type ?? null,
      act: pub?.activity ?? null,
      year: pub?.year ?? null,
      lat: sh.lat,
      lon: sh.lon,
      span: sh.span,
      off: sh.off,
      rings,
      sim: simFor(
        c.code,
        st === "unconfirmed" ? "field" : st === "hq" ? "office" : st,
        st === "hq",
      ),
    },
  ];
});

export const byCode = (code: string) => COUNTRIES.find((c) => c.code === code);

/** حالات ملفّ البحث كما بُنيت، قبل أيّ سجلّ: يعود إليها كلّ تطبيقٍ جديد. */
const RESEARCH_ST = new Map(COUNTRIES.map((c) => [c.code, c.st] as const));

/**
 * يطبّق سجلّ المكاتب على دول القاعدة بالقاعدة نفسها التي تطبّقها الخارطة
 * (`withRegister` في `@/lib/office-presence`). يُستدعى قبل تركيب المشهد؛ ويعيد الأصل أوّلاً،
 * فلا يتراكم سجلٌّ على سجلّ.
 */
export function applyRegister(apply: (base: ReadonlyMap<string, Status>) => Map<string, Status>) {
  const next = apply(RESEARCH_ST);
  for (const c of COUNTRIES) c.st = next.get(c.code) ?? RESEARCH_ST.get(c.code)!;
}

/** Plinth radius the country model must stay inside, in scene units. */
export const PLINTH_FIT = 6.9;
/** Farthest point of a country's outline from its centre (shapes are normalised to their bounding box). */
export function reach(co: Pick<HallCountry, "rings">) {
  let m = 0;
  for (const ring of co.rings) for (const [x, y] of ring) m = Math.max(m, Math.hypot(x, y));
  return m;
}
/** Scene scale for a country: squarish shapes (Egypt, Saudi Arabia) shrink so their corners stay on the plinth. */
export const fitScale = (co: Pick<HallCountry, "rings">) =>
  Math.min(6.3, PLINTH_FIT / Math.max(reach(co), 1e-6));

/** مواقع مدن ألبانيا (خطّ الطول، خطّ العرض)؛ أرقامها من vision-demo. */
const ALB_LL: Record<string, Pt> = {
  shkoder: [19.51, 42.07],
  kukes: [20.42, 42.08],
  durres: [19.45, 41.32],
  tirana: [19.82, 41.33],
  elbasan: [20.08, 41.11],
  fier: [19.56, 40.72],
  berat: [19.95, 40.7],
  korce: [20.78, 40.62],
  vlore: [19.49, 40.47],
};

export function inRing(x: number, y: number, ring: Pt[]) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

function seeded(seed: string) {
  let a = fnv(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withCounts(r: Omit<Region, "qualified" | "clothed" | "sponsored">): Region {
  return {
    ...r,
    qualified: Math.round((r.need * Math.min(100, r.funded)) / 100),
    clothed: Math.round(r.need * 0.25),
    sponsored: Math.round(r.need * 0.3),
  };
}

/** مدن ألبانيا الحقيقية، ومناطق افتراضية مرقّمة داخل حدود غيرها (حتمية من رمز الدولة). */
export function regionsFor(co: HallCountry): Region[] {
  if (co.code === "AL") {
    const k = Math.cos((co.lat * Math.PI) / 180);
    const h = co.span / 2;
    return ALBANIA.flatMap((c) => {
      const ll = ALB_LL[c.id];
      if (!ll) return [];
      return [
        withCounts({
          id: c.id,
          ar: c.name.ar,
          en: c.name.en,
          nx: ((ll[0] - co.lon - co.off[0]) * k) / h,
          ny: (ll[1] - co.lat - co.off[1]) / h,
          need: c.need,
          funded: c.funded,
        }),
      ];
    });
  }
  const rnd = seeded(`${co.code}:r`);
  const n = co.st === "hq" ? 7 : co.st === "office" ? 6 : 5;
  const pts: Pt[] = [];
  for (let t = 0; t < 6000 && pts.length < n; t++) {
    const x = rnd() * 2 - 1;
    const y = rnd() * 2 - 1;
    const far = !pts.some((p) => Math.hypot(p[0] - x, p[1] - y) < Math.max(0.08, 0.34 - t / 15000));
    if (far && co.rings.some((r) => inRing(x, y, r))) pts.push([x, y]);
  }
  return pts.map(([x, y], i) =>
    withCounts({
      id: `${co.code}-r${i + 1}`,
      ar: `المنطقة ${i + 1}`,
      en: `Region ${i + 1}`,
      nx: x,
      ny: y,
      need: 16 + Math.floor(rnd() * 48),
      funded: Math.max(12, Math.min(100, co.sim.funded - 22 + Math.floor(rnd() * 44))),
    }),
  );
}

export const gapOf = (r: Pick<Region, "need" | "qualified">) => r.need - r.qualified;

export function totals(rs: Region[]) {
  const need = rs.reduce((a, c) => a + c.need, 0);
  const q = rs.reduce((a, c) => a + c.qualified, 0);
  return {
    need,
    q,
    gap: need - q,
    pct: need ? Math.round((q / need) * 100) : 0,
    clothed: rs.reduce((a, c) => a + c.clothed, 0),
    sponsored: rs.reduce((a, c) => a + c.sponsored, 0),
  };
}

/**
 * the country's sample figures as the hall writes them, on the world card and in the country
 * panel alike. One computation: the share funded is `totals(regions).pct` in both places, so
 * the card and the panel cannot name two different percentages for one country. `sim` (the
 * vision network's seeded office figures) gives the card its groups and supervisors only.
 */
export function countryFigures(co: Pick<HallCountry, "sim">, regions: Region[]) {
  const t = totals(regions);
  return {
    card: {
      groups: co.sim.groups,
      inQualification: co.sim.inQualification,
      supervisors: co.sim.supervisors,
      funded: t.pct,
    },
    kpis: { need: t.need, funded: t.pct, waiting: t.gap },
  };
}

/** إيقاع التأهيل الشهري التقديري للبلد. */
export const pace = (rs: Region[]) => Math.max(6, Math.round(totals(rs).need / 18));

export type Projection =
  | {
      track: "qualify";
      units: number;
      kids: number;
      spill: number;
      groups: number;
      rest: number;
      gap0: number;
      gap1: number;
      lit: number;
    }
  | {
      track: "sponsor";
      units: number;
      years: number;
      months: number;
      kids: number;
      sp0: number;
      sp1: number;
      lit: number;
    }
  | {
      track: "kiswa";
      units: number;
      kids: number;
      spill: number;
      k0: number;
      k1: number;
      lit: number;
    };

/** ما يفعله المبلغ قبل دفعه. */
export function project(track: Track, amount: number, c: Region): Projection {
  const units = Math.floor(amount / TRACKS[track].unit);
  if (track === "qualify") {
    const kids = Math.min(units, gapOf(c));
    return {
      track,
      units,
      kids,
      spill: units - kids,
      groups: Math.floor(kids / 8),
      rest: kids % 8,
      gap0: gapOf(c),
      gap1: gapOf(c) - kids,
      lit: kids,
    };
  }
  if (track === "sponsor") {
    const years = Math.floor(units / 12);
    const months = units % 12;
    const kids = Math.min(c.need - c.sponsored, years + (months ? 1 : 0));
    return {
      track,
      units,
      years,
      months,
      kids,
      sp0: c.sponsored,
      sp1: c.sponsored + kids,
      lit: kids,
    };
  }
  const kids = Math.min(units, c.need - c.clothed);
  return {
    track,
    units,
    kids,
    spill: units - kids,
    k0: c.need - c.clothed,
    k1: c.need - c.clothed - kids,
    lit: kids,
  };
}

/** يطبّق دعماً مدفوعاً على المنطقة. */
export function apply(p: Projection, c: Region) {
  if (p.track === "qualify") c.qualified += p.kids;
  else if (p.track === "kiswa") c.clothed += p.kids;
  else c.sponsored += p.kids;
}
