import { describe, expect, it } from "vitest";

import { GIVING_TRACKS, givingCopy } from "@/config/giving-tracks";
import { countryName } from "@/lib/countries";
import { payableOptions } from "@/lib/currency";
import { deliveryTotals } from "@/lib/support-impact";
import {
  gapOf,
  giftsAsSponsorships,
  loadGifts,
  localTryChild,
  TRY_CHILDREN,
  TRY_CURRENCY,
  tryChildrenIn,
} from "@/lib/try-demo";
import {
  placeChildren,
  TRY_GROUP_SIZE,
  TRY_PLACES,
  TRY_SESSIONS,
  TRY_TRAITS,
  tryChildIn,
  tryGroupName,
  tryRegionName,
  tryTraitName,
} from "@/lib/try-places";
import {
  addPledge,
  loadPledges,
  tryArea,
  tryAreaCounts,
  tryInKind,
  tryMapStats,
  tryMyPledges,
  tryPlaceStates,
  tryThen,
  type TryPledge,
} from "@/lib/try-support";

import { byCode, inRing, regionsFor } from "./model";
import { TRIAL_COPY, trialDemo, trialHall } from "./trial";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
const now = new Date("2026-11-18T00:00:00Z");
const MONTH = 30.44 * 86_400_000;
const empty = (locale = "ar") => trialHall({ pledges: [], gifts: [], now, locale });
const demoAt = (store = mem(), locale = "ar") => {
  let tick = 0;
  // every write a second apart, as a visitor's would be
  return trialDemo({ locale, store, clock: () => new Date(now.getTime() + 1000 * tick++) });
};

describe("قاعة التجربة تُبنى من كتالوج التجربة وحده", () => {
  it("دولها دول الكتالوج الست، ولكلٍّ منطقتاه بمعرّفيهما وعدديهما، ومجموع الدولة مجموعهما", () => {
    const hall = empty();
    expect(Object.keys(hall.countries).sort()).toEqual(TRY_PLACES.map((p) => p.co).sort());
    const map = tryMapStats();
    for (const place of TRY_PLACES) {
      const c = hall.countries[place.co]!;
      expect(c.regions.map((r) => r.id)).toEqual(place.regions.map((r) => r.hall));
      expect(c.regions.map((r) => r.mapId)).toEqual(place.regions.map((r) => r.id));
      expect(c.regions.map((r) => r.need)).toEqual(place.regions.map((r) => r.children));
      expect(c.children).toBe(placeChildren(place));
      expect(c.children).toBe(c.regions.reduce((a, r) => a + r.need, 0));
      // the same counts the trial map shows, region by region
      expect(c.children).toBe(map[place.co]!.total);
      for (const r of place.regions) {
        expect(c.regions.find((x) => x.mapId === r.id)!.need).toBe(
          map[place.co]!.regions[r.en]!.total,
        );
      }
    }
  });

  it.each(["ar", "en"])("الأسماء أسماء الكتالوج بلغة الواجهة (%s)", (locale) => {
    const hall = empty(locale);
    for (const place of TRY_PLACES) {
      const c = hall.countries[place.co]!;
      expect(c.name).toBe(countryName(place.co, locale));
      expect(c.regions.map((r) => r.ar)).toEqual(
        place.regions.map((r) => tryRegionName(r.id, locale)),
      );
      expect(c.group).toEqual({
        id: place.group.id,
        name: tryGroupName(place.group.id, locale),
        children: TRY_GROUP_SIZE,
      });
      // the group stands in the first region only, with the trial child
      expect(c.regions.map((r) => r.group?.id ?? null)).toEqual([place.group.id, null]);
      expect(c.sessions).toBe(TRY_SESSIONS);
      for (const r of c.regions) {
        expect(r.kids.map((k) => [k.id, k.name, k.code, k.need, k.gap, k.currency])).toEqual(
          [tryChildIn(place.co, r.id)].flatMap((raw) => {
            if (!raw) return [];
            const k = localTryChild(raw, locale);
            return [[k.id, k.name, k.code, k.need, gapOf(k), TRY_CURRENCY]];
          }),
        );
      }
    }
    expect(
      Object.values(hall.countries).flatMap((c) => c.regions.flatMap((r) => r.kids)),
    ).toHaveLength(TRY_CHILDREN.length);
  });

  it("طفل المنطقة هو طفل الدولة الواحد في منطقته: لا طفل يسقط من القاعة ولا يتكرّر", () => {
    for (const place of TRY_PLACES) {
      for (const r of place.regions) {
        const one = tryChildIn(place.co, r.hall);
        expect(one ? [one] : []).toEqual(tryChildrenIn(place.co, r.hall));
      }
    }
  });

  it("العملات عملات الكتالوج: عملة تشغيل الدولة ثم الموحّدة، ولا ريال", () => {
    const hall = empty();
    for (const place of TRY_PLACES) {
      const list = hall.countries[place.co]!.currencies;
      expect(list).toEqual(payableOptions(place.co, null).map((o) => o.currency));
      expect(list).not.toContain("SAR");
    }
  });

  it("أسماء الأنواع أسماء المنصّة بترتيبها", () => {
    for (const locale of ["ar", "en"]) {
      const d = demoAt(mem(), locale);
      expect(d.kinds).toEqual([...GIVING_TRACKS]);
      expect(d.giving.tracks).toEqual(givingCopy(locale).tracks);
    }
    // in-kind is named as documented deliveries, never as children clothed
    expect(JSON.stringify(TRIAL_COPY.ar)).not.toMatch(/كسوة|كُسوا|مكسوّ|ر\.س|ريال/);
    expect(JSON.stringify(TRIAL_COPY.en)).not.toMatch(/cloth|SAR|riyal/i);
  });

  it("بلا تعهّد لا أحد في التأهيل ولا تسليم ولا كفالة: القاعة لا تختلق تقدّماً", () => {
    for (const c of Object.values(empty().countries)) {
      expect([c.enrolled, c.started, c.completed, c.deliveries, c.sponsored]).toEqual([
        0, 0, 0, 0, 0,
      ]);
      for (const r of c.regions) {
        expect([r.qualified, r.started, r.sponsored, r.clothed]).toEqual([0, 0, 0, 0]);
        expect(r.kids.every((k) => k.gift === null && k.journey === null)).toBe(true);
      }
    }
    expect(empty().history).toEqual([]);
  });

  it("لكل منطقةٍ موضع عمودٍ في نموذج القاعة بمعرّفها، داخل حدود دولتها (هندسةٌ لا رقم)", () => {
    for (const c of Object.values(empty().countries)) {
      const shape = byCode(c.co)!;
      const columns = regionsFor(shape);
      for (const r of c.regions) {
        const at = columns.find((x) => x.id === r.id);
        expect(at, `${c.co}:${r.id}`).toBeDefined();
        if (c.co !== "AL") {
          expect(shape.rings.some((ring) => inRing(at!.nx, at!.ny, ring))).toBe(true);
        }
      }
    }
  });
});

