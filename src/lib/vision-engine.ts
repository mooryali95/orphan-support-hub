/**
 * محرّك «منصّة الرؤية والتوجهات» — نظامٌ صغير كامل يربط الطبقات الثلاث:
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
import { findRate, operatingCurrency, UNIFIED_CURRENCY } from "@/lib/currency";

/**
 * the one currency every sample amount in this engine is kept in: the platform's unified
 * currency, the same one the impact hall writes its sample amounts in (`@/lib/hall/live`). A
 * payment simulated in the hall is recorded here as the same number, so it must read as the
 * same currency on every /vision page. Pages format through `useMoney` (`formatMoney`), never
 * with a currency written by hand (`vision-currency.test.ts`).
 */
export const VISION_CURRENCY = UNIFIED_CURRENCY;
/** the currency the Albania office is disbursed in: the country's operating currency */
export const OFFICE_CURRENCY = operatingCurrency("AL");

/** كلفة تأهيل يتيمٍ واحد لدورةٍ كاملة (ستّ جلسات ومستلزماتها)، بعملة المحرّك `VISION_CURRENCY` (رقمٌ نموذجي). */
export const COST_PER_ORPHAN = 600;
export const GROUP_SIZE = 9;
export const SESSIONS_PER_CYCLE = 6;
/** متوسّط ارتفاع السمة بعد دورةٍ مكتملة (من قياسات الرواد المنشورة). */
export const TRAIT_GAIN = 2;
/** sample rate for the disbursement to the Albania office: the platform's indicative seed rate */
export const OFFICE_RATE = findRate(VISION_CURRENCY, OFFICE_CURRENCY)?.rate ?? 1;

export type Method = "card" | "bank";
export type Layer = "support" | "operations" | "decision";

