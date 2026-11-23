/**
 * كل دولةٍ في التجربة دولةٌ كاملة: حرّاس الكتالوج المولَّد (`try-world`) وما يُبنى عليه.
 * يُفحص من المستودع وحده، بلا قاعدة ولا شبكة.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { WAMY_COUNTRIES } from "@/data/wamy-network";
import { payableOptions } from "@/lib/currency";
import { COUNTRIES } from "@/lib/hall/model";
import { trialHall } from "@/lib/hall/trial";
import { demoPayOptions } from "@/lib/pay-options";
import {
  addGift,
  gapOf,
  giftsAsSponsorships,
  loadGifts,
  localTryChild,
  TRY_CHILDREN,
  TRY_CURRENCY,
  tryChild,
  tryPayOptions,
} from "@/lib/try-demo";
import { tryEvidence } from "@/lib/try-evidence";
import {
  placeChildren,
  TRY_FEATURED,
  TRY_GROUP_SIZE,
  TRY_PLACES,
  tryChildOf,
  tryChildren,
  tryGroupName,
  tryPlace,
  tryRegionName,
  tryRegionOfChild,
} from "@/lib/try-places";
import {
  addPledge,
  loadPledges,
  TRY_KINDS,
  TRY_SCOPES,
  TRY_SUPPORT_COUNTRIES,
  tryAreaCounts,
  tryInKind,
  tryMapStats,
  tryQualification,
  type TryTarget,
} from "@/lib/try-support";
import { WORLD_CHILDREN, WORLD_PLACES } from "@/lib/try-world";

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
const later = (n: number) => new Date(now.getTime() + n * MONTH + 3_600_000);
const ARABIC = /[؀-ۿ]/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

const targetsOf = (co: string): TryTarget[] => {
  const p = tryPlace(co)!;
  return [
    { scope: "orphan", target: tryChildOf(co)!.id, co },
    { scope: "group", target: p.group.id, co },
    { scope: "region", target: p.regions[0].id, co },
    { scope: "region", target: p.regions[1].id, co },
    { scope: "country", target: co, co },
  ];
};

describe("أيّ دولةٍ على الخريطة تُدخَل في التجربة", () => {
  const world = JSON.parse(readFileSync("public/geo/world.json", "utf8")) as {
    countries: Array<{ c: string }>;
  };
  const drawn = [...new Set(world.countries.map((x) => x.c))];

  it("الملفّ المولَّد مطابقٌ لملفّات الخريطة — شغّل scripts/gen-try-world.mjs بعد تغييرها", () => {
    expect(() =>
      execFileSync("node", ["scripts/gen-try-world.mjs", "--check"], { stdio: "pipe" }),
    ).not.toThrow();
  });

  it("كل دولةٍ ترسمها الخريطة في الكتالوج، إلا غير المأهول وما ليس له في ملفّها منطقتان", () => {
    const outside = drawn.filter((co) => !TRY_SUPPORT_COUNTRIES.has(co)).sort();
    for (const co of outside) {
      const file = JSON.parse(readFileSync(`public/geo/admin1/${co}.json`, "utf8")) as {
        regions: Array<{ n?: string }>;
      };
      const uninhabited = ["AQ", "BV", "GS", "HM", "IO", "TF", "UM"].includes(co);
      const named = file.regions.filter((r) => ARABIC.test(r.n ?? ""));
      expect(uninhabited || named.length < 2, co).toBe(true);
    }
    // the exact list, so a country cannot drop out of the trial unnoticed
    expect(outside.join(" ")).toBe(
      "AW BL CW EH FK FO GG GS GU HM IM IO JE KI KY MC MF MO NF NU PN PR SX TF TV VA VG",
    );
    expect(TRY_PLACES.length).toBe(drawn.length - outside.length);
    expect(TRY_PLACES.length).toBe(209);
    // and nothing in the catalogue that the map does not draw
    for (const p of TRY_PLACES) expect(drawn, p.co).toContain(p.co);
  });

  it("دول الشبكة كلّها ودول القاعة كلّها في الكتالوج: مكتبٌ أو نشاطٌ أو لا شيء", () => {
    for (const c of WAMY_COUNTRIES) expect(tryPlace(c.code), c.code).toBeDefined();
    for (const c of COUNTRIES) expect(tryPlace(c.code), c.code).toBeDefined();
    expect(WAMY_COUNTRIES.some((c) => c.presence.status === "unconfirmed")).toBe(true);
  });

  it("الست المكتوبة باليد أوّلاً ولا تُولَّد، والباقي مولَّد بلا تكرار", () => {
    expect(TRY_PLACES.slice(0, 6)).toEqual([...TRY_FEATURED]);
    expect(TRY_PLACES.slice(6)).toEqual([...WORLD_PLACES]);
    const six = new Set(TRY_FEATURED.map((p) => p.co));
    for (const p of WORLD_PLACES) expect(six.has(p.co), p.co).toBe(false);
    expect(new Set(TRY_PLACES.map((p) => p.co)).size).toBe(TRY_PLACES.length);
    expect(tryChildren().slice(0, 6)).toEqual(TRY_CHILDREN);
    expect(tryChildren().slice(6)).toEqual([...WORLD_CHILDREN]);
  });
});

describe("الدول الست الأولى لم يتغيّر فيها رقم", () => {
  it("مناطقها وأعدادها ومجموعاتها كما كانت", () => {
    expect(
      TRY_FEATURED.map((p) => [p.co, ...p.regions.flatMap((r) => [r.id, r.hall, r.children])]),
    ).toEqual([
      ["AL", "ALB-1529", "tirana", 88, "ALB-1498", "shkoder", 40],
      ["SN", "SEN-759", "SN-r1", 37, "SEN-768", "SN-r2", 39],
      ["EG", "EGY-1533", "EG-r1", 44, "EGY-1544", "EG-r2", 34],
      ["KE", "KEN-1196", "KE-r1", 44, "KEN-1193", "KE-r2", 30],
      ["BA", "BIH-2890", "BA-r1", 57, "BIH-2887", "BA-r2", 59],
      ["ID", "IDN-1227", "ID-r1", 24, "IDN-1223", "ID-r2", 48],
    ]);
    expect(TRY_FEATURED.map(placeChildren)).toEqual([128, 76, 78, 74, 116, 72]);
    expect(TRY_FEATURED.map((p) => tryGroupName(p.group.id, "ar"))).toEqual([
      "مجموعة الفجر",
      "مجموعة الأمل",
      "مجموعة النور",
      "مجموعة البشائر",
      "مجموعة الوفاء",
      "مجموعة الهدى",
    ]);
  });

  it("أطفالها برموزهم وحاجتهم وتمويلهم كما كانوا", () => {
    expect(
      TRY_CHILDREN.map((c) => [c.id, c.code, c.co, c.region, c.name, c.need, c.funded, c.age]),
    ).toEqual([
      ["try-01", "DEMO-TRY-01", "AL", "tirana", "سارة", 120, 40, 9],
      ["try-02", "DEMO-TRY-02", "SN", "SN-r1", "يوسف", 100, 70, 11],
      ["try-03", "DEMO-TRY-03", "EG", "EG-r1", "مريم", 140, 0, 7],
      ["try-04", "DEMO-TRY-04", "KE", "KE-r1", "عمر", 90, 60, 13],
      ["try-05", "DEMO-TRY-05", "BA", "BA-r1", "ليان", 110, 20, 10],
      ["try-06", "DEMO-TRY-06", "ID", "ID-r1", "آدم", 130, 95, 8],
    ]);
  });
});

describe("كتالوج كل دولةٍ كامل ومتّسق", () => {
  it("منطقتان باسميهما في ملفّ الخريطة، وأعدادٌ معقولة، ومجموعةٌ مسمّاة برمز DEMO-", () => {
    for (const p of TRY_PLACES) {
      expect(p.regions).toHaveLength(2);
      expect(p.regions[0].id).not.toBe(p.regions[1].id);
      expect(p.regions[0].en).not.toBe(p.regions[1].en);
      expect(p.regions.map((r) => r.hall)).toEqual(
        p.co === "AL" ? ["tirana", "shkoder"] : [`${p.co}-r1`, `${p.co}-r2`],
      );
      for (const r of p.regions) {
        expect(r.children, `${p.co}:${r.id}`).toBeGreaterThanOrEqual(18);
        expect(r.children).toBeLessThanOrEqual(88);
        expect(tryRegionName(r.id, "ar"), r.id).toMatch(ARABIC);
        expect(tryRegionName(r.id, "ar")).not.toMatch(/[0-9٠-٩]/);
        expect(tryRegionName(r.id, "en")).toBe(r.en);
      }
      expect(p.group.id).toBe(`DEMO-GRP-${p.co}`);
      expect(p.group.children).toBe(TRY_GROUP_SIZE);
      expect(p.group.children).toBeLessThanOrEqual(p.regions[0].children);
      expect(tryGroupName(p.group.id, "ar")).toMatch(ARABIC);
      expect(tryGroupName(p.group.id, "en")).toMatch(/^[A-Z][A-Za-z ]+ group$/);
    }
  });

  it("طفلٌ لكل دولة باسمٍ مستعار ورمز DEMO-، حاجته مفتوحة، ولا معرّف يشبه معرّف الدفع", () => {
    for (const p of TRY_PLACES) {
      const k = tryChildOf(p.co)!;
      expect(tryChild(k.id)).toBe(k);
      expect(k.code).toMatch(/^DEMO-TRY-/);
      expect(k.id).toMatch(/^try-\w\w$/);
      expect(k.id).not.toMatch(UUID);
      expect(p.group.id).not.toMatch(UUID);
      expect(tryRegionOfChild(k)?.id, p.co).toBe(p.regions[0].id);
      expect(k.name).toMatch(ARABIC);
      expect(k.stage).toMatch(ARABIC);
      expect(k.covers).toMatch(ARABIC);
      expect(k.country).toMatch(ARABIC);
      const en = localTryChild(k, "en");
      for (const text of [en.name, en.stage, en.covers, en.country]) {
        expect(text, `${p.co} en`).not.toMatch(ARABIC);
        expect(text.length).toBeGreaterThan(1);
      }
      expect([en.id, en.code, en.need, en.funded]).toEqual([k.id, k.code, k.need, k.funded]);
      expect(k.age).toBeGreaterThanOrEqual(6);
      expect(k.age).toBeLessThanOrEqual(14);
      expect(k.need).toBeGreaterThanOrEqual(80);
      expect(k.need).toBeLessThanOrEqual(150);
      expect(gapOf(k), p.co).toBeGreaterThanOrEqual(20);
      expect(k.waitingDays).toBeGreaterThan(0);
      // the file's currency can be paid in, and the country offers its own first
      expect(tryPayOptions(k).options.map((o) => o.currency)).toContain(TRY_CURRENCY);
      expect(demoPayOptions(p.co, TRY_CURRENCY).options.length).toBeGreaterThan(0);
      expect(payableOptions(p.co, null).length).toBeGreaterThan(0);
    }
  });

  it("الاشتقاق ثابت: جيبوتي كما هي في كل تحميل", () => {
    const p = tryPlace("DJ")!;
    expect(p.regions).toEqual([
      { id: "DJI-1567", en: "Djibouti", hall: "DJ-r1", children: 60 },
      { id: "DJI-1566", en: "Ali Sabieh", hall: "DJ-r2", children: 31 },
    ]);
    expect(p.regions.map((r) => tryRegionName(r.id, "ar"))).toEqual(["جيبوتي", "علي صبيح"]);
    expect([tryGroupName(p.group.id, "ar"), tryGroupName(p.group.id, "en")]).toEqual([
      "مجموعة اليقين",
      "Certainty group",
    ]);
    expect(tryChildOf("DJ")).toEqual({
      id: "try-dj",
      co: "DJ",
      region: "DJ-r1",
      code: "DEMO-TRY-DJ",
      name: "عبدي",
      country: "جيبوتي",
      age: 12,
      stage: "المرحلة المتوسطة",
      need: 150,
      funded: 15,
      waitingDays: 278,
      covers: "الدراسة والمواصلات والكتب",
      en: { name: "Abdi", stage: "Middle school", covers: "Schooling, transport and books" },
    });
  });
});

describe("كل دولةٍ تُدعَم بكل نوعٍ ونطاق، ويُرى الأثر", () => {
  it("تعهّد التأهيل والعيني لكل نطاق في كل دولة، والكفالة المادية لطفلها", () => {
    expect([...TRY_KINDS]).toEqual(["qualification", "in_kind"]);
    expect([...TRY_SCOPES]).toEqual(["orphan", "group", "region", "country"]);
    for (const p of TRY_PLACES) {
      const store = mem();
      let tick = 0;
      for (const t of targetsOf(p.co)) {
        for (const kind of TRY_KINDS) {
          const saved = addPledge(
            { ...t, kind, amount: 50, currency: payableOptions(p.co, null)[0]!.currency },
            store,
            new Date(now.getTime() + 1000 * tick++),
          );
          expect(saved, `${p.co} ${kind} ${t.scope}`).not.toBeNull();
        }
      }
      const pledges = loadPledges(store);
      expect(pledges).toHaveLength(10);
      const k = tryChildOf(p.co)!;
      addGift({ childId: k.id, amount: gapOf(k), cadence: "monthly" }, store, now);
      const gifts = loadGifts(store);
      expect(gifts.map((g) => g.childId)).toEqual([k.id]);

      // the impact, as «أثري» reads it three months on
      const then = later(3);
      expect(tryQualification(pledges, then, "ar")).toHaveLength(5);
      const kind = tryInKind(pledges, then, "ar");
      expect(kind).toHaveLength(5);
      expect(kind.every((x) => x.deliveries.length > 0)).toBe(true);
      const mine = giftsAsSponsorships(gifts, "en");
      expect(mine[0]?.orphan?.code).toBe(k.code);
      expect(mine[0]?.orphan?.funded_monthly).toBe(k.need);
      expect(tryEvidence(gifts, 3, "ar")).toHaveLength(4);
    }
  });

  it("القاعة والصفحات تقرآن الدولة قراءةً واحدة، في كل دولة", () => {
    const map = tryMapStats();
    for (const p of TRY_PLACES) {
      const k = tryChildOf(p.co)!;
      const region: TryTarget = { scope: "region", target: p.regions[1].id, co: p.co };
      const group: TryTarget = { scope: "group", target: p.group.id, co: p.co };
      const at = now.toISOString();
      const pledges = [
        {
          ...region,
          id: "DEMO-PLG-1",
          kind: "qualification" as const,
          amount: 50,
          currency: "USD",
          at,
        },
        {
          ...group,
          id: "DEMO-PLG-2",
          kind: "qualification" as const,
          amount: 25,
          currency: "USD",
          at,
        },
        { ...region, id: "DEMO-PLG-3", kind: "in_kind" as const, amount: 30, currency: "USD", at },
      ];
      const gifts = [
        { id: "gift-1", childId: k.id, amount: gapOf(k), cadence: "monthly" as const, at },
      ];
      const then = later(4);
      const hall = trialHall({ pledges, gifts, now: then, locale: "ar", only: new Set([p.co]) })
        .countries[p.co]!;

      // the catalogue's counts, as the map shows them
      expect(hall.children, p.co).toBe(map[p.co]!.total);
      expect(hall.children).toBe(placeChildren(p));
      expect(hall.regions.map((r) => r.need)).toEqual(
        p.regions.map((r) => map[p.co]!.regions[r.en]!.total),
      );
      expect(hall.regions.map((r) => r.ar)).toEqual(
        p.regions.map((r) => tryRegionName(r.id, "ar")),
      );
      expect(hall.group.name).toBe(tryGroupName(p.group.id, "ar"));

      // qualification: the second region whole, and the group inside the first
      const whole = tryAreaCounts(region, 4);
      const part = tryAreaCounts(group, 4);
      const [first, second] = hall.regions as [(typeof hall.regions)[0], (typeof hall.regions)[0]];
      expect([second.qualified, second.started, second.completed, second.sessionsHeld]).toEqual([
        whole.enrolled,
        whole.started,
        whole.completed,
        whole.sessionsHeld,
      ]);
      expect([first.qualified, first.started, first.sessionsHeld]).toEqual([
        part.enrolled,
        part.started,
        part.sessionsHeld,
      ]);
      expect(hall.enrolled).toBe(whole.enrolled + part.enrolled);
      // «أثري» publishes the same counts for the same pledges
      const cards = tryQualification(pledges, then, "ar");
      expect(cards.find((c) => c.id === "DEMO-PLG-1")?.area?.sessionsHeld).toBe(whole.sessionsHeld);
      expect(cards.find((c) => c.id === "DEMO-PLG-2")?.area?.sessionsHeld).toBe(part.sessionsHeld);

      // in-kind: documented deliveries only, the same number «أثري» lists
      const delivered = tryInKind(pledges, then, "ar")[0]!.deliveries.filter(
        (d) => d.stage === "delivered" && d.documented,
      ).length;
      expect(delivered).toBe(4);
      expect(second.clothed).toBe(delivered);
      expect(hall.deliveries).toBe(delivered);

      // financial: the country's child, sponsored monthly, stands in its first region
      expect(first.sponsored).toBe(1);
      expect(first.kids.map((x) => [x.id, x.code, x.gift, x.coverage[1]])).toEqual([
        [k.id, k.code, "monthly", 100],
      ]);
      expect(second.kids).toEqual([]);
    }
  });
});

describe("الكتالوج المولَّد خارج حزمة الدخول وصفحات الرؤية", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? files(join(dir, e.name))
        : /\.(ts|tsx|js)$/.test(e.name) && !/\.test\./.test(e.name)
          ? [join(dir, e.name)]
          : [],
    );
  const all = files("src").map((f) => [f, readFileSync(f, "utf8")] as const);
  const importers = (mod: string, how: RegExp) =>
    all.filter(([, text]) => how.test(text) && text.includes(mod)).map(([f]) => f);

  it("لا يستورده استيراداً ثابتاً إلا `try-places`، ومسار «جرّب» يحمّله كسولاً", () => {
    expect(importers("try-world", /from "@\/lib\/try-world"/)).toEqual(["src/lib/try-places.ts"]);
    expect(importers("try-world.data", /from "@\/lib\/try-world\.data"/)).toEqual([
      "src/lib/try-world.ts",
    ]);
    // the trial route loads it lazily through try-places (which also adds the six countries' extras)
    expect(readFileSync("src/routes/try.tsx", "utf8")).toMatch(
      /beforeLoad: \(\) => import\("@\/lib\/try-places"\)/,
    );
  });

  it("ملفّات الدخول والرؤية لا تستورد أماكن التجربة ولا تعهّداتها", () => {
    const heavy = /from "@\/lib\/(try-places|try-support|try-world|hall\/trial)"/;
    const guarded = all.filter(
      ([f]) =>
        f === "src/lib/try-demo.ts" ||
        f === "src/routes/__root.tsx" ||
        /^src\/routes\/vision/.test(f) ||
        /^src\/components\/vision\//.test(f) ||
        /^src\/data\//.test(f),
    );
    expect(guarded.length).toBeGreaterThan(5);
    for (const [f, text] of guarded) expect(heavy.test(text), f).toBe(false);
  });
});

describe("trial directory extras", () => {
  it("adds a fixed number of extra children per region, each findable and supportable", async () => {
    const { WORLD_EXTRA_CHILDREN, WORLD_PLACES, EXTRA_PER_REGION } =
      await import("@/lib/try-world");
    const { tryChild, tryChildrenIn } = await import("@/lib/try-demo");
    expect(WORLD_EXTRA_CHILDREN.length).toBe(WORLD_PLACES.length * 2 * EXTRA_PER_REGION);
    const { TRY_FEATURED } = await import("@/lib/try-places");
    const { TRY_WORLD_EXTRA } = await import("@/lib/try-demo");
    // the six featured countries get their extras too, in their own regions
    expect(TRY_WORLD_EXTRA.length).toBe(
      (WORLD_PLACES.length + TRY_FEATURED.length) * 2 * EXTRA_PER_REGION,
    );
    expect(new Set(TRY_WORLD_EXTRA.map((c) => c.id)).size).toBe(TRY_WORLD_EXTRA.length);
    for (const p of TRY_FEATURED)
      for (const r of p.regions)
        expect(TRY_WORLD_EXTRA.filter((c) => c.co === p.co && c.region === r.hall)).toHaveLength(
          EXTRA_PER_REGION,
        );
    expect(new Set(WORLD_EXTRA_CHILDREN.map((c) => c.id)).size).toBe(WORLD_EXTRA_CHILDREN.length);
    for (const c of WORLD_EXTRA_CHILDREN) {
      expect(tryChild(c.id)).toBe(c);
      expect(c.need - c.funded).toBeGreaterThanOrEqual(20);
      // extras stay out of the hall and the map: the region keeps its one featured child
      expect(tryChildrenIn(c.co, c.region)).not.toContain(c);
    }
  });
});
