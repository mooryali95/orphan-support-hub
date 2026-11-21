/**
 * «ادعم بنوعه ونطاقه» في وضع التجربة: تعهّد تأهيلٍ أو تعهّدٌ عيني لطفلٍ أو مجموعةٍ أو منطقةٍ
 * أو دولة، من الخريطة. الأطفال من `try-demo` وأماكنهم وأعدادها من `try-places`، مصدرٌ واحد لكل حقيقة؛ وهنا
 * التعهّدات (تُحفظ في متصفّح الزائر وحده، ولا يُرسل شيءٌ إلى الخادم) وما يُقرأ منها.
 *
 * دوالّ القراءة تعيد صفوف الخادم نفسها: `tryMyPledges` بشكل `my_pledges()`، و
 * `tryOrphanQualification` بشكل `orphan_qualification()`؛ ثم تبنيها `support-impact` مناظر
 * كما ستبني القيود الحقيقية. فالانتقال إلى الحيّ تبديل مصدرٍ لا تبديل منظر.
 *
 * المجاميع مجموع أجزائها دائماً: المنطقة أطفالها واحداً واحداً، والمجموعة أوّل ثمانيةٍ منهم،
 * والدولة منطقتاها؛ وطفل التجربة أوّل أطفال منطقته، فرحلته هي رحلة أوّلهم.
 */
import { tryStore, type TryStore } from "@/lib/try-store";
import type { MapStats } from "@/components/map/demo-stats";
import { countryName } from "@/lib/countries";
import { addMonths } from "@/lib/impact-evidence";
import type { Locale } from "@/lib/locale";
import { monthsBetween } from "@/lib/my-impact";
import {
  cohortSafe,
  IMPACT_COHORT_MIN,
  inKindFromPledges,
  journeyFromQualification,
  pledgeCard,
  type AreaDevelopment,
  type InKindImpact,
  type PledgeCard,
  type PledgeRow,
  type QualificationImpact,
  type QualificationRow,
  type SupportKind,
  type TraitMovement,
} from "@/lib/support-impact";
import { localTryChild, TRY_EVENT, tryChild, type TryGift } from "@/lib/try-demo";
import {
  placeChildren,
  TRY_PLACES,
  TRY_SESSIONS,
  TRY_TRAITS,
  tryChildIn,
  tryGroupName,
  tryPlace,
  tryProgramName,
  tryRegionName,
  tryRegionOfChild,
  tryTraitName,
  type TryRegion,
} from "@/lib/try-places";

export type TryScope = "orphan" | "group" | "region" | "country";

export const TRY_KINDS: readonly SupportKind[] = ["qualification", "in_kind"];
export const TRY_SCOPES: readonly TryScope[] = ["orphan", "group", "region", "country"];

export const TRY_SUPPORT_COUNTRIES: ReadonlySet<string> = new Set(TRY_PLACES.map((p) => p.co));

/** the sample region the map card stands on, by the name the map reports for it */
export const tryRegionByName = (co: string, name: string | null | undefined) =>
  name ? tryPlace(co)?.regions.find((r) => r.en === name) : undefined;

/**
 * the map's figures for the trial, from `TRY_PLACES`: each region's children, and the country
 * as their sum. No funding split and no gap: the trial does not invent a need for a place.
 */
export function tryMapStats(): MapStats {
  const count = (total: number) => ({
    total,
    sponsored: null,
    small: false,
    gap: null,
    currency: null,
    delivered: null,
  });
  return Object.fromEntries(
    TRY_PLACES.map((p) => [
      p.co,
      {
        value: p.co,
        ...count(placeChildren(p)),
        regions: Object.fromEntries(
          p.regions.map((r) => [r.en, { value: r.en, ...count(r.children) }]),
        ),
      },
    ]),
  );
}

export type TryTarget = {
  scope: TryScope;
  /** a trial child id, a DEMO- group id, a map region id, or a country code */
  target: string;
  co: string;
};