describe("التعهّد الواحد يُقرأ في القاعة وفي «أثري» قراءةً واحدة", () => {
  const pledge = (over: Partial<TryPledge> = {}): TryPledge => ({
    id: "DEMO-PLG-1",
    kind: "qualification",
    scope: "region",
    target: "EGY-1533",
    co: "EG",
    amount: 50,
    currency: "USD",
    at: now.toISOString(),
    ...over,
  });

  it("تعهّدٌ أُضيف عبر المخزن يظهر في نموذج القاعة وفي tryMyPledges بالحقول نفسها", () => {
    const store = mem();
    const saved = addPledge(
      {
        kind: "qualification",
        scope: "region",
        target: "EGY-1533",
        co: "EG",
        amount: 75,
        currency: "USD",
      },
      store,
      now,
    )!;
    for (const locale of ["ar", "en"]) {
      const then = tryThen(0, now);
      const row = tryMyPledges(loadPledges(store), then, locale).find((r) => r.id === saved.id)!;
      const hall = trialDemo({ locale, store, clock: () => now }).model(0);
      const entry = hall.history.find((e) => e.id === saved.id)!;
      expect({
        id: entry.id,
        kind: entry.kind,
        target: entry.label,
        amount: entry.amount,
        currency: entry.currency,
        created_at: entry.at,
      }).toEqual({
        id: row.id,
        kind: row.kind,
        target: row.target,
        amount: row.amount,
        currency: row.currency,
        created_at: row.created_at,
      });
      expect(entry.region).toBe("EG-r1");
      expect(entry.kindName).toBe(givingCopy(locale).tracks.qualification.name);
      // the region's column fills with the children the pledge stands on, and no one has started
      const cairo = hall.countries["EG"]!.regions[0]!;
      expect([cairo.qualified, cairo.started]).toEqual([44, 0]);
      expect(hall.countries["EG"]!.regions[1]!.qualified).toBe(0);
    }
  });

  it("أعداد المنطقة في القاعة هي أعداد «أثري» شهراً بشهر، ومتوسّطات السمات هي نفسها بأسمائها", () => {
    const p = pledge();
    for (let m = 0; m <= 12; m += 1) {
      const then = tryThen(m, now);
      const hall = trialHall({ pledges: [p], gifts: [], now: then, locale: "ar" });
      const counts = tryAreaCounts(p, m);
      const r = hall.countries["EG"]!.regions[0]!;
      expect([r.qualified, r.started, r.completed, r.sessionsPlanned, r.sessionsHeld]).toEqual([
        counts.enrolled,
        counts.started,
        counts.completed,
        counts.sessionsPlanned,
        counts.sessionsHeld,
      ]);
      const d = hall.history[0]!.detail;
      expect(d).toEqual({ type: "area", ...tryArea(p, m, "ar") });
      if (d.type === "area" && d.traits) {
        expect(d.traits.map((t) => t.label)).toEqual(TRY_TRAITS.map((k) => tryTraitName(k, "ar")));
        // averages out of 100, as on the impact page
        for (const t of d.traits) expect(t.before).toBeGreaterThan(24);
      }
    }
    const en = trialHall({ pledges: [p], gifts: [], now: tryThen(6, now), locale: "en" });
    const d = en.history[0]!.detail;
    expect(d.type === "area" && d.traits?.map((t) => t.label)).toEqual(
      TRY_TRAITS.map((k) => tryTraitName(k, "en")),
    );
  });

  it("تعهّد الدولة منطقتاها، والمجموعة أوّل ثمانية، والطفل أوّلهم: مجموع الأعمدة مجموع «أثري»", () => {
    for (const p of [
      pledge({ scope: "country", target: "EG" }),
      pledge({ scope: "group", target: "DEMO-GRP-EG" }),
      pledge({ scope: "orphan", target: "try-03" }),
    ]) {
      for (const m of [0, 1, 3, 7]) {
        const then = tryThen(m, now);
        const c = trialHall({ pledges: [p], gifts: [], now: then, locale: "ar" }).countries["EG"]!;
        const counts = tryAreaCounts(p, m);
        expect([c.enrolled, c.started, c.completed, c.sessionsPlanned, c.sessionsHeld]).toEqual([
          counts.enrolled,
          counts.started,
          counts.completed,
          counts.sessionsPlanned,
          counts.sessionsHeld,
        ]);
        // the trial child's journey is the one «أثري» shows for a pledge on that child
        const kid = c.regions[0]!.kids[0]!;
        expect(kid.journey?.planned).toBe(TRY_SESSIONS);
      }
    }
    // two pledges on the same children never count a child twice
    const both = trialHall({
      pledges: [pledge(), pledge({ id: "DEMO-PLG-2", scope: "country", target: "EG" })],
      gifts: [],
      now,
      locale: "ar",
    }).countries["EG"]!;
    expect(both.enrolled).toBe(both.children);
  });

  it("العيني تسليماتٌ موثّقة كما في «أثري»، لا أطفالٌ مكسوّون", () => {
    const p = pledge({ kind: "in_kind" });
    for (const m of [0, 1, 4]) {
      const then = tryThen(m, now);
      const hall = trialHall({ pledges: [p], gifts: [], now: then, locale: "ar" });
      const documented = deliveryTotals(tryInKind([p], then, "ar")[0]!.deliveries).documented;
      expect(documented).toBe(m);
      const c = hall.countries["EG"]!;
      expect([c.deliveries, c.regions[0]!.clothed, c.regions[1]!.clothed]).toEqual([
        documented,
        documented,
        0,
      ]);
      expect(c.enrolled).toBe(0);
      expect(hall.history[0]!.detail).toMatchObject({ type: "in_kind", documented });
    }
    // a pledge to the whole country is the country's delivery, not each region's
    const whole = tryPlaceStates(
      [pledge({ kind: "in_kind", scope: "country", target: "EG" })],
      [],
      tryThen(3, now),
    );
    const eg = whole.find((s) => s.co === "EG")!;
    expect([eg.deliveries, ...eg.regions.map((r) => r.deliveries)]).toEqual([3, 0, 0]);
  });

  it("تعهّدٌ لم يقع بعد لا يظهر: شريط الزمن إلى الوراء لا يختلق", () => {
    const before = trialHall({
      pledges: [pledge()],
      gifts: [],
      now: tryThen(-2, now),
      locale: "ar",
    });
    expect(before.history).toEqual([]);
    expect(before.countries["EG"]!.enrolled).toBe(0);
  });

  it("tryThen هو زمن «أثري» نفسه: أشهرٌ من 30.44 يوماً وساعة", () => {
    for (const n of [0, 1, 12]) {
      expect(tryThen(n, now).getTime()).toBe(now.getTime() + n * MONTH + 3_600_000);
    }
  });
});

