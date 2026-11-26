/**
 * الوضع الغامر والصفحات العادية منتجٌ واحد — حرّاسٌ يحمرّون إن افترقا من جديد:
 * مفتاح التجربة/الحقيقي في موضعٍ واحد، والقاعة تقرأ ما تقرؤه الصفحات (لا نسخةً لها)،
 * والدخول إليها والخروج منها يحملان السياق.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { toMapStats } from "@/components/map/demo-stats";
import { resolveMapSource } from "@/components/map/map-source";
import { ALBANIA, TRAITS as VISION_TRAITS } from "@/data/vision-demo";
import { NETWORK, NETWORK_SITES } from "@/data/vision-network";
import { demoGeography } from "@/lib/demo-network";
import { shapeGeo } from "@/lib/geo";
import { resolveRegion, type RegionShape } from "@/lib/regions";
import { tryChild } from "@/lib/try-demo";
import { TRY_PLACES, tryChildOf, tryRegionName } from "@/lib/try-places";

import { byCode, COUNTRIES, regionsFor, TRAITS } from "./model";
import { impactStats, myImpact } from "@/lib/my-impact";
import type { MySponsorship } from "@/lib/sponsorships.functions";

import { donorHall, donorOrphanIds } from "./donor";
import {
  hallDirectory,
  hallEntry,
  hallLanguage,
  hallLiveRows,
  hallReturn,
  hallSource,
  parseHallSearch,
} from "./source";
import { trialHall } from "./trial";

/** the only child id the money functions accept (`orphanId: z.string().uuid()`) */
const PAYABLE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ROOT = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** the hall's own files: the page, the scene and its model */
const HALL_FILES = [
  "src/routes/hall.tsx",
  "src/routes/hall.lazy.tsx",
  ...readdirSync(join(ROOT, "src/components/hall"))
    .filter((f) => /\.(js|ts)$/.test(f))
    .map((f) => `src/components/hall/${f}`),
  ...readdirSync(join(ROOT, "src/lib/hall"))
    .filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f))
    .map((f) => `src/lib/hall/${f}`),
];
const importsOf = (path: string) =>
  [...read(path).matchAll(/\bfrom\s+"([^"]+)"|\bimport\(\s*"([^"]+)"\s*\)/g)].map(
    (m) => m[1] ?? m[2]!,
  );

describe("مفتاح التجربة/الحقيقي: موضعٌ واحد", () => {
  it("التجربة بـ?try=1 وحدها، وإلا فالحقيقي؛ و«أثري» من الوضع نفسه", () => {
    expect(hallSource({ try: 1 })).toMatchObject({ mode: "trial", mine: "/try/impact" });
    expect(hallSource({ live: 1 })).toMatchObject({ mode: "live", mine: "/dashboard" });
    // الرابط العامّ بلا معرّف يفتح التجربة الموسومة، لا القاعة التصوّرية
    expect(hallSource({})).toMatchObject({ mode: "trial", mine: "/try/impact" });
    // زائرٌ في الوضع التجريبي يرى قاعة التجربة وحدها، ولو طلب الرابط الحقيقي أو أثر الداعم
    expect(hallSource({ live: 1 }, { demo: true })).toMatchObject({ mode: "trial" });
    expect(hallSource({ me: 1 }, { demo: true })).toMatchObject({ mode: "trial" });
    expect(parseHallSearch({ live: "1" })).toEqual({ live: 1 });
  });

  it("لا ملفّ في القاعة يقرأ وضع المنصّة، والصفحة تأخذ قرارها من source.ts", () => {
    const readers = HALL_FILES.filter((f) => importsOf(f).includes("@/config/platform"));
    expect(readers).toEqual([]);
    const page = read("src/routes/hall.lazy.tsx");
    // the visitor's demo session is an input to the same decision, not a second switch
    expect(page).toContain("hallSource(search, { demo })");
    expect(page).not.toMatch(/search\.try\b/);
  });
});

