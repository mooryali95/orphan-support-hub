/**
 * محرّك «منصة الرؤية والتوجهات» — نظامٌ صغير كامل يربط الطبقات الثلاث:
 *
 *   الدعم ── تبرّع ──▶ حساب الندوة ── تخصيص ──▶ مدينة/مجموعة (التشغيل)
 *   التشغيل ── جلسات وقياس ──▶ أثر يعود للداعم
 *   القرار ── يقرأ المجاميع فقط ──▶ فجوات وترتيب وتوصيات ──▶ قرارٌ يُطبَّق
 *
 * حسابٌ خالص: لا DOM ولا شبكة ولا مال حقيقي. الحالة تُحفظ في المتصفّح
 * (بيئة تجريبية)، وكلّ فعلٍ يكتب حدثاً في السجلّ كما ستكتبه القاعدة حين
 * يتّصل التكامل. المعرّفات وصفية (`demo-…`) ولا تصلح لدفعٍ أو صرف.
 */
import { ALBANIA, GROUPS, SYSTEM, TRAITS, type T } from "@/data/vision-demo";

/** كلفة تأهيل يتيمٍ واحد لدورةٍ كاملة (ستّ جلسات ومستلزماتها)، بالريال. */
export const COST_PER_ORPHAN = 600;
export const GROUP_SIZE = 9;
export const SESSIONS_PER_CYCLE = 6;
/** متوسّط ارتفاع السمة بعد دورةٍ مكتملة (من قياسات الرواد المنشورة). */
export const TRAIT_GAIN = 2;
/** تحويل الريال إلى اليورو للصرف إلى مكتب ألبانيا (افتراضٌ ثابت). */
export const SAR_TO_EUR = 0.245;

export type Method = "card" | "bank";
export type Layer = "support" | "operations" | "decision";

export type CityState = {
  id: string;
  name: T;
  /** أيتامٌ ينتظرون التأهيل في المدينة. */
  need: number;
  /** ما خُصِّص للمدينة كلّه (مجموعاتها ورصيدها الحرّ)، بالريال. */
  funded: number;
  /** رصيدٌ حرّ لم يُربط بمجموعةٍ بعد. */
  pool: number;
};

export type GroupState = {
  id: string;
  name: T;
  city: string;
  members: number;
  funded: number;
  sessionsDone: number;
  /** متوسّط السمة قبل الدورة، وبعدها حين تُقاس. */
  before: number;
  after: number | null;
  /** أُنشئت بقرارٍ من لوحة القرار. */
  fromDecision?: boolean;
};

export type Donation = {
  id: string;
  at: number;
  donor: string;
  amount: number;
  fee: number;
  net: number;
  method: Method;
  target: { kind: "city" | "group"; id: string };
  invoice: string;
  status: "pending" | "settled";
};

export type EventKind =
  | "donation"
  | "pending"
  | "settled"
  | "allocated"
  | "disbursed"
  | "session"
  | "cycleDone"
  | "measured"
  | "decision";

export type VisionEvent = {
  id: string;
  at: number;
  layer: Layer;
  kind: EventKind;
  /** معاملات النصّ (تُصاغ في الواجهة بلغتها). */
  args: Record<string, string | number>;
};

export type VisionState = {
  v: 1;
  seq: number;
  invoiceSeq: number;
  feePercent: number;
  cities: CityState[];
  groups: GroupState[];
  donations: Donation[];
  events: VisionEvent[];
  /** قراراتٌ طُبّقت (بمفتاح التوصية) فلا تتكرّر. */
  applied: string[];
  measured: number;
};

const groupCost = (members: number) => members * COST_PER_ORPHAN;

/* ── البذرة: الحال الابتدائية مطابقةٌ لأرقام العرض ─────────────────── */