describe("الدعم داخل القاعة يُكتب في مخزنَي الصفحات", () => {
  it("تعهّد القاعة يُحفظ بـaddPledge للمنطقة نفسها بالمبلغ كما كُتب، ويقرؤه «أثري»", () => {
    const store = mem();
    const d = demoAt(store);
    const id = d.pledge({
      kind: "in_kind",
      co: "AL",
      region: "tirana",
      amount: 40,
      currency: "EUR",
    })!;
    const stored = loadPledges(store);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id,
      kind: "in_kind",
      scope: "region",
      target: "ALB-1529",
      co: "AL",
      amount: 40,
      currency: "EUR",
    });
    expect(tryInKind(stored, now, "ar").map((x) => x.id)).toEqual([id]);
    expect(d.model(0).history.map((e) => e.id)).toEqual([id]);
    // a region outside the catalogue is refused, and nothing is written
    expect(
      d.pledge({ kind: "qualification", co: "AL", region: "durres", amount: 40, currency: "EUR" }),
    ).toBeNull();
    expect(
      d.pledge({ kind: "qualification", co: "SA", region: "SA-r1", amount: 40, currency: "USD" }),
    ).toBeNull();
    expect(loadPledges(store)).toHaveLength(1);
  });

  it("كفالة القاعة تُحفظ بـaddGift: المتبقّي من حاجة الطفل بعملة ملفّه، مرّةً واحدة", () => {
    const store = mem();
    const d = demoAt(store);
    const id = d.sponsor("try-03")!;
    const gifts = loadGifts(store);
    expect(gifts).toHaveLength(1);
    expect(gifts[0]).toMatchObject({ id, childId: "try-03", amount: 140, cadence: "monthly" });
    expect(gifts[0]!.paid).toBeUndefined();
    expect(giftsAsSponsorships(gifts)[0]!.currency).toBe(TRY_CURRENCY);
    expect(d.sponsor("try-03")).toBeNull();
    const hall = d.model(0);
    const cairo = hall.countries["EG"]!.regions[0]!;
    expect([cairo.sponsored, cairo.kids[0]!.gift, hall.countries["EG"]!.sponsored]).toEqual([
      1,
      "monthly",
      1,
    ]);
    expect(hall.history[0]).toMatchObject({ id, kind: "monthly", amount: 140, currency: "EUR" });
  });

  it("عطاءٌ أو تعهّدٌ من الصفحات يظهر في القاعة عند دخولها", () => {
    const store = mem();
    store.setItem(
      "try-demo:v1",
      JSON.stringify([
        { id: "gift-1", childId: "try-01", amount: 80, cadence: "monthly", at: now.toISOString() },
      ]),
    );
    addPledge(
      {
        kind: "qualification",
        scope: "country",
        target: "AL",
        co: "AL",
        amount: 100,
        currency: "USD",
      },
      store,
      now,
    );
    const hall = trialDemo({ locale: "ar", store, clock: () => now }).model(0);
    const al = hall.countries["AL"]!;
    expect([al.enrolled, al.sponsored]).toEqual([128, 1]);
    expect(al.regions.map((r) => r.qualified)).toEqual([88, 40]);
    expect(hall.history.map((e) => e.kind).sort()).toEqual(["monthly", "qualification"]);
  });

  it("المعاينة والفيلم لا يكتبان شيئاً", () => {
    const store = mem();
    const d = demoAt(store);
    const shown = d.model(0, {
      kind: "qualification",
      co: "KE",
      region: "KE-r2",
      amount: 25,
      currency: "USD",
    });
    expect(shown.countries["KE"]!.regions[1]!.qualified).toBe(30);
    expect(shown.history[0]!.id).toBe(d.draftId);
    expect(d.model(0, { kind: "monthly", childId: "try-04" }).countries["KE"]!.sponsored).toBe(1);
    expect(loadPledges(store)).toEqual([]);
    expect(loadGifts(store)).toEqual([]);
    expect(d.model(0).history).toEqual([]);
  });

  it("القاعة تعرض مبالغ الصفحة الثابتة نفسها، والإعادة لعطاءٍ وقع فعلاً مرّةً واحدة", () => {
    const store = mem();
    expect(demoAt(store).amounts).toMatchObject({ presets: [25, 50, 100], initial: 50 });
    expect(trialDemo({ locale: "ar", store, child: "try-02" }).focus).toBeNull();
    store.setItem(
      "try-demo:v1",
      JSON.stringify([
        { id: "gift-9", childId: "try-02", amount: 30, cadence: "monthly", at: now.toISOString() },
      ]),
    );
    expect(trialDemo({ locale: "ar", store, child: "try-02" }).focus).toMatchObject({
      co: "SN",
      region: "SN-r1",
      cadence: "monthly",
    });
    expect(trialDemo({ locale: "ar", store, child: "try-02" }).focus).toBeNull();
  });
});