describe("الحقيقي: القاعة تقرأ مسار الصفحات نفسه ولا توسّع قراءة", () => {
  it("لا عميل قاعدة ولا دالّة خادم في ملفّات القاعة إلا روابط التشغيل، وأعدادها من geoQuery", () => {
    const server = HALL_FILES.flatMap((f) =>
      importsOf(f)
        .filter((i) => /supabase|\.functions$|\.server$/.test(i))
        .map((i) => `${f} ← ${i}`),
    );
    // the donor's hall adds the dashboard's own list (its gate unchanged) and the public card
    // any visitor reads; `donor.ts` takes the list's type only
    // and the live hall's core countries: codes only, no counts (`public_focus_countries`)
    expect(server.sort()).toEqual([
      "src/lib/hall/donor.ts ← @/lib/sponsorships.functions",
      "src/routes/hall.lazy.tsx ← @/lib/focus-countries.functions",
      "src/routes/hall.lazy.tsx ← @/lib/orphans.functions",
      "src/routes/hall.lazy.tsx ← @/lib/sponsorships.functions",
      "src/routes/hall.lazy.tsx ← @/lib/vision-links.functions",
    ]);
    expect(read("src/lib/hall/donor.ts")).toMatch(
      /import type \{ MySponsorship \} from "@\/lib\/sponsorships\.functions"/,
    );
    const page = read("src/routes/hall.lazy.tsx");
    expect(page).toContain("fetchQuery(geoQuery)");
    expect(page).toContain(".then(hallLiveRows)");
  });

  it("ما تُعطاه القاعة عن الدولة هو ما ترسمه الخريطة منه: العدد نفسه والحجب نفسه", () => {
    const geo = shapeGeo(
      [
        {
          country: "ألبانيا",
          total: 128,
          sponsored: 40,
          small: false,
          gap: 900,
          currency: "EUR",
          delivered: 12,
          regions: [],
        },
        {
          country: "Kosovo",
          total: null,
          sponsored: null,
          small: true,
          gap: null,
          currency: null,
          delivered: null,
          regions: [],
        },
      ] as Parameters<typeof shapeGeo>[0],
      true,
    );
    const map = toMapStats(resolveMapSource(geo, { demoMode: false, failed: false }).geo);
    const hall = hallLiveRows(geo);
    expect(hall.map((r) => r.code).sort()).toEqual(Object.keys(map).sort());
    for (const r of hall) {
      const m = map[r.code!]!;
      expect([r.value, r.total, r.sponsored, r.small]).toEqual([
        m.value,
        m.total,
        m.sponsored,
        m.small,
      ]);
    }
    expect(hall.find((r) => r.code === "XK")).toMatchObject({ total: null, small: true });
  });

  it("ما تكتبه القاعة الحيّة عن الدولة هو ما تكتبه ورقة الخريطة: العدد والمنتظرون والحجب", () => {
    const row = (
      country: string,
      total: number | null,
      sponsored: number | null,
      small = false,
    ) => ({
      country,
      total,
      sponsored,
      small,
      gap: null,
      currency: null,
      delivered: null,
      regions: [],
    });
    const geo = shapeGeo(
      [
        row("ألبانيا", 128, 40),
        row("Kosovo", null, null, true),
        row("Senegal", 1, 0),
        row("Egypt", 7, 7),
        row("Turkey", 30, null),
        row("Ghana", 0, 0),
      ] as Parameters<typeof shapeGeo>[0],
      true,
    );
    const map = toMapStats(resolveMapSource(geo, { demoMode: false, failed: false }).geo);
    for (const r of hallLiveRows(geo)) {
      const m = map[r.code!]!;
      // the map's country sheet (`WorldMap`): hidden when small or uncounted, else the total,
      // and «ينتظرون» is total − sponsored when both are known
      const hidden = m.small || m.total == null;
      const waiting = m.total != null && m.sponsored != null ? m.total - m.sponsored : null;
      const hall = hallDirectory(r);
      expect(hall.total, r.value).toBe(hidden || !m.total ? null : m.total);
      expect(hall.waiting, r.value).toBe(hall.total == null ? null : waiting);
      expect(hall.href).toBe(`/orphans?country=${encodeURIComponent(m.value)}`);
    }
    const of = (code: string) => hallDirectory(hallLiveRows(geo).find((r) => r.code === code)!);
    expect(of("AL")).toMatchObject({ total: 128, waiting: 88 });
    expect(of("XK")).toMatchObject({ total: null, waiting: null }); // small cohort: no number
    expect(of("SN")).toMatchObject({ total: 1, waiting: 1 });
    expect(of("TR")).toMatchObject({ total: 30, waiting: null });
    // the scene writes the directory through this one selector, and reads no row field itself
    const scene = read("src/components/hall/hall-scene.js");
    expect(scene).toContain("const d = hallDirectory(r),");
    expect(scene).not.toMatch(/\br\.(total|sponsored|small)\b/);
  });

  it("دليلٌ متعذّر لا يعطي القاعة رقماً، ووضع العرض يعطيها ما يعطي الخريطة", () => {
    expect(hallLiveRows({ available: false, countries: demoGeography().countries })).toEqual([]);
    const demo = resolveMapSource(undefined, { demoMode: true, failed: false }).geo;
    expect(hallLiveRows(demoGeography())).toEqual(demo.countries);
  });
});

