/**
 * the hall and the trial pages read one trial catalogue: the same places, regions and children.
 * A trial file (`trial.manifest.json`): it goes with the trial, and `source.test.ts` keeps what
 * holds without it.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ALBANIA } from "@/data/vision-demo";
import { resolveRegion, type RegionShape } from "@/lib/regions";
import { tryChild } from "@/lib/try-demo";
import { TRY_PLACES, tryChildOf, tryRegionName } from "@/lib/try-places";

import { byCode, COUNTRIES, regionsFor } from "./model";
import { hallEntry } from "./source";
import { trialHall } from "./trial";

/** the only child id the money functions accept (`orphanId: z.string().uuid()`) */
const PAYABLE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ROOT = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("قاعة التجربة وصفحاتها: كتالوجٌ واحد", () => {
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

  it("كل دولةٍ تحملها الصفحات ترسمها القاعة وتدخلها التجربة", () => {
    const hall = trialHall({ pledges: [], gifts: [], now: new Date("2026-06-01"), locale: "ar" });
    for (const c of COUNTRIES) expect(hall.countries[c.code], c.code).toBeDefined();
  });

  it("روابط صفحات التجربة إلى القاعة تمرّ من hallEntry أو تحمل طريق العودة", () => {
    expect(read("src/components/try/TryJourneyGuide.tsx")).not.toMatch(
      /search=\{\{\s*try: 1\s*\}\}/,
    );
    expect(read("src/routes/try.index.tsx")).not.toMatch(/search=\{\{\s*try: 1\s*\}\}/);
  });
});
