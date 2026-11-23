/**
 * القاعة الحيّة — حرّاس ما أُصلح فيها: لغتها لغة الواجهة (لا عربيةٌ في الإنجليزية، ولا «1 أطفال»
 * في العربية)، ومبالغها بعملة المنصّة الواحدة عبر `formatMoney`، ونسبة التمويل رقمٌ واحد في
 * بطاقة الدولة ولوحتها، وكلّ لوحةٍ تعرض رقماً نموذجياً تسمّيه نموذجياً.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { seed } from "@/lib/vision-engine";
import { UNIFIED_CURRENCY } from "@/lib/currency";
import { formatMoney } from "@/lib/format";

import { albaniaRegions, levelFacts, payEngine } from "./engine-bridge";
import { HALL_LIVE_COPY, hallLive } from "./live";
import { byCode, COUNTRIES, countryFigures, regionsFor, totals, TRACKS } from "./model";

const ROOT = resolve(__dirname, "../../..");
const SCENE = readFileSync(join(ROOT, "src/components/hall/hall-scene.js"), "utf8");
const ARABIC = /[؀-ۿ]/;

/** every string a copy can produce: plain ones as written, functions called with marked values */
function strings(node: unknown, path = ""): Array<[string, string]> {
  if (typeof node === "string") return [[path, node]];
  if (typeof node === "function") {
    const call = node as (...a: Array<number | string>) => string;
    return [1, 2, 5, 11, 100].map((n) => [`${path}(${n})`, call(n, String(n), "X", "Y")]);
  }
  if (Array.isArray(node)) return node.flatMap((v, i) => strings(v, `${path}.${i}`));
  if (node && typeof node === "object")
    return Object.entries(node).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  return [];
}
/** the body of one scene function, by name */
function fn(name: string) {
  const start = SCENE.indexOf(`  function ${name}(`);
  expect(start, name).toBeGreaterThan(0);
  return SCENE.slice(start, SCENE.indexOf("\n  }\n", start));
}