describe("التجربة والعرض: تعريفٌ واحد لما يتكرّر", () => {
  it("السمات الستّ في القاعة هي سمات منصة الرؤية بأسمائها ومتوسّطيها", () => {
    expect(TRAITS).toEqual(VISION_TRAITS.map((t) => [t.name.ar, t.before, t.after]));
  });

  it("عدد المواقع واحد: شبكة الرؤية = ما ترسمه القاعة مؤكَّداً، ولا رقم مكتوباً باليد", () => {
    const drawn = COUNTRIES.filter((c) => c.st !== "unconfirmed");
    expect(NETWORK_SITES).toBe(NETWORK.length - 1);
    expect(NETWORK_SITES).toBe(drawn.length - 1);
    expect(read("src/routes/hall.lazy.tsx")).toContain(
      "(trying ? c.netTrial : c.net)(formatCount(NETWORK_SITES, locale))",
    );
    for (const f of ["src/routes/hall.lazy.tsx", "src/components/hall/hall-scene.js"])
      expect(read(f)).not.toMatch(/\d+(<\/span>)?\s*موقعاً/);
  });

  it("مدن ألبانيا في العرض بأسماء الخريطة، ومنطقتا التجربة منها بالاسم والعدد", () => {
    const map = (JSON.parse(read("public/geo/admin1/AL.json")) as { regions: RegionShape[] })
      .regions;
    for (const c of ALBANIA) expect(resolveRegion(c.name.en, map)).toBe(c.name.ar);
    const al = TRY_PLACES.find((p) => p.co === "AL")!;
    const columns = regionsFor(byCode("AL")!);
    for (const r of al.regions) {
      const city = ALBANIA.find((c) => c.id === r.hall)!;
      expect(city).toBeDefined();
      expect(tryRegionName(r.id, "ar")).toBe(city.name.ar);
      expect(r.children).toBe(city.need);
      expect(columns.find((c) => c.id === r.hall)).toMatchObject({ ar: city.name.ar });
    }
  });

  it("طفل الدولة في القاعة هو طفل الصفحات نفسه، ومعرّفه لا يدخل مساراً مالياً", () => {
    const hall = trialHall({ pledges: [], gifts: [], now: new Date("2026-06-01"), locale: "ar" });
    for (const place of TRY_PLACES) {
      const kids = hall.countries[place.co]!.regions.flatMap((r) => r.kids);
      const page = tryChildOf(place.co)!;
      expect(kids.map((k) => k.id)).toEqual([page.id]);
      expect(kids[0]).toMatchObject({ code: page.code, need: page.need });
      expect(tryChild(page.id)).toBe(page);
      expect(PAYABLE_ID.test(page.id)).toBe(false);
      expect(page.code.startsWith("DEMO-")).toBe(true);
    }
  });
});