export function seed(): VisionState {
  const cities: CityState[] = ALBANIA.map((c) => ({
    id: c.id,
    name: c.name,
    need: c.need,
    funded: Math.round((c.need * COST_PER_ORPHAN * c.funded) / 100),
    pool: 0,
  }));
  // مجموعات العرض المفصّلة، ثم تكملة كلّ مدينة إلى عدد مجموعاتها.
  const groups: GroupState[] = GROUPS.map((g, i) => ({
    id: g.id,
    name: g.name,
    city: g.city,
    members: g.members,
    funded: g.funded ? groupCost(g.members) : 0,
    sessionsDone: g.sessionsDone,
    before: TRAITS[0]!.before - (i % 3) * 0.3,
    after: null,
  }));
  // خمس مجموعاتٍ غير ممولة (14 من 19) — كما في لوحة القرار.
  const unfunded = new Set(["tirana-3", "tirana-4", "berat-1", "korce-2"]);
  for (const c of ALBANIA) {
    const have = groups.filter((g) => g.city === c.id).length;
    for (let n = have + 1; n <= c.groups; n++) {
      const key = `${c.id}-${n}`;
      const members = GROUP_SIZE - (n % 2);
      groups.push({
        id: `demo-g-${key}`,
        name: { ar: `مجموعة ${c.name.ar} ${n}`, en: `${c.name.en} group ${n}` },
        city: c.id,
        members,
        funded: unfunded.has(key) ? 0 : groupCost(members),
        sessionsDone: unfunded.has(key) ? 0 : (n * 2) % (SESSIONS_PER_CYCLE + 1),
        before: 15.5 + (n % 4) * 0.4,
        after: null,
      });
    }
  }
  return {
    v: 1,
    seq: 0,
    invoiceSeq: 0,
    feePercent: 5,
    cities,
    groups,
    donations: [],
    events: [],
    applied: [],
    measured: SYSTEM.measured,
  };
}

/* ── القراءة: ما تراه لوحة القرار ──────────────────────────────────── */

export function cityNeedSar(c: CityState) {
  return c.need * COST_PER_ORPHAN;
}
export function fundingPct(c: CityState) {
  return Math.round((c.funded / cityNeedSar(c)) * 100);
}
/** الفجوة بالأيتام: من لم يُغطَّ تأهيلهم بعد. الفائض لا فجوة له. */
export function gapOrphans(c: CityState) {
  return Math.max(0, Math.ceil((cityNeedSar(c) - c.funded) / COST_PER_ORPHAN));
}
export function surplusSar(c: CityState) {
  return Math.max(0, c.funded - cityNeedSar(c));
}
export function isFunded(g: GroupState) {
  return g.funded >= groupCost(g.members);
}
export function groupCostOf(g: GroupState) {
  return groupCost(g.members);
}

export function ranked(s: VisionState) {
  return s.cities
    .map((c) => ({ ...c, pct: fundingPct(c), gap: gapOrphans(c), surplus: surplusSar(c) }))
    .sort((a, b) => b.gap - a.gap || a.pct - b.pct);
}

export function totals(s: VisionState) {
  const need = s.cities.reduce((a, c) => a + cityNeedSar(c), 0);
  const funded = s.cities.reduce((a, c) => a + Math.min(c.funded, cityNeedSar(c)), 0);
  const settled = s.donations.filter((d) => d.status === "settled");
  return {
    need,
    funded,
    pct: Math.round((funded / need) * 100),
    gap: s.cities.reduce((a, c) => a + gapOrphans(c), 0),
    groups: s.groups.length,
    fundedGroups: s.groups.filter(isFunded).length,
    sessions: s.groups.reduce((a, g) => a + g.sessionsDone, 0),
    raised: settled.reduce((a, d) => a + d.amount, 0),
    net: settled.reduce((a, d) => a + d.net, 0),
    fees: settled.reduce((a, d) => a + d.fee, 0),
    pending: s.donations.filter((d) => d.status === "pending").reduce((a, d) => a + d.amount, 0),
    donors: new Set(settled.map((d) => d.donor)).size,
    measured: s.measured,
  };
}

export type Recommendation = {
  key: string;
  kind: "campaign" | "newGroup" | "redirect" | "fundGroup";
  city: string;
  group?: string;
  /** أرقام التعليل. */
  gap?: number;
  pct?: number;
  amount?: number;
  /** أولويةٌ للترتيب: الأعلى أوّلاً. */
  weight: number;
};

/**
 * التوصيات تُشتقّ من الأرقام لا تُكتب يدوياً:
 * - «افتح مجموعة» حين يكفي رصيد المدينة الحرّ لمجموعةٍ وفيها فجوة؛
 * - «موّل مجموعة» لمجموعةٍ قائمةٍ تنتظر التمويل في أكبر المدن فجوة؛
 * - «حملة» لأكبر فجوةٍ (عشرة أيتام فأكثر)؛
 * - «أعد التوجيه» حين يتجاوز التمويل الحاجة.
 */