/**
 * the children a target stands on, as slices of the source's regions: `[region, howMany]`,
 * always counted from the region's first child. Empty when the target is not in the source.
 */
function slices(t: TryTarget): Array<[TryRegion, number]> {
  const p = tryPlace(t.co);
  if (!p) return [];
  if (t.scope === "orphan") {
    const k = tryChild(t.target);
    const r = k && k.co === t.co ? tryRegionOfChild(k) : undefined;
    return r ? [[r, 1]] : [];
  }
  if (t.scope === "group") {
    return p.group.id === t.target ? [[p.regions[0], p.group.children]] : [];
  }
  if (t.scope === "region") {
    const r = p.regions.find((x) => x.id === t.target);
    return r ? [[r, r.children]] : [];
  }
  return t.target === t.co ? p.regions.map((r): [TryRegion, number] => [r, r.children]) : [];
}

/** sample: how many children the target's aggregate stands on (1 for a child) */
export const targetChildren = (t: TryTarget) => slices(t).reduce((a, [, n]) => a + n, 0);

/** the target exists in the trial's own fictional catalogue */
export const validTarget = (t: TryTarget) => targetChildren(t) > 0;

/** the target as the donor reads it, and the country it stands in when the label does not say */
export function targetLabel(
  t: TryTarget,
  locale: Locale,
): { label: string; place: string | null; code?: string } {
  const country = countryName(t.co, locale);
  if (t.scope === "orphan") {
    const k = tryChild(t.target);
    const c = k ? localTryChild(k, locale) : undefined;
    return { label: c?.name ?? t.target, place: country, ...(c ? { code: c.code } : {}) };
  }
  if (t.scope === "group") {
    return { label: tryGroupName(t.target, locale), place: country, code: t.target };
  }
  if (t.scope === "region") return { label: tryRegionName(t.target, locale), place: country };
  return { label: country, place: null };
}

export type TryPledge = TryTarget & {
  id: string;
  kind: SupportKind;
  /** the monthly amount as typed, in the chosen currency; never converted */
  amount: number;
  currency: string;
  at: string;
};

const KEY = "try-support:v1";

type Store = TryStore;
/* the browser's store, or this tab's memory when the browser denies it (see `try-store`) */
const safe = (): Store | null => tryStore();

const clean = (v: unknown): TryPledge | null => {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  const kind = p["kind"] as SupportKind;
  const scope = p["scope"] as TryScope;
  const amount = Number(p["amount"]);
  const currency = String(p["currency"] ?? "");
  const at = String(p["at"] ?? "");
  const t: TryTarget = { scope, target: String(p["target"] ?? ""), co: String(p["co"] ?? "") };
  if (!TRY_KINDS.includes(kind) || !TRY_SCOPES.includes(scope) || !validTarget(t)) return null;
  if (!(amount > 0) || !Number.isFinite(amount) || !/^[A-Z]{3}$/.test(currency)) return null;
  if (typeof p["id"] !== "string" || Number.isNaN(Date.parse(at))) return null;
  return { ...t, id: p["id"], kind, amount, currency, at };
};

/** the stored pledges: only those whose target is in the source, one per id */
export function loadPledges(store: Pick<Storage, "getItem"> | null = safe()): TryPledge[] {
  try {
    const v = JSON.parse(store?.getItem(KEY) ?? "[]");
    const seen = new Set<string>();
    return Array.isArray(v)
      ? v.flatMap((x) => {
          const p = clean(x);
          if (!p || seen.has(p.id)) return [];
          seen.add(p.id);
          return [p];
        })
      : [];
  } catch {
    return [];
  }
}