describe("الدخول والخروج يحملان السياق", () => {
  it("البحث: دولةٌ برمزها، وعودةٌ إلى مسارٍ داخل الموقع وحده", () => {
    expect(parseHallSearch({ try: "1", c: "AL", from: "/try/support?c=AL&r=ALB-1529" })).toEqual({
      try: 1,
      c: "AL",
      from: "/try/support?c=AL&r=ALB-1529",
    });
    expect(parseHallSearch({ c: "al", from: "https://evil.example" })).toEqual({});
    for (const bad of ["//evil.example", "/\\evil.example", "javascript:alert(1)", "/hall?try=1"])
      expect(hallReturn(bad)).toBeNull();
    expect(hallReturn("/dashboard")).toBe("/dashboard");
  });

  it("رابط القاعة من صفحةٍ يحمل دولتها وطريق العودة ببحثها كما هو", () => {
    const childCo = ({ pathname }: { pathname: string }) =>
      tryChild(/^\/try\/(try-\w\w)$/.exec(pathname)?.[1] ?? "")?.co;
    const kid = tryChildOf("EG")!;
    expect(hallEntry({ pathname: `/try/${kid.id}`, search: {} }, { try: 1 }, childCo)).toEqual({
      try: 1,
      c: "EG",
      from: `/try/${kid.id}`,
    });
    expect(
      hallEntry(
        { pathname: "/try/support", search: { c: "SN", r: "SEN-759", kind: "in_kind" } },
        { try: 1 },
        childCo,
      ),
    ).toEqual({ try: 1, c: "SN", from: "/try/support?c=SN&r=SEN-759&kind=in_kind" });
    expect(hallEntry({ pathname: "/try", search: {} }, { try: 1 }, childCo)).toEqual({
      try: 1,
      from: "/try",
    });
  });

  it("القاعة تفتح على الدولة المحمولة، وتعرض «عودة» حين تختلف الصفحة عن «أثري»", () => {
    const from = "/try/support?c=SN&r=SEN-759&kind=in_kind";
    expect(hallSource({ try: 1, c: "SN", from })).toEqual({
      mode: "trial",
      mine: "/try/impact",
      back: from,
      start: "SN",
    });
    expect(hallSource({ live: 1, from: "/dashboard" }).back).toBeNull();
    expect(hallSource({ try: 1, from: "/try/impact?kind=monthly" }).back).toBeNull();
  });

  it("كل دولةٍ تحملها الصفحات ترسمها القاعة وتدخلها التجربة", () => {
    const hall = trialHall({ pledges: [], gifts: [], now: new Date("2026-06-01"), locale: "ar" });
    for (const c of COUNTRIES) expect(hall.countries[c.code], c.code).toBeDefined();
  });

  it("روابط الصفحات إلى القاعة تمرّ من hallEntry أو تحمل طريق العودة", () => {
    expect(read("src/components/try/TryJourneyGuide.tsx")).not.toMatch(
      /search=\{\{\s*try: 1\s*\}\}/,
    );
    expect(read("src/routes/try.index.tsx")).not.toMatch(/search=\{\{\s*try: 1\s*\}\}/);
    expect(read("src/routes/_authenticated/dashboard.tsx")).toContain(
      'hallSearch={{ me: 1, from: "/dashboard" }}',
    );
  });
});

/* ── قاعة الداعم: أثره الحقيقي من مصدر لوحته، لا من كتالوج التجربة ─────────────────────── */

const NOW = new Date("2026-11-23T00:00:00Z");
const KID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const sponsorship = (
  n: number,
  over: Partial<MySponsorship> = {},
  need = 100,
  funded = 60,
): MySponsorship => ({
  id: `10000000-0000-4000-8000-00000000000${n}`,
  amount: 40,
  currency: "EUR",
  type: "monthly",
  status: "active",
  created_at: "2026-01-10T00:00:00Z",
  started_at: "2026-01-15T00:00:00Z",
  ended_at: null,
  end_reason: null,
  cancel_effective_at: null,
  paused_until: null,
  provider_subscription_id: null,
  orphan: {
    id: KID(n),
    display_name: `طفل ${n}`,
    code: `KH-${n}`,
    monthly_need: need,
    funded_monthly: funded,
  },
  ...over,
});
/** a donor with every kind of row the dashboard meets */
const MINE: MySponsorship[] = [
  sponsorship(1),
  sponsorship(2, { amount: 25, status: "paused", started_at: "2025-06-01T00:00:00Z" }, 80, 80),
  sponsorship(3, { type: "one_time", status: "completed", ended_at: "2026-03-01T00:00:00Z" }),
  sponsorship(4, { status: "cancelled", ended_at: "2026-05-01T00:00:00Z" }),
  sponsorship(5, { status: "pending_payment" }),
  sponsorship(6, { amount: 33.3 }, 99, 10),
  sponsorship(7, { orphan: null }),
];
/** the country on each child's public card, as the directory stores it */
const CARD: Record<string, string | null> = {
  [KID(1)]: "ألبانيا",
  [KID(2)]: "AL",
  [KID(3)]: "Kosovo",
  [KID(4)]: null,
  [KID(6)]: "كوسوفو",
};
const cardOf = (id: string) => CARD[id];