export function recommend(s: VisionState): Recommendation[] {
  const out: Recommendation[] = [];
  const r = ranked(s);
  for (const c of r) {
    const waiting =
      c.need - s.groups.filter((g) => g.city === c.id).reduce((a, g) => a + g.members, 0);
    if (c.pool >= groupCost(GROUP_SIZE) && waiting > 0) {
      out.push({
        key: `newGroup:${c.id}:${s.groups.length}`,
        kind: "newGroup",
        city: c.id,
        gap: waiting,
        amount: groupCost(GROUP_SIZE),
        weight: 300 + c.gap,
      });
    }
    if (c.surplus > 0) {
      const to = r.find((x) => x.gap > 0);
      if (to)
        out.push({
          key: `redirect:${c.id}:${to.id}:${c.surplus}`,
          kind: "redirect",
          city: c.id,
          group: to.id,
          amount: c.surplus,
          weight: 200 + c.surplus / 100,
        });
    }
  }
  const top = r[0];
  if (top && top.gap >= 10) {
    out.push({
      key: `campaign:${top.id}:${top.gap}`,
      kind: "campaign",
      city: top.id,
      gap: top.gap,
      pct: top.pct,
      amount: top.gap * COST_PER_ORPHAN,
      weight: 100 + top.gap,
    });
  }
  const waitingGroup = s.groups
    .filter((g) => !isFunded(g))
    .map((g) => ({ g, gap: gapOrphans(s.cities.find((c) => c.id === g.city)!) }))
    .sort((a, b) => b.gap - a.gap)[0];
  if (waitingGroup) {
    out.push({
      key: `fundGroup:${waitingGroup.g.id}`,
      kind: "fundGroup",
      city: waitingGroup.g.city,
      group: waitingGroup.g.id,
      amount: groupCostOf(waitingGroup.g) - waitingGroup.g.funded,
      weight: 150 + waitingGroup.gap,
    });
  }
  return out.filter((x) => !s.applied.includes(x.key)).sort((a, b) => b.weight - a.weight);
}

/* ── الأفعال ───────────────────────────────────────────────────────── */

export type Action =
  | {
      type: "donate";
      donor: string;
      amount: number;
      method: Method;
      target: { kind: "city" | "group"; id: string };
      at: number;
    }
  | { type: "confirmTransfer"; id: string; at: number }
  | { type: "session"; group: string; at: number }
  | { type: "measure"; group: string; at: number }
  | { type: "apply"; key: string; at: number }
  | { type: "setFee"; pct: number }
  | { type: "reset" };

function ev(s: VisionState, at: number, layer: Layer, kind: EventKind, args: VisionEvent["args"]) {
  s.seq += 1;
  s.events.unshift({ id: `demo-e-${s.seq}`, at, layer, kind, args });
  if (s.events.length > 200) s.events.length = 200;
}

/** يُخصِّص الصافي: للمجموعة المختارة، أو لأوّل مجموعةٍ تنتظر في المدينة، والباقي رصيدٌ حرّ. */
function allocate(s: VisionState, d: Donation, at: number) {
  let left = d.net;
  const city = s.cities.find((c) =>
    d.target.kind === "city"
      ? c.id === d.target.id
      : c.id === s.groups.find((g) => g.id === d.target.id)?.city,
  );
  if (!city) return;
  const queue =
    d.target.kind === "group"
      ? s.groups.filter((g) => g.id === d.target.id)
      : s.groups.filter((g) => g.city === city.id && !isFunded(g));
  for (const g of queue) {
    const want = Math.max(0, groupCostOf(g) - g.funded);
    const take = Math.min(want, left);
    if (take <= 0) continue;
    g.funded += take;
    left -= take;
    ev(s, at, "operations", "allocated", {
      group: g.id,
      amount: Math.round(take),
      full: isFunded(g) ? 1 : 0,
      invoice: d.invoice,
    });
  }
  if (left > 0) {
    city.pool += left;
    ev(s, at, "operations", "allocated", {
      city: city.id,
      amount: Math.round(left),
      pool: 1,
      invoice: d.invoice,
    });
  }
  city.funded += d.net;
  ev(s, at, "operations", "disbursed", {
    city: city.id,
    eur: Math.round(d.net * SAR_TO_EUR),
    invoice: d.invoice,
  });
}

function settle(s: VisionState, d: Donation, at: number) {
  d.status = "settled";
  s.invoiceSeq += 1;
  d.invoice = `DEMO-INV-2026-${String(s.invoiceSeq).padStart(4, "0")}`;
  ev(s, at, "support", "settled", {
    amount: d.amount,
    fee: d.fee,
    net: d.net,
    invoice: d.invoice,
    method: d.method,
  });
  allocate(s, d, at);
}