/** records a simulated pledge in this browser; returns null when the target is not a trial one */
export function addPledge(
  pledge: Omit<TryPledge, "id" | "at">,
  store: Store | null = safe(),
  now: Date = new Date(),
): TryPledge | null {
  const before = loadPledges(store);
  let stamp = now.getTime();
  while (before.some((x) => x.id === `DEMO-PLG-${stamp}`)) stamp += 1;
  const p = clean({ ...pledge, id: `DEMO-PLG-${stamp}`, at: now.toISOString() });
  if (!p) return null;
  try {
    store?.setItem(KEY, JSON.stringify([p, ...before].slice(0, 20)));
  } catch {
    /* storage blocked: the pledge still shows on this page */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TRY_EVENT));
  return p;
}

export function resetPledges(store: Store | null = safe()) {
  try {
    store?.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TRY_EVENT));
}

/* ── the simulation: what the record would hold `m` whole months after the pledge ── */

/** sample pace: sessions accepted a month */
const PER_MONTH = 2;
/** whole months from a child's start until the final measurement is taken */
const FINAL_AFTER = TRY_SESSIONS / PER_MONTH + 1;
/** children start in three waves a month apart: child `i` of a region starts `i % 3` months late */
const WAVES = 3;

const sessionsAfter = (months: number) => Math.min(TRY_SESSIONS, PER_MONTH * Math.max(0, months));
const whole = (m: number) => Math.max(0, Math.floor(m));

/** child `i` of a region, `m` whole months after the pledge: the unit every aggregate sums */
function childAt(i: number, m: number) {
  const own = whole(m) - (i % WAVES);
  return { started: own >= 1, completed: own >= FINAL_AFTER, held: sessionsAfter(own) };
}

/**
 * one trial child's journey as `orphan_qualification()` would return it, `m` whole months
 * after the pledge. The trial child is the first child of their region, so this is `childAt(0)`.
 */
export function tryOrphanQualification(m: number, locale: Locale = "ar"): QualificationRow {
  const c = childAt(0, m);
  return {
    program: tryProgramName(locale),
    target_trait: tryTraitName("himmah", locale),
    units_total: TRY_SESSIONS,
    units_accepted: c.held,
    has_supervisor: true,
    has_consent: true,
    measured_before: c.started,
    measured_after: c.completed,
  };
}

/** a small stable number from a string, so a region's sample averages never change */
const seed = (s: string) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 9973, 7);

export type AreaCounts = {
  enrolled: number;
  started: number;
  completed: number;
  sessionsPlanned: number;
  sessionsHeld: number;
};

/** a target's raw counts `m` whole months after the pledge: its children, summed one by one */
export function tryAreaCounts(t: TryTarget, m: number): AreaCounts {
  const out = { enrolled: 0, started: 0, completed: 0, sessionsPlanned: 0, sessionsHeld: 0 };
  for (const [, n] of slices(t)) {
    const c = sliceCounts(n, m);
    for (const k of Object.keys(out) as Array<keyof AreaCounts>) out[k] += c[k];
  }
  return out;
}

/**
 * an area's sample record `m` whole months after the pledge, in the shape the development view
 * reads. Counts below the cohort minimum are withheld; trait averages appear only once the
 * minimum has a baseline. Each region has its own sample baseline per trait, and its latest
 * average moves with the share of sessions its started children have had accepted; a country's
 * averages are its regions' averages weighted by the children measured in each.
 */
export function tryArea(t: TryTarget, m: number, locale: Locale = "ar"): AreaDevelopment {
  const counts = tryAreaCounts(t, m);
  let weight = 0;
  const before = TRY_TRAITS.map(() => 0);
  const latest = TRY_TRAITS.map(() => 0);
  for (const [r, n] of slices(t)) {
    const own = sliceCounts(n, m);
    if (own.started === 0) continue;
    const progress = Math.min(1, own.sessionsHeld / (own.started * TRY_SESSIONS));
    const base = seed(r.id);
    TRY_TRAITS.forEach((_, d) => {
      const b = 38 + ((base + d * 7) % 18);
      const gain = 6 + ((base + d * 5) % 9);
      before[d]! += own.started * b;
      latest[d]! += own.started * (b + gain * progress);
    });
    weight += own.started;
  }
  const traits: TraitMovement[] | null =
    counts.started >= IMPACT_COHORT_MIN && weight > 0
      ? TRY_TRAITS.map((key, d) => ({
          key,
          label: tryTraitName(key, locale),
          before: before[d]! / weight,
          latest: latest[d]! / weight,
        }))
      : null;
  return {
    enrolled: cohortSafe(counts.enrolled),
    started: cohortSafe(counts.started),
    completed: cohortSafe(counts.completed),
    sessionsPlanned: counts.sessionsPlanned,
    sessionsHeld: counts.sessionsHeld,
    traits,
  };
}