describe("مفتاح القاعة: الداعم من لوحته يرى أثره هو", () => {
  it("?me=1 يفتح قاعة الداعم، و?try=1 يبقى تجربة", () => {
    expect(hallSource({ me: 1 })).toMatchObject({ mode: "donor", mine: "/dashboard" });
    expect(hallSource({ me: 1, try: 1 }).mode).toBe("trial");
    expect(parseHallSearch({ me: "1", from: "/dashboard" })).toEqual({
      me: 1,
      from: "/dashboard",
    });
    expect(parseHallSearch({ me: "yes" })).toEqual({});
    // returning to the dashboard is «أثري» itself: no second chip
    expect(hallSource({ me: 1, from: "/dashboard" }).back).toBeNull();
  });

  it("اللوحة تدخل القاعة بـme=1، والصفحة لا تحمّل كتالوج التجربة للداعم", () => {
    expect(read("src/routes/_authenticated/dashboard.tsx")).toContain(
      'hallSearch={{ me: 1, from: "/dashboard" }}',
    );
    const page = read("src/routes/hall.lazy.tsx");
    expect(page).toContain("trying ? loadHallTrial() : null");
    expect(page).toContain('const donor = source.mode === "donor"');
    // real and sample never share a view: the scene's donor path exists only without the demo
    expect(read("src/components/hall/hall-scene.js")).toContain("const donor = !!mine && !demo;");
  });

  it("لغة القاعة: القاعات الثلاث بلغة الواجهة، والحيّة منها لا تُثبَّت على العربية", () => {
    for (const mode of ["trial", "donor", "live"] as const) {
      expect(hallLanguage(mode, "en")).toBe("en");
      expect(hallLanguage(mode, "ar")).toBe("ar");
      expect(hallLanguage(mode, "sq")).toBe("sq");
    }
    // `lang` and `dir` on the hall follow the same locale, and the live copy is loaded for it
    const page = read("src/routes/hall.lazy.tsx");
    expect(page).toContain("dir={dirOf(locale)}");
    expect(page).toContain("lang={locale}");
    expect(page).toContain('trying || donor ? null : import("@/lib/hall/live")');
    expect(page).toContain("text: liveHall ? liveHall.hallLive(locale) : null");
  });
});