export function reduce(prev: VisionState, a: Action): VisionState {
  if (a.type === "reset") return seed();
  const s: VisionState = structuredClone(prev);
  switch (a.type) {
    case "setFee":
      s.feePercent = Math.min(15, Math.max(0, a.pct));
      return s;
    case "donate": {
      const amount = Math.round(a.amount);
      if (!(amount >= 10 && amount <= 1_000_000)) return prev;
      const fee = a.method === "card" ? Math.round(amount * s.feePercent) / 100 : 0;
      s.seq += 1;
      const d: Donation = {
        id: `demo-d-${s.seq}`,
        at: a.at,
        donor: a.donor.trim().slice(0, 40) || "—",
        amount,
        fee,
        net: +(amount - fee).toFixed(2),
        method: a.method,
        target: a.target,
        invoice: "",
        status: "pending",
      };
      s.donations.unshift(d);
      ev(s, a.at, "support", a.method === "bank" ? "pending" : "donation", {
        amount,
        donor: d.donor,
        target: a.target.id,
        method: a.method,
        id: d.id,
      });
      // البطاقة: حدثٌ موقَّع يُقيَّد فوراً. التحويل: ينتظر مطابقة المسؤول.
      if (a.method === "card") settle(s, d, a.at);
      return s;
    }
    case "confirmTransfer": {
      const d = s.donations.find((x) => x.id === a.id && x.status === "pending");
      if (!d) return prev;
      settle(s, d, a.at);
      return s;
    }
    case "session": {
      const g = s.groups.find((x) => x.id === a.group);
      if (!g || !isFunded(g) || g.sessionsDone >= SESSIONS_PER_CYCLE) return prev;
      g.sessionsDone += 1;
      ev(s, a.at, "operations", g.sessionsDone === SESSIONS_PER_CYCLE ? "cycleDone" : "session", {
        group: g.id,
        n: g.sessionsDone,
        of: SESSIONS_PER_CYCLE,
      });
      return s;
    }
    case "measure": {
      const g = s.groups.find((x) => x.id === a.group);
      if (!g || g.sessionsDone < SESSIONS_PER_CYCLE || g.after !== null) return prev;
      g.after = +(g.before + TRAIT_GAIN - (g.members % 3) * 0.2).toFixed(1);
      s.measured += g.members;
      const city = s.cities.find((c) => c.id === g.city)!;
      // من أتمّ التأهيل يخرج من الحاجة، ومعه كلفته.
      const done = Math.min(g.members, city.need);
      city.need -= done;
      city.funded = Math.max(0, city.funded - done * COST_PER_ORPHAN);
      ev(s, a.at, "operations", "measured", {
        group: g.id,
        before: g.before,
        after: g.after,
        members: g.members,
      });
      ev(s, a.at, "decision", "measured", { city: city.id, measured: s.measured });
      return s;
    }
    case "apply": {
      const rec = recommend(s).find((r) => r.key === a.key);
      if (!rec) return prev;
      s.applied.push(rec.key);
      const city = s.cities.find((c) => c.id === rec.city)!;
      if (rec.kind === "newGroup") {
        const n = s.groups.filter((g) => g.city === city.id).length + 1;
        city.pool -= groupCost(GROUP_SIZE);
        s.groups.push({
          id: `demo-g-${city.id}-${n}-d`,
          name: { ar: `مجموعة ${city.name.ar} ${n}`, en: `${city.name.en} group ${n}` },
          city: city.id,
          members: GROUP_SIZE,
          funded: groupCost(GROUP_SIZE),
          sessionsDone: 0,
          before: 15.8,
          after: null,
          fromDecision: true,
        });
      } else if (rec.kind === "redirect" && rec.group) {
        const to = s.cities.find((c) => c.id === rec.group)!;
        const amt = Math.min(rec.amount ?? 0, city.funded);
        city.funded -= amt;
        city.pool = Math.max(0, city.pool - amt);
        to.funded += amt;
        to.pool += amt;
      }
      ev(s, a.at, "decision", "decision", {
        kind: rec.kind,
        city: rec.city,
        group: rec.group ?? "",
        amount: rec.amount ?? 0,
        gap: rec.gap ?? 0,
      });
      return s;
    }
  }
}

/** يقبل الحالة المحفوظة فقط إن كانت بشكلها المتوقَّع، وإلا يبدأ من البذرة. */
export function revive(raw: unknown): VisionState {
  const x = raw as Partial<VisionState> | null;
  if (
    !x ||
    x.v !== 1 ||
    !Array.isArray(x.cities) ||
    !Array.isArray(x.groups) ||
    !Array.isArray(x.events) ||
    !Array.isArray(x.donations)
  ) {
    return seed();
  }
  return { ...seed(), ...x } as VisionState;
}