export type CityState = {
  id: string;
  name: T;
  /** أيتامٌ ينتظرون التأهيل في المدينة. */
  need: number;
  /** ما خُصِّص للمدينة كلّه (مجموعاتها ورصيدها الحرّ)، بعملة المحرّك. */
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

export type Track = "qualification" | "sponsorship" | "inkind";

/** كفالةٌ شهرية لطفلٍ بعينه، وكم شهراً سُلِّمت. */
export type Sponsorship = {
  child: string;
  group: string;
  donor: string;
  monthly: number;
  months: number;
};
/** حقائب/أجهزة لمجموعة، وهل سُلِّمت بإثبات. */
export type Kits = { group: string; donor: string; count: number; delivered: boolean };

/** سعر الحقيبة التعليمية (حقيبة + جهاز لوحي) في البيئة. */
export const KIT_PRICE = 300;
/** أثر كلّ مسارٍ في السمات (على مقياس 25) عند التسليم — توضيحيٌّ يُضبط مع منهج الرواد. */
export const TRACK_BOOST: Record<"sponsorship" | "inkind", Record<string, number>> = {
  sponsorship: { sumud: 0.6, dirayah: 0.3, himmah: 0.2 },
  inkind: { kifayat: 0.8, himmah: 0.4 },
};

export type Donation = {
  id: string;
  at: number;
  donor: string;
  amount: number;
  fee: number;
  net: number;
  method: Method;
  target: { kind: "city" | "group" | "child"; id: string };
  /** مسار الدعم: تأهيل (افتراضي)، أو كفالةٌ شهرية لطفل، أو تبرّعٌ عيني لمجموعة. */
  track?: Track;
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
  | "decision"
  | "month"
  | "sponsored"
  | "kitsPledged"
  | "delivered";

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
  /** الشهر منذ بداية البيئة (0 = نوفمبر 2026)، وسجلّ لقطاتٍ شهرية للمنحنيات. */
  month: number;
  history: Snapshot[];
  sponsorships: Sponsorship[];
  kits: Kits[];
  /** ارتفاعات السمات لكلّ طفل من الكفالة والعيني (معرّف الطفل ← مفتاح السمة ← قيمة). */
  boosts: Record<string, Record<string, number>>;
};

export type Snapshot = {
  month: number;
  pct: number;
  gap: number;
  measured: number;
  fundedGroups: number;
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
  // تاريخٌ قبل البيئة: ما أكمل دورته الستّ قِيس فعلاً (إلا تيرانا 1، تُقاس في الجولة).
  for (const g of groups) {
    if (g.id !== "demo-g-tirana-1" && g.funded > 0 && g.sessionsDone >= SESSIONS_PER_CYCLE) {
      g.after = +(g.before + TRAIT_GAIN - (g.members % 3) * 0.2).toFixed(1);
    }
  }
  const base: VisionState = {
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
    month: 0,
    history: [],
    sponsorships: [],
    kits: [],
    boosts: {},
  };
  // ستّة أشهرٍ سابقة تقريبية — منحنى يبدأ من مكانٍ معقول لا من نقطةٍ وحيدة.
  const now = snapshot(base);
  base.history = Array.from({ length: 6 }, (_, i) => {
    const back = 5 - i;
    return {
      month: -back,
      pct: Math.max(0, now.pct - back * 3),
      gap: now.gap + back * 7,
      measured: Math.max(0, now.measured - back * 9),
      fundedGroups: Math.max(0, now.fundedGroups - Math.ceil(back / 2)),
    };
  });
  return base;
}

export function snapshot(s: VisionState): Snapshot {
  const t = totals(s);
  return {
    month: s.month,
    pct: t.pct,
    gap: t.gap,
    measured: t.measured,
    fundedGroups: t.fundedGroups,
  };
}

/** الداعمون الشهريون في البيئة: ثلاثة كفلاء ثابتون يدعمون أكبر فجوةٍ كلّ شهر. */
export const MONTHLY_DONORS = ["كافلٌ شهري 1", "كافلٌ شهري 2", "كافلٌ شهري 3"];
export const MONTHLY_AMOUNT = 1500;

/* ── القراءة: ما تراه لوحة القرار ──────────────────────────────────── */

export function cityNeedMoney(c: CityState) {
  return c.need * COST_PER_ORPHAN;
}
export function fundingPct(c: CityState) {
  return Math.round((c.funded / cityNeedMoney(c)) * 100);
}
/** الفجوة بالأيتام: من لم يُغطَّ تأهيلهم بعد. الفائض لا فجوة له. */
export function gapOrphans(c: CityState) {
  return Math.max(0, Math.ceil((cityNeedMoney(c) - c.funded) / COST_PER_ORPHAN));
}
export function surplusSar(c: CityState) {
  return Math.max(0, c.funded - cityNeedMoney(c));
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
  const need = s.cities.reduce((a, c) => a + cityNeedMoney(c), 0);
  const funded = s.cities.reduce((a, c) => a + Math.min(c.funded, cityNeedMoney(c)), 0);
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
    sponsored: (s.sponsorships ?? []).length,
    sponsorshipMonthly: (s.sponsorships ?? []).reduce((a, x) => a + x.monthly, 0),
    kitsDelivered: (s.kits ?? []).filter((k) => k.delivered).reduce((a, k) => a + k.count, 0),
    kitsPending: (s.kits ?? []).filter((k) => !k.delivered).reduce((a, k) => a + k.count, 0),
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
  | { type: "advanceMonth"; at: number }
  | { type: "sponsor"; donor: string; child: string; group: string; monthly: number; at: number }
  | { type: "deliverSponsorship"; child: string; at: number }
  | { type: "inkind"; donor: string; group: string; count: number; at: number }
  | { type: "deliverKits"; group: string; at: number }
  | { type: "scenario"; scenario: Scenario; at: number }
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
    eur: Math.round(d.net * OFFICE_RATE),
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

/** قيدٌ مباشر لدعمٍ بلا تخصيصٍ لمجموعة (الكفالة والعيني): بطاقةٌ تُقيَّد فوراً بفاتورتها. */
function recordDirect(
  s: VisionState,
  at: number,
  donor: string,
  amount: number,
  target: Donation["target"],
  track: Track,
) {
  const fee = Math.round(amount * s.feePercent) / 100;
  s.seq += 1;
  const d: Donation = {
    id: `demo-d-${s.seq}`,
    at,
    donor: donor.trim().slice(0, 40) || "—",
    amount,
    fee,
    net: +(amount - fee).toFixed(2),
    method: "card",
    target,
    track,
    invoice: "",
    status: "settled",
  };
  s.invoiceSeq += 1;
  d.invoice = `DEMO-INV-2026-${String(s.invoiceSeq).padStart(4, "0")}`;
  s.donations.unshift(d);
  ev(s, at, "support", "donation", {
    amount,
    donor: d.donor,
    target: target.id,
    method: "card",
    id: d.id,
  });
  ev(s, at, "support", "settled", { amount, fee, net: d.net, invoice: d.invoice, method: "card" });
  return d;
}

function boost(s: VisionState, child: string, by: Record<string, number>) {
  const cur = { ...(s.boosts[child] ?? {}) };
  for (const [k, v] of Object.entries(by)) cur[k] = +Math.min(4, (cur[k] ?? 0) + v).toFixed(1);
  s.boosts = { ...s.boosts, [child]: cur };
}

export function reduce(prev: VisionState, a: Action): VisionState {
  if (a.type === "reset") return seed();
  const s: VisionState = structuredClone(prev);
  switch (a.type) {
    case "sponsor": {
      const monthly = Math.round(a.monthly);
      if (!(monthly >= 50 && monthly <= 10_000) || !s.groups.some((g) => g.id === a.group))
        return prev;
      const d = recordDirect(
        s,
        a.at,
        a.donor,
        monthly,
        { kind: "child", id: a.child },
        "sponsorship",
      );
      s.sponsorships = [
        ...s.sponsorships.filter((x) => x.child !== a.child),
        { child: a.child, group: a.group, donor: d.donor, monthly, months: 0 },
      ];
      ev(s, a.at, "operations", "sponsored", {
        child: a.child,
        group: a.group,
        monthly,
        invoice: d.invoice,
      });
      return s;
    }
    case "deliverSponsorship": {
      const sp = s.sponsorships.find((x) => x.child === a.child);
      if (!sp) return prev;
      s.sponsorships = s.sponsorships.map((x) =>
        x.child === a.child ? { ...x, months: x.months + 1 } : x,
      );
      boost(s, a.child, TRACK_BOOST.sponsorship);
      ev(s, a.at, "operations", "delivered", {
        kind: "sponsorship",
        child: a.child,
        group: sp.group,
        month: sp.months + 1,
      });
      return s;
    }
    case "inkind": {
      const count = Math.round(a.count);
      if (!(count >= 1 && count <= 500) || !s.groups.some((g) => g.id === a.group)) return prev;
      const d = recordDirect(
        s,
        a.at,
        a.donor,
        count * KIT_PRICE,
        { kind: "group", id: a.group },
        "inkind",
      );
      s.kits = [...s.kits, { group: a.group, donor: d.donor, count, delivered: false }];
      ev(s, a.at, "operations", "kitsPledged", { group: a.group, count, invoice: d.invoice });
      return s;
    }
    case "deliverKits": {
      const k = s.kits.find((x) => x.group === a.group && !x.delivered);
      const g = s.groups.find((x) => x.id === a.group);
      if (!k || !g) return prev;
      s.kits = s.kits.map((x) => (x === k ? { ...x, delivered: true } : x));
      for (let i = 1; i <= g.members; i++) boost(s, `${g.id}-c${i}`, TRACK_BOOST.inkind);
      ev(s, a.at, "operations", "delivered", { kind: "inkind", group: a.group, count: k.count });
      return s;
    }
    case "scenario":
      return applyScenario(prev, a.scenario, a.at);
    case "advanceMonth": {
      let n: VisionState = s;
      // 1) الكفلاء الشهريون يدعمون أكبر فجوة.
      const top = ranked(n)[0];
      if (top && top.gap > 0) {
        for (const donor of MONTHLY_DONORS) {
          n = reduce(n, {
            type: "donate",
            donor,
            amount: MONTHLY_AMOUNT,
            method: "card",
            target: { kind: "city", id: top.id },
            at: a.at,
          });
        }
      }
      // 2) التشغيل: كلّ مجموعةٍ مموّلة تعقد جلستين، وما أتمّ دورته يُقاس.
      for (const g of n.groups) {
        if (!isFunded(g) || g.after !== null) continue;
        if (g.sessionsDone >= SESSIONS_PER_CYCLE) {
          n = reduce(n, { type: "measure", group: g.id, at: a.at });
        } else {
          for (
            let k = 0;
            k < 2 && (n.groups.find((x) => x.id === g.id)?.sessionsDone ?? 6) < SESSIONS_PER_CYCLE;
            k++
          ) {
            n = reduce(n, { type: "session", group: g.id, at: a.at });
          }
        }
      }
      n = n === s ? structuredClone(s) : n;
      n.month = s.month + 1;
      ev(n, a.at, "decision", "month", { month: n.month });
      n.history = [...n.history, snapshot(n)].slice(-24);
      return n;
    }
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

/* ── «ماذا لو»: ميزانيةٌ افتراضية يُرى أثرها قبل اعتمادها ─────────── */

export type Strategy = "gap" | "even" | "city";
export type Scenario = { amount: number; strategy: Strategy; city?: string };
export const DECISION_FUND = "صندوق القرار";

/** توزيع الميزانية على المدن: كلّها لأكبر فجوة، أو بنسبة الفجوات، أو لمدينةٍ بعينها. */
export function planOf(s: VisionState, sc: Scenario): Array<{ city: string; amount: number }> {
  const amount = Math.max(0, Math.round(sc.amount));
  if (!amount) return [];
  const r = ranked(s);
  // لا تُعطى مدينةٌ فوق فجوتها: ما زاد يبقى في الصندوق («غير مخصّص»).
  const cap = (id: string) => {
    const c = s.cities.find((x) => x.id === id);
    return c ? Math.max(0, cityNeedMoney(c) - c.funded) : 0;
  };
  if (sc.strategy === "city" && sc.city) {
    const v = Math.min(amount, cap(sc.city));
    return v >= 10 ? [{ city: sc.city, amount: v }] : [];
  }
  if (sc.strategy === "gap") {
    // من الأكبر فجوةً إلى ما يليها، حتى تنفد الميزانية.
    const out: Array<{ city: string; amount: number }> = [];
    let left = amount;
    for (const c of r) {
      if (left < 10) break;
      const v = Math.min(left, cap(c.id));
      if (v >= 10) out.push({ city: c.id, amount: v });
      left -= v;
    }
    return out;
  }
  const gaps = r.filter((c) => c.gap > 0);
  const total = gaps.reduce((a, c) => a + c.gap, 0);
  if (!total) return [];
  return gaps
    .map((c) => ({ city: c.id, amount: Math.min(cap(c.id), Math.round((amount * c.gap) / total)) }))
    .filter((x) => x.amount >= 10);
}

function fund(s: VisionState, plan: Array<{ city: string; amount: number }>, at: number) {
  let n = s;
  for (const p of plan) {
    n = reduce(n, {
      type: "donate",
      donor: DECISION_FUND,
      amount: p.amount,
      method: "bank",
      target: { kind: "city", id: p.city },
      at,
    });
    n = reduce(n, { type: "confirmTransfer", id: n.donations[0]!.id, at });
  }
  return n;
}

/** يحاكي الخطّة على نسخةٍ ولا يمسّ الحال: الأرقام بعدها، وكم شهراً حتى تُغلق الفجوة. */
export function whatIf(s: VisionState, sc: Scenario, horizon = 24) {
  const plan = planOf(s, sc);
  const after = fund(s, plan, 0);
  const months = (start: VisionState) => {
    let n = start;
    for (let m = 1; m <= horizon; m++) {
      n = reduce(n, { type: "advanceMonth", at: 0 });
      if (totals(n).gap === 0) return m;
    }
    return null;
  };
  return {
    plan,
    unused: Math.max(0, Math.round(sc.amount) - plan.reduce((a, p) => a + p.amount, 0)),
    now: totals(s),
    next: totals(after),
    cities: after.cities.map((c) => ({
      id: c.id,
      before: fundingPct(s.cities.find((x) => x.id === c.id)!),
      after: fundingPct(c),
    })),
    monthsNow: months(s),
    monthsNext: months(after),
  };
}

/** اعتماد السيناريو: تُنفَّذ الخطّة على الحال الحقيقية في البيئة، وتُسجَّل قراراً. */
export function applyScenario(s: VisionState, sc: Scenario, at: number) {
  const plan = planOf(s, sc);
  if (!plan.length) return s;
  const n = fund(s, plan, at);
  ev(n, at, "decision", "decision", {
    kind: "scenario",
    city: plan[0]!.city,
    group: "",
    amount: plan.reduce((a, p) => a + p.amount, 0),
    gap: 0,
  });
  return n;
}