describe("أرقام الداعم في القاعة هي أرقام لوحته: المصدر نفسه والكتابة نفسها", () => {
  it("للقائمة نفسها: الصورة هي `myImpact` والأرقام هي `impactStats`، حرفاً بحرف", () => {
    const hall = donorHall(MINE, cardOf, NOW);
    const dashboard = myImpact(MINE, NOW);
    expect(hall.impact).toEqual(dashboard);
    expect(hall.stats).toEqual(impactStats(dashboard));
    // and the figures are what the hero has always written
    expect(hall.stats).toEqual({
      inCare: String(dashboard.inCare),
      months: String(dashboard.months),
      share: String(Math.round(dashboard.share * 100)),
    });
    expect(dashboard.inCare).toBe(3);
  });

  it("رأس اللوحة والقاعة يكتبان من `impactStats` وحدها، ولا يحسب أحدهما رقماً ثانياً", () => {
    const hero = read("src/components/impact/MyImpactHero.tsx");
    expect(hero).toContain("impactStats(view)");
    expect(hero).not.toMatch(/String\(view\.(inCare|months)\)|Math\.round\(view\.share/);
    const donor = read("src/lib/hall/donor.ts");
    expect(donor).toContain("myImpact(list, now)");
    expect(donor).toContain("stats: impactStats(impact)");
    const scene = read("src/components/hall/hall-scene.js");
    for (const k of ["inCare", "months", "share"]) expect(scene).toContain(`MINE.stats.${k}`);
    // the scene never derives a figure from the picture: it writes the three strings it is given
    expect(scene).not.toMatch(/MINE\??\.impact\.(inCare|months|share)/);
    expect(scene).not.toMatch(/data-count="\$\{MINE/);
  });

  it("القاعة تقرأ قائمة اللوحة نفسها: الدالّة نفسها والمفتاح نفسه، وببوّابتها", () => {
    const page = read("src/routes/hall.lazy.tsx");
    const dashboard = read("src/routes/_authenticated/dashboard.tsx");
    for (const src of [page, dashboard]) {
      expect(src).toContain('queryKey: ["my-sponsorships"]');
      expect(src).toContain("useServerFn(listMySponsorships)");
    }
    expect(page).toContain("donorHall(res.sponsorships,");
    // the gate and the card's columns are the dashboard's, untouched
    const fn = read("src/lib/sponsorships.functions.ts");
    expect(fn).toMatch(
      /listMySponsorships = createServerFn\(\{ method: "GET" \}\)\s*\.middleware\(\[requireSupabaseAuth\]\)/,
    );
    expect(fn).toContain("orphan:orphans(id, display_name, code, monthly_need, funded_monthly)");
  });

  it("الدول من البطاقة العامّة: كلّ طفلٍ في دولةٍ واحدة أو خارج الكرة، والمجموع لا ينقص", () => {
    const hall = donorHall(MINE, cardOf, NOW);
    expect(hall.countries.map((c) => [c.code, c.inCare, c.children.length])).toEqual([
      ["AL", 2, 2],
      ["XK", 1, 2],
    ]);
    const placed = hall.countries.reduce((a, c) => a + c.children.length, 0);
    expect(placed + hall.unplaced).toBe(hall.impact.children.length);
    expect(hall.countries.reduce((a, c) => a + c.inCare, 0)).toBeLessThanOrEqual(
      hall.impact.inCare,
    );
    expect(hall.unplaced).toBe(1); // the child whose card names no country
    expect(hall.start).toBe("AL");
    // only the public card is asked for, once per real child, never for an unpaid request
    expect(donorOrphanIds(MINE)).toEqual([KID(1), KID(2), KID(3), KID(4), KID(6)]);
  });

  it("لا صورة ولا مكان: الطفل اسمه المعروض وأشهره وحصّته ورابط ملفّه العامّ لا غير", () => {
    const kid = donorHall(MINE, cardOf, NOW).countries[0]!.children[0]!;
    expect(Object.keys(kid).sort()).toEqual(["active", "href", "months", "name", "share"]);
    expect(kid).toMatchObject({ name: "طفل 1", share: "40%", href: `/orphans/${KID(1)}` });
    const code = read("src/lib/hall/donor.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(code).not.toMatch(/photo|region|city|story|birth|real_name|supabase/i);
    // the page takes the country alone from the card
    expect(read("src/routes/hall.lazy.tsx")).toContain("[id, r.orphan?.country ?? null]");
  });

  it("بلا كفالات: حالة فارغة صادقة، لا أرقام نموذجية", () => {
    const hall = donorHall([], cardOf, NOW);
    expect(hall).toMatchObject({ countries: [], unplaced: 0, start: null });
    expect(hall.stats).toEqual({ inCare: "0", months: "0", share: "0" });
    expect(hall.impact.children).toEqual([]);
    const scene = read("src/components/hall/hall-scene.js");
    expect(scene).toContain("!MINE.impact.children.length");
    expect(scene).toContain('href="/orphans"');
    // the donor's path stops before every simulated stage
    expect(scene).toMatch(/function enterCountry\(\) \{\s*if \(donor\) return;/);
    expect(scene).toMatch(/if \(FILM \|\| donor \|\| S\.stage !== "gate"\) return;/);
  });

  it("معرّف طفلٍ تجريبي لا يصير رابطاً ولا يُطلب: المعرّف القابل للدفع وحده", () => {
    const trial = Object.values(
      trialHall({ pledges: [], gifts: [], now: NOW, locale: "ar" }).countries,
    )[0]!.regions.flatMap((r) => r.kids)[0]!.id;
    expect(trial).not.toMatch(PAYABLE_ID);
    const list = [
      sponsorship(1, {
        orphan: { ...sponsorship(1).orphan!, id: trial },
      }),
    ];
    expect(donorOrphanIds(list)).toEqual([]);
    const hall = donorHall(list, () => "AL", NOW);
    expect(hall.countries).toEqual([]);
    expect(hall.unplaced).toBe(1);
    for (const c of donorHall(MINE, cardOf, NOW).countries) {
      for (const k of c.children) expect(k.href.replace("/orphans/", "")).toMatch(PAYABLE_ID);
    }
  });
});

describe("الخريطة والقاعة: نوع العطاء ينتقل بينهما", () => {
  it("القاعة تقرأ نوع العطاء من الرابط، وتهمل ما ليس منه", () => {
    expect(parseHallSearch({ kind: "in_kind", c: "SN" })).toMatchObject({
      kind: "in_kind",
      c: "SN",
    });
    expect(parseHallSearch({ kind: "monthly" })).toMatchObject({ kind: "monthly" });
    expect(parseHallSearch({ kind: "zakat" })).not.toHaveProperty("kind");
  });
});