describe("القاعة الحيّة بلغة الواجهة", () => {
  it("لا حرف عربياً في نصوصها الإنجليزية، ولا في أسماء عيّنتها", () => {
    const left = strings(HALL_LIVE_COPY.en).filter(([, text]) => ARABIC.test(text));
    expect(left).toEqual([]);
    const en = hallLive("en");
    expect(en.dir).toBe("ltr");
    expect(hallLive("ar").dir).toBe("rtl");
    for (const co of COUNTRIES) {
      for (const r of regionsFor(co)) expect(en.regionName(r), r.id).not.toMatch(ARABIC);
      for (const n of [co.city, co.type, co.act]) expect(en.pick(n) ?? "").not.toMatch(ARABIC);
    }
    for (const [name] of en.traits) expect(name).not.toMatch(ARABIC);
    expect(en.money(10_000)).not.toMatch(ARABIC);
  });

  it("المشهد لا يكتب نصّاً من عنده: لا حرف عربياً فيه خارج التعليقات", () => {
    const code = SCENE.split("\n").filter((l) => !/^\s*(\/\/|\/?\*)/.test(l));
    expect(code.filter((l) => ARABIC.test(l.replace(/\/\/.*$|\/\*.*?\*\//g, "")))).toEqual([
      // the two list separators (the Arabic comma), chosen by direction
      expect.stringContaining('.join(DIR === "rtl" ? "، " : ", ")'),
      expect.stringContaining('.join(LTR ? ", " : "، ")'),
    ]);
    // the live panels read `X` (this copy) and the kit `LX`, never a literal
    expect(SCENE).toContain("const LX = demo || mine ? null : liveKit,");
  });

  it("أسماء العيّنة بلغة الواجهة: مدن ألبانيا بأسمائها، والمناطق مرقّمة، والأسماء المستعارة", () => {
    const al = regionsFor(byCode("AL")!).find((r) => r.id === "tirana")!;
    const sn = regionsFor(byCode("SN")!)[0]!;
    expect(hallLive("ar").regionName(al)).toBe("تيرانا");
    expect(hallLive("en").regionName(al)).toBe("Tirana");
    expect(hallLive("ar").regionName(sn)).toBe("المنطقة 1");
    expect(hallLive("en").regionName(sn)).toBe("Region 1");
    // a language with no copy of its own reads the Latin names, never the Arabic ones
    expect(hallLive("sq").regionName(al)).toBe("Tirana");
    // naming twice changes nothing (the scene stamps the name on the region it draws)
    const stamped = { ...al, ar: hallLive("en").regionName(al) };
    expect(hallLive("en").regionName(stamped)).toBe("Tirana");

    const s0 = seed();
    const s1 = payEngine(s0, {
      track: "qualify",
      amount: 10_000,
      kids: 16,
      city: "tirana",
      donor: "x",
      at: 1_700_000_000_000,
    });
    const en = levelFacts(s0, s1, "tirana", "en")!;
    const ar = levelFacts(s0, s1, "tirana", "ar")!;
    expect(`${en.group.name}${en.child.name}${en.child.traits.map((t) => t[0])}`).not.toMatch(
      ARABIC,
    );
    expect(ar.group.name).toMatch(ARABIC);
    expect(en.child.code).toBe(ar.child.code);
  });
});

describe("الجمع بقواعد اللغة: لا «1 أطفال»", () => {
  const ar = hallLive("ar").copy;
  const en = hallLive("en").copy;
  const say = (f: (...a: Array<number | string>) => string, n: number) =>
    f(n, String(n), "ألبانيا");

  it("عدد أطفال الدليل بصيغ العربية الستّ", () => {
    expect(say(ar.directory.count, 1)).toBe("طفلٌ واحد في ألبانيا");
    expect(say(ar.directory.count, 2)).toBe("طفلان في ألبانيا");
    expect(say(ar.directory.count, 3)).toBe("3 أطفال في ألبانيا");
    expect(say(ar.directory.count, 10)).toBe("10 أطفال في ألبانيا");
    expect(say(ar.directory.count, 11)).toBe("11 طفلاً في ألبانيا");
    expect(say(ar.directory.count, 99)).toBe("99 طفلاً في ألبانيا");
    expect(say(ar.directory.count, 100)).toBe("100 طفل في ألبانيا");
    expect(say(ar.directory.count, 128)).toBe("128 طفلاً في ألبانيا");
    expect(say(en.directory.count, 1)).toBe("1 child in ألبانيا");
    expect(say(en.directory.count, 128)).toBe("128 children in ألبانيا");
  });

  it("لا عددٌ مفرد أو مثنّى يسبق جمعاً في أيّ نصٍّ عربي معدود", () => {
    // «1 أطفال» / «2 أطفال» / «1 أشهر»: the audited defect, for every counted phrase of the hall
    const bad = strings(HALL_LIVE_COPY.ar)
      .filter(([path]) => /\((1|2)\)$/.test(path))
      .filter(([, text]) =>
        /(^|[^\d])[12] (أطفال|أشهر|أيتام|مجموعات|سنوات|فوانيس|هدايا|كسوات)/.test(text),
      );
    expect(bad).toEqual([]);
    expect(ar.say.sponsor(1, "1")).not.toMatch(/\d/);
    expect(ar.time.before(1)).toBe("قبل شهر");
    expect(ar.time.after(3)).toBe("بعد 3 أشهر");
    expect(ar.time.after(11)).toBe("بعد 11 شهراً");
    expect(en.time.before(1)).toBe("1 month ago");
    expect(en.time.after(5)).toBe("In 5 months");
  });

  it("المشهد لا يختار صيغة الجمع بنفسه", () => {
    expect(SCENE).not.toMatch(/monthsAr|> 2 \?|=== 2 \?|<= 10 \?/);
  });
});

describe("المبالغ: عملةٌ واحدة عبر formatMoney", () => {
  it("كلّ مبلغٍ في القاعة الحيّة بعملة المنصّة الموحّدة وبأرقامٍ لاتينية", () => {
    for (const locale of ["ar", "en"]) {
      const kit = hallLive(locale);
      expect(kit.currency).toBe(UNIFIED_CURRENCY);
      expect(kit.money(10_000)).toBe(formatMoney(10_000, UNIFIED_CURRENCY, locale));
      expect(kit.money(10_000)).toMatch(/10,000/);
      expect(kit.money(TRACKS.qualify.unit)).not.toMatch(/[٠-٩]/);
    }
  });

  it("لا عملة مكتوبة باليد في المشهد ولا في نصوص القاعة", () => {
    expect(SCENE).not.toMatch(/ر\.س|SAR|ريال/);
    for (const [path, text] of [...strings(HALL_LIVE_COPY.ar), ...strings(HALL_LIVE_COPY.en)])
      expect(text, path).not.toMatch(/ر\.س|\bSAR\b|ريال|\$|€|USD|EUR/);
    // the scene writes money through the kit only
    expect(SCENE).toContain('const cash = (n) => `<span class="num">${LX.money(n)}</span>`;');
  });
});

describe("نسبة التمويل: رقمٌ واحد في بطاقة الدولة ولوحتها", () => {
  it("لكلّ دولة: نسبة البطاقة هي نسبة اللوحة، من مجاميع المناطق نفسها", () => {
    for (const co of COUNTRIES) {
      const regions = regionsFor(co);
      const f = countryFigures(co, regions);
      expect(f.card.funded, co.code).toBe(f.kpis.funded);
      expect(f.kpis.funded, co.code).toBe(totals(regions).pct);
      expect(f.kpis).toMatchObject({ need: totals(regions).need, waiting: totals(regions).gap });
    }
  });

  it("ألبانيا بأرقام المحرّك: البطاقة واللوحة رقمٌ واحد قبل الدعم وبعده", () => {
    const al = byCode("AL")!;
    const s0 = seed();
    const s1 = payEngine(s0, {
      track: "qualify",
      amount: 25_000,
      kids: 40,
      city: "tirana",
      donor: "x",
      at: 1_700_000_000_000,
    });
    for (const s of [s0, s1]) {
      const f = countryFigures(al, albaniaRegions(s, regionsFor(al)));
      expect(f.card.funded).toBe(f.kpis.funded);
    }
    // the audited pair: the seeded office figure differs from the regions' share, so the card
    // must not read it
    expect(al.sim.funded).not.toBe(countryFigures(al, regionsFor(al)).kpis.funded);
  });

  it("المشهد يكتب النسبتين من `countryFigures`، ولا يقرأ نسبة `sim` في موضع", () => {
    expect(fn("cardHTML")).toContain("countryFigures(CO, regionsOf(CO)).card");
    expect(fn("renderCountry")).toContain("countryFigures(CO, CITIES).kpis");
    expect(SCENE).not.toMatch(/sim\.funded/);
    // the card's regions are the very list the country stage stands on
    expect(SCENE).toContain("CITY_CACHE.AL = named(albaniaRegions(ENGINE, regionsFor(CO)));");
    expect(SCENE).toMatch(
      /const regionsOf = \(co\) =>\s+co\.code === "AL" && !demo\s+\? named\(albaniaRegions\(loadEngine\(store\), regionsFor\(co\)\)\)\s+: \(CITY_CACHE\[co\.code\] \?\? named\(regionsFor\(co\)\)\);/,
    );
  });
});

describe("الأرقام النموذجية تُسمّى نموذجية في القاعة الحيّة", () => {
  it("كلّ لوحةٍ حيّة تعرض رقماً نموذجياً تحمل شارته", () => {
    for (const name of [
      "cardHTML",
      "renderWorld",
      "renderCountry",
      "renderSupport",
      "renderImpact",
      "liveBig",
      "openImpactLog",
      "openTracks",
    ])
      expect(fn(name), name).toContain("${SAMPLE}");
    expect(SCENE).toContain('const SAMPLE = X ? `<span class="src">${X.sample}</span>` : "";');
    // the wall screens say it in words: the map line, the unit prices and the visit's record
    expect(fn("drawMap")).toContain("X.screen.mapLine(");
    expect(fn("drawTracks")).toContain("X.screen.tracksNote");
    // and the bar carries the mark on every stage
    const page = readFileSync(join(ROOT, "src/routes/hall.lazy.tsx"), "utf8");
    expect(page).toContain('{ "data-hall-live": "" }');
    expect(page).toContain("donor ? hc.donor.tag : trying ? c.tag : c.liveTag");
  });

  it("الدفع والأثر يقولان إنّهما محاكاة، ولا يدّعيان نتيجةً ولا خصماً", () => {
    for (const [c, sim, sample] of [
      [HALL_LIVE_COPY.ar, /محاكاة|محاكى|حاكيته|نحاكي/, /نموذجي/],
      [HALL_LIVE_COPY.en, /simulat/i, /sample/i],
    ] as const) {
      for (const text of [
        c.support.sub,
        c.support.pay,
        c.support.note,
        c.preview.eyebrow,
        c.story.eyebrow("X"),
        c.done.title,
        c.done.sub("X", "Y"),
        c.done.support,
        c.big.title,
        c.big.sub("X", "Y"),
        c.big.note,
        c.screen.impactTitle,
        c.log.sub,
        c.did.line("X", "Y"),
        c.film.support("X", "Y"),
        c.film.close,
      ])
        expect(text).toMatch(sim);
      for (const text of [
        c.sample,
        c.screen.mapLine("1", "2", "3"),
        c.screen.tracksNote,
        c.card.noteLinked("X"),
        c.card.noteDemo("X"),
        c.card.noteSim("X"),
        c.world.simNote,
        c.country.sampleCity,
        c.country.sampleRegion,
        c.directory.note,
        c.story.qBase("X"),
        c.story.noteEngine,
        c.story.noteSim("X"),
        c.big.note,
        c.kinds.sub,
        c.film.pick("X"),
      ])
        expect(text).toMatch(sample);
    }
  });

  it("دولةٌ متّصلة لا تُعرض أرقامها «حقيقية»: القاعة لا تقرأ من منصّة تشغيلها", () => {
    // the only «real» chip of the live hall is the directory's; `linked` changes a sentence only
    const real = [...SCENE.matchAll(/class="src real">\$\{([^}]+)\}/g)].map((m) => m[1]);
    expect(real.sort()).toEqual(["D.tag", "Dr.chip"]);
    expect(fn("cardHTML")).toContain("LINKED.has(CO.code) ? Cd.noteLinked(name)");
    expect(HALL_LIVE_COPY.en.card.noteLinked("X")).toMatch(/does not read from it yet/);
  });

  it("لا معرّف طفلٍ قابلٍ للدفع ولا رابط دفعٍ في لوحات القاعة الحيّة", () => {
    for (const name of ["renderSupport", "renderImpact", "liveBig", "pay"]) {
      const body = fn(name).replace('<a class="cta" href="/orphans">${B.real}</a>', "");
      expect(body, name).not.toMatch(/href=|\/support|\/checkout|orphanId/);
    }
    // the one way out of the simulation's close is the real directory, never «my impact»
    expect(fn("liveBig")).toContain('<a class="cta" href="/orphans">${B.real}</a>');
    expect(fn("liveBig")).not.toContain("toMine");
    // the sample child of the story carries a DEMO code, never a payable id
    expect(fn("renderImpact")).toContain("code: `DEMO-${CO.code}-${1000 + (hsh % 9000)}`");
  });
});

describe("القاعة والمنصّة: أسماء المسارات واحدة", () => {
  it("مسارات القاعة الحيّة بأسماء «اختر أثرك» نفسها، بالعربية والإنجليزية", async () => {
    const { GIVING_COPY } = await import("@/config/giving-tracks");
    const { copyOf } = await import("@/lib/locale");
    for (const l of ["ar", "en"] as const) {
      const hall = copyOf(HALL_LIVE_COPY, l).tracks;
      const giving = copyOf(GIVING_COPY, l).tracks;
      expect(hall.qualify.name).toBe(giving.qualification.name);
      expect(hall.sponsor.name).toBe(giving.monthly.name);
      expect(hall.kiswa.name).toBe(giving.in_kind.name);
    }
  });
});

describe("القاعة والخارطة: شبكةٌ واحدة", () => {
  it("كلّ دولةٍ في القاعة بحالتها هي نفسها في طبقة الشبكة على الخارطة", async () => {
    const { networkPaint } = await import("@/components/map/network-layer");
    const paint = networkPaint("network", { showUnconfirmed: true });
    for (const c of COUNTRIES) {
      expect(paint.get(c.code), c.code).toBe(c.st);
    }
  });
});