/** the first `n` children of a region, counted one by one */
function sliceCounts(n: number, m: number): AreaCounts {
  const out = {
    enrolled: n,
    started: 0,
    completed: 0,
    sessionsPlanned: n * TRY_SESSIONS,
    sessionsHeld: 0,
  };
  for (let i = 0; i < n; i += 1) {
    const c = childAt(i, m);
    out.sessionsHeld += c.held;
    if (c.started) out.started += 1;
    if (c.completed) out.completed += 1;
  }
  return out;
}

/* ── reads shaped as the server's ── */

/**
 * the trial's pledges as `my_pledges()` returns them (`MyPledge`): the target by its display
 * name, and for an in-kind pledge its delivery rows as of `now` — every full month delivered
 * with a document, and the month now running in preparation once a month has passed.
 */
export function tryMyPledges(pledges: TryPledge[], now: Date, locale: Locale = "ar"): PledgeRow[] {
  return pledges.filter(validTarget).map((p): PledgeRow => {
    const months = monthsBetween(p.at, now);
    const start = p.at.slice(0, 7);
    const deliveries: NonNullable<PledgeRow["deliveries"]> = [];
    if (p.kind === "in_kind") {
      for (let i = 0; i < months; i += 1) {
        deliveries.push({ stage: "delivered", at: `${addMonths(start, i)}-28`, documented: true });
      }
      if (months > 0) {
        deliveries.push({
          stage: "preparing",
          at: `${addMonths(start, months)}-01`,
          documented: false,
        });
      }
    }
    return {
      id: p.id,
      kind: p.kind,
      target_type: p.scope,
      target: targetLabel(p, locale).label,
      amount: p.amount,
      currency: p.currency,
      status: "active",
      created_at: p.at,
      ...(p.kind === "in_kind" ? { deliveries } : {}),
    };
  });
}

/** the pledge row's card with what the trial also knows: the country and the DEMO- code */
const withPlace = <T extends PledgeCard>(card: T, p: TryPledge, locale: Locale): T => {
  const { place, code } = targetLabel(p, locale);
  return { ...card, place, ...(code ? { code } : {}) };
};

/** the trial's qualification pledges as the development view reads them, as of `now` */
export function tryQualification(
  pledges: TryPledge[],
  now: Date,
  locale: Locale = "ar",
): QualificationImpact[] {
  const byId = new Map(pledges.map((p) => [p.id, p]));
  return tryMyPledges(pledges, now, locale)
    .filter((row) => row.kind === "qualification")
    .flatMap((row): QualificationImpact[] => {
      const p = byId.get(row.id);
      if (!p) return [];
      const c = { ...withPlace(pledgeCard(row, now), p, locale), kind: "qualification" as const };
      return [
        p.scope === "orphan"
          ? { ...c, journey: journeyFromQualification(tryOrphanQualification(c.months, locale)) }
          : { ...c, area: tryArea(p, c.months, locale) },
      ];
    });
}

/** the trial's in-kind pledges as the delivery view reads them, as of `now` */
export function tryInKind(pledges: TryPledge[], now: Date, locale: Locale = "ar"): InKindImpact[] {
  const byId = new Map(pledges.map((p) => [p.id, p]));
  return inKindFromPledges(tryMyPledges(pledges, now, locale), now).flatMap((item) => {
    const p = byId.get(item.id);
    return p ? [withPlace(item, p, locale)] : [];
  });
}

