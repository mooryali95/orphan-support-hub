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
import { hallEntry, hallLiveRows, hallReturn, hallSource, parseHallSearch } from "./source";
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
  it("التجربة بـ?try=1 أو بوضع المنصّة، وإلا فالحقيقي؛ و«أثري» من الوضع نفسه", () => {
    expect(hallSource({}, "trial")).toMatchObject({ mode: "trial", mine: "/try/impact" });
    expect(hallSource({ try: 1 }, "live")).toMatchObject({ mode: "trial", mine: "/try/impact" });
    expect(hallSource({}, "live")).toMatchObject({ mode: "live", mine: "/dashboard" });
  });

  it("لا ملفّ في القاعة يقرأ وضع المنصّة إلا source.ts، والصفحة تأخذ قرارها منه", () => {
    const readers = HALL_FILES.filter((f) => importsOf(f).includes("@/config/platform"));
    expect(readers).toEqual(["src/lib/hall/source.ts"]);
    const page = read("src/routes/hall.lazy.tsx");
    expect(page).toContain("hallSource(search)");
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
    expect(server).toEqual(["src/routes/hall.lazy.tsx ← @/lib/vision-links.functions"]);
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
    expect(read("src/routes/hall.lazy.tsx")).toContain("{NETWORK_SITES} موقعاً");
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
    expect(hallSource({ try: 1, c: "SN", from }, "trial")).toEqual({
      mode: "trial",
      mine: "/try/impact",
      back: from,
      start: "SN",
    });
    expect(hallSource({ from: "/dashboard" }, "live").back).toBeNull();
    // قبل الاعتماد يفتح داعمٌ مسجَّل القاعة من لوحته فيجدها تجربة: طريق العودة إلى لوحته باقٍ
    expect(hallSource({ from: "/dashboard" }, "trial")).toMatchObject({
      mode: "trial",
      back: "/dashboard",
    });
    expect(hallSource({ from: "/try/impact?kind=monthly" }, "trial").back).toBeNull();
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
      'hallSearch={{ from: "/dashboard" }}',
    );
  });
});
