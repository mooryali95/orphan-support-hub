/**
 * جسر قاعة الأثر إلى محرّك منصة الرؤية (`@/lib/vision-engine`) — مصدرٌ واحد
 * للحقيقة في ألبانيا: مدنها ومجموعاتها وأطفالها ودعمها هي نفسها في /vision.
 * الدعم من القاعة يُكتب في الحالة المحفوظة نفسها (localStorage) فيظهر في
 * لوحة القرار وصفحة الأثر وملفات الأطفال. بقية الدول افتراضية من `model`.
 */
import { TRAITS as DEMO_TRAITS } from "@/data/vision-demo";
import {
  childrenOf,
  growthOf,
  levelOf,
  nowTraits,
  traitsOf,
  type Level,
} from "@/lib/vision-children";
import {
  fundingPct,
  gapOrphans,
  isFunded,
  reduce,
  revive,
  seed,
  type GroupState,
  type VisionState,
} from "@/lib/vision-engine";

import type { Region, Track } from "./model";

/** كما في `@/components/vision/VisionStore` (KEY وSYNC_EVENT). */
export const ENGINE_KEY = "vision-engine:v1";
export const SYNC_EVENT = "vision-sync";

export function loadEngine(storage: Pick<Storage, "getItem"> | null): VisionState {
  try {
    const raw = storage?.getItem(ENGINE_KEY);
    return raw ? revive(JSON.parse(raw)) : seed();
  } catch {
    return seed();
  }
}

export function saveEngine(s: VisionState, storage: Pick<Storage, "setItem"> | null) {
  try {
    storage?.setItem(ENGINE_KEY, JSON.stringify(s));
  } catch {
    /* التخزين ممنوع: يبقى الأثر في الجلسة */
  }
}

const cityGroups = (s: VisionState, city: string) => s.groups.filter((g) => g.city === city);

/** مناطق ألبانيا بأرقام المحرّك: من ينتظر، وما موِّل، والمكفولون والمكسوّون. */
export function albaniaRegions(s: VisionState, base: Region[]): Region[] {
  return base.map((r) => {
    const c = s.cities.find((x) => x.id === r.id);
    if (!c) return r;
    const groups = new Set(cityGroups(s, r.id).map((g) => g.id));
    const sponsored = s.sponsorships.filter((x) => groups.has(x.group)).length;
    const clothed = s.kits
      .filter((k) => k.delivered && groups.has(k.group))
      .reduce((a, k) => a + k.count, 0);
    return {
      ...r,
      need: c.need,
      funded: fundingPct(c),
      qualified: c.need - gapOrphans(c),
      sponsored: Math.min(c.need, Math.round(c.need * 0.3) + sponsored),
      clothed: Math.min(c.need, Math.round(c.need * 0.25) + clothed),
    };
  });
}

/** يقيّد دعماً من القاعة في المحرّك نفسه: تبرّع، أو كفالات شهرية، أو كسوة مسلَّمة. */
export function payEngine(
  s0: VisionState,
  o: { track: Track; amount: number; kids: number; city: string; donor: string; at: number },
): VisionState {
  let s = s0;
  if (o.track === "qualify") {
    return reduce(s, {
      type: "donate",
      donor: o.donor,
      amount: o.amount,
      method: "card",
      target: { kind: "city", id: o.city },
      at: o.at,
    });
  }
  const funded = cityGroups(s, o.city).filter(isFunded);
  const pool = funded.length ? funded : cityGroups(s, o.city);
  if (!pool.length) return s;
  if (o.track === "sponsor") {
    const taken = new Set(s.sponsorships.map((x) => x.child));
    let left = o.kids;
    for (const g of pool)
      for (const kid of childrenOf(g)) {
        if (left <= 0 || taken.has(kid.id)) continue;
        s = reduce(s, {
          type: "sponsor",
          donor: o.donor,
          child: kid.id,
          group: g.id,
          monthly: 300,
          at: o.at,
        });
        s = reduce(s, { type: "deliverSponsorship", child: kid.id, at: o.at });
        left--;
      }
    return s;
  }
  const g = pool[0]!;
  s = reduce(s, { type: "inkind", donor: o.donor, group: g.id, count: o.kids, at: o.at });
  return reduce(s, { type: "deliverKits", group: g.id, at: o.at });
}

export type GroupFact = {
  name: string;
  members: number;
  sessions: number;
  funded: boolean;
  levels: [Level[], Level[]];
};
export type ChildFact = {
  name: string;
  code: string;
  age: number;
  traits: Array<[string, number, number | null]>;
  from: Level;
  to: Level | null;
};

/** المجموعة التي وصلها الدعم وطفلٌ منها، من المحرّك بعد الدعم. */
export function levelFacts(
  s0: VisionState,
  s1: VisionState,
  city: string,
): { group: GroupFact; child: ChildFact } | null {
  const before = new Map(s0.groups.map((g) => [g.id, g]));
  const groups = cityGroups(s1, city);
  const pick: GroupState | undefined =
    groups.find((g) => isFunded(g) && !isFunded(before.get(g.id) ?? { ...g, funded: 0 })) ??
    groups.find(isFunded) ??
    groups[0];
  if (!pick) return null;
  const kids = childrenOf(pick);
  const kid = kids[0]!;
  const t = nowTraits(traitsOf(kid, DEMO_TRAITS), s1.boosts[kid.id]);
  const g = growthOf(
    t.map((x) => ({ ...x, after: x.after === null && x.lift === 0 ? null : x.now })),
  );
  return {
    group: {
      name: pick.name.ar,
      members: pick.members,
      sessions: pick.sessionsDone,
      funded: isFunded(pick),
      levels: [
        kids.map((k) => levelOf(k.before)),
        kids.map((k) => (k.after === null ? levelOf(k.before) : levelOf(k.after))),
      ],
    },
    child: {
      name: kid.pseudonym.ar,
      code: kid.code,
      age: kid.age,
      traits: t.map((x, i) => [
        DEMO_TRAITS[i]?.name.ar ?? x.key,
        x.before,
        x.after === null && x.lift === 0 ? null : x.now,
      ]),
      from: g.from,
      to: g.to,
    },
  };
}