/* ── the trial as it stands in each place: what the impact hall draws ── */

/**
 * the instant the trial reads its records at, `ahead` whole months from `from` (negative: before).
 * Whole months as «أثري» counts them (30.44 days), plus an hour so the n-th month has fully passed.
 */
export const tryThen = (ahead: number, from: Date = new Date()) =>
  new Date(from.getTime() + ahead * 30.44 * 86_400_000 + 3_600_000);

export type TryRegionState = AreaCounts & {
  co: string;
  /** the map's region id, and the same region's id in the hall */
  id: string;
  hall: string;
  /** sample: children with a file here */
  children: number;
  /** documented deliveries of the in-kind pledges made to this region or inside it */
  deliveries: number;
  /** the region's trial children this visitor sponsors monthly */
  sponsored: number;
  /** whole months the region's first child (the trial child) has been under a qualification pledge; -1 when under none */
  lead: number;
};

export type TryPlaceState = {
  co: string;
  children: number;
  /** documented deliveries of every in-kind pledge in the country, whatever its scope */
  deliveries: number;
  regions: TryRegionState[];
};

/**
 * every trial place as of `now`, from this visitor's pledges and gifts and nothing else: a
 * region's qualification counts are its children one by one (a child under several pledges
 * follows the earliest), in-kind counts only documented deliveries (never children reached),
 * and a sponsored child is one with a monthly gift. With no pledge every count is zero: the
 * trial invents no progress for a place. A pledge or gift made after `now` is not there yet.
 */
export function tryPlaceStates(
  pledges: TryPledge[],
  gifts: ReadonlyArray<Pick<TryGift, "childId" | "cadence" | "at">>,
  now: Date,
): TryPlaceState[] {
  const made = (at: string) => Date.parse(at) <= now.getTime();
  const live = pledges.filter((p) => validTarget(p) && made(p.at));
  const documented = new Map(
    tryMyPledges(
      live.filter((p) => p.kind === "in_kind"),
      now,
    ).map((row) => [
      row.id,
      (row.deliveries ?? []).filter((d) => d.stage === "delivered" && d.documented).length,
    ]),
  );
  const sponsored = new Set(
    gifts.filter((g) => g.cadence === "monthly" && made(g.at)).map((g) => g.childId),
  );
  return TRY_PLACES.map((place) => {
    const own = live.filter((p) => p.co === place.co);
    const regions = place.regions.map((r): TryRegionState => {
      // the furthest any qualification pledge has carried each child, in whole months
      const months = Array.from({ length: r.children }, () => -1);
      let deliveries = 0;
      for (const p of own) {
        const here = slices(p).find(([x]) => x.id === r.id);
        if (!here) continue;
        if (p.kind === "in_kind") {
          if (p.scope !== "country") deliveries += documented.get(p.id) ?? 0;
          continue;
        }
        const m = monthsBetween(p.at, now);
        for (let i = 0; i < here[1]; i += 1) months[i] = Math.max(months[i]!, m);
      }
      const out: TryRegionState = {
        co: place.co,
        id: r.id,
        hall: r.hall,
        children: r.children,
        enrolled: 0,
        started: 0,
        completed: 0,
        sessionsPlanned: 0,
        sessionsHeld: 0,
        deliveries,
        sponsored: sponsored.has(tryChildIn(place.co, r.hall)?.id ?? "") ? 1 : 0,
        lead: months[0] ?? -1,
      };
      months.forEach((m, i) => {
        if (m < 0) return;
        const c = childAt(i, m);
        out.enrolled += 1;
        out.sessionsPlanned += TRY_SESSIONS;
        out.sessionsHeld += c.held;
        if (c.started) out.started += 1;
        if (c.completed) out.completed += 1;
      });
      return out;
    });
    return {
      co: place.co,
      children: placeChildren(place),
      deliveries: own.reduce((a, p) => a + (documented.get(p.id) ?? 0), 0),
      regions,
    };
  });
}
