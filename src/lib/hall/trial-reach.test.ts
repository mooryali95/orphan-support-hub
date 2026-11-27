/**
 * the hall may not say more about an amount than the trial's pages do. What a pledge's amount
 * stands for is worded in one place (`@/lib/try-reach`); the support sheet on `/try/support`
 * calls it directly, and the hall through `trialDemo().reach`. These tests fail when the two
 * diverge, when the amount stops changing what is shown, or when the hall's counts stop being
 * the ones «أثري» (`/try/impact`) reads for the same pledge, or when «أثري» stops wording the
 * pledge's reach through the same function.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { TRY_CURRENCY } from "@/lib/try-demo";
import { TRY_PLACES, tryChildOf } from "@/lib/try-places";
import {
  shareText,
  tryPledgeCurrencies,
  tryPledgeReach,
  tryPledgeReaches,
  tryReachText,
} from "@/lib/try-reach";
import { loadPledges, tryQualification } from "@/lib/try-support";

import { trialDemo } from "./trial";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
const now = new Date("2026-11-18T00:00:00Z");
const AMOUNTS = [1, 25, 50, 100, 480, 5000, 100_000];

describe("أثر المبلغ في القاعة هو ما تقوله ورقة الدعم للمدخل نفسه", () => {
  it("كلّ دولةٍ ومنطقةٍ ومبلغٍ وعملة: نصّ القاعة هو نصّ الورقة حرفاً بحرف", () => {
    for (const locale of ["ar", "en"]) {
      const d = trialDemo({ locale, store: mem(), clock: () => now });
      for (const place of TRY_PLACES) {
        for (const r of place.regions) {
          for (const currency of tryPledgeCurrencies(place.co).map((o) => o.currency)) {
            for (const amount of AMOUNTS) {
              const sheet = tryReachText(
                { scope: "region", target: r.id, co: place.co },
                amount,
                currency,
                locale,
              );
              expect(sheet).not.toBeNull();
              expect(d.reach({ co: place.co, region: r.hall, amount, currency })).toEqual(sheet);
            }
          }
        }
      }
    }
    // exhaustive on purpose (every place, region, currency and amount in both languages): about
    // two seconds on a laptop, more than the default five on a shared CI runner
  }, 60_000);

  it("المبلغ يغيّر المعروض: الحصّة تتبعه، بأرضيةٍ وسقف، ولا تدّعي المنطقة كلّها", () => {
    const t = { scope: "region" as const, target: "ALB-1529", co: "AL" };
    const unit = tryChildOf("AL")!.need;
    const a = tryPledgeReach(t, 50, TRY_CURRENCY)!;
    const b = tryPledgeReach(t, 500, TRY_CURRENCY)!;
    expect(a.fund).toBe(88 * unit);
    expect(a.share).toBeCloseTo((50 / (88 * unit)) * 100, 6);
    expect(b.share!).toBeGreaterThan(a.share!);
    expect(a.equals).toBe(Math.floor(50 / unit));
    expect(b.equals).toBe(Math.floor(500 / unit));
    // never 0% for a real amount, never above the whole fund
    expect(shareText(a.share!, "en")).toBe("under 1%");
    const all = tryPledgeReach(t, 100_000, TRY_CURRENCY)!;
    expect(all.share).toBe(100);
    expect(all.equals).toBe(88);
    expect(shareText(all.share!, "en")).toBe("100%");
    // the words name a fund and a share, and differ with the amount
    const small = tryReachText(t, 50, TRY_CURRENCY, "en")!;
    const large = tryReachText(t, 500, TRY_CURRENCY, "en")!;
    expect(small.head).toBe("Your pledge joins the Tirana fund");
    expect(small.line).not.toBe(large.line);
    expect(large.line).toContain("4 children out of 88 children");
    expect(large.share).toContain("4%");
  });

  it("مبلغٌ بعملةٍ أخرى يُقيَّد كما كُتب: لا تحويل، فلا حصّة تُدَّعى", () => {
    const t = { scope: "region" as const, target: "ALB-1529", co: "AL" };
    const r = tryPledgeReach(t, 50, "USD")!;
    expect(r.share).toBeNull();
    expect(r.equals).toBeNull();
    expect(tryReachText(t, 50, "USD", "en")!.share).toBeNull();
  });

  it("عملة الرحلة واحدة: عملة ملفّ التجربة أوّل ما تعرضه القاعة والورقة", () => {
    const d = trialDemo({ locale: "en", store: mem(), clock: () => now });
    const hall = d.model(0);
    for (const place of TRY_PLACES) {
      const list = hall.countries[place.co]!.currencies;
      expect(list).toEqual(tryPledgeCurrencies(place.co).map((o) => o.currency));
      expect(list[0]).toBe(TRY_CURRENCY);
      for (const r of hall.countries[place.co]!.regions) {
        for (const k of r.kids) expect(k.currency).toBe(list[0]);
      }
    }
  });

  it("ما تعدّه القاعة بعد التعهّد هو ما يعدّه «أثري» للتعهّد نفسه", () => {
    const store = mem();
    const d = trialDemo({ locale: "en", store, clock: () => now });
    const id = d.pledge({
      kind: "qualification",
      co: "BA",
      region: "BA-r1",
      amount: 50,
      currency: TRY_CURRENCY,
    })!;
    const hall = d.model(0);
    const entry = hall.history.find((e) => e.id === id)!;
    const page = tryQualification(loadPledges(store), now, "en").find((q) => q.id === id)!;
    expect(entry.money).toBe(d.money(50, TRY_CURRENCY));
    expect(entry.detail).toMatchObject({ type: "area", enrolled: page.area!.enrolled });
    const region = hall.countries["BA"]!.regions.find((r) => r.id === "BA-r1")!;
    expect(region.qualified).toBe(page.area!.enrolled);
    // and the share shown beside it is the fund's, not the whole region claimed for one donor
    const reach = d.reach({ co: "BA", region: "BA-r1", amount: 50, currency: TRY_CURRENCY })!;
    expect(reach.children).toBe(region.need);
    expect(reach.share).toBe("under 1%");
  });
});

describe("«أثري» يقول عن التعهّد ما قالته الورقة والقاعة", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf8");

  it("كلّ دولةٍ ومنطقةٍ ومبلغٍ وعملةٍ ونوع: القاعة = الورقة = «أثري» حرفاً بحرف", () => {
    for (const locale of ["ar", "en"] as const) {
      for (const kind of ["qualification", "in_kind"] as const) {
        const other = kind === "qualification" ? "in_kind" : "qualification";
        for (const place of TRY_PLACES) {
          const r = place.regions[0]!;
          // one visitor, every amount and currency in turn, a second apart
          const store = mem();
          let tick = 0;
          const d = trialDemo({
            locale,
            store,
            clock: () => new Date(now.getTime() + 1000 * tick++),
          });
          const expected: unknown[] = [];
          for (const currency of tryPledgeCurrencies(place.co).map((o) => o.currency)) {
            for (const amount of [25, 480, 100_000]) {
              const input = { co: place.co, region: r.hall, amount, currency };
              const id = d.pledge({ kind, ...input })!;
              expect(id).toBeTruthy();
              const sheet = tryReachText(
                { scope: "region", target: r.id, co: place.co },
                amount,
                currency,
                locale,
              )!;
              expect(d.reach(input)).toEqual(sheet);
              expected.unshift({ id, ...sheet });
            }
          }
          expect(tryPledgeReaches(loadPledges(store), kind, locale)).toEqual(expected);
          // the other kind's tab says nothing for these pledges
          expect(tryPledgeReaches(loadPledges(store), other, locale)).toEqual([]);
        }
      }
    }
  }, 60_000);

  it("تعهّدٌ من الورقة بأيّ نطاق: «أثري» يعيد نصّ الورقة، والأحدث أوّلاً", () => {
    const pledges = [
      { scope: "country" as const, target: "AL", co: "AL", amount: 480, currency: TRY_CURRENCY },
      { scope: "region" as const, target: "ALB-1529", co: "AL", amount: 50, currency: "USD" },
    ].map((p, i) => ({
      ...p,
      id: `p${i}`,
      kind: "qualification" as const,
      at: new Date(now.getTime() + i * 1000).toISOString(),
    }));
    const page = tryPledgeReaches(pledges, "qualification", "en");
    expect(page.map((r) => r.id)).toEqual(["p1", "p0"]);
    for (const p of pledges) {
      const sheet = tryReachText(p, p.amount, p.currency, "en")!;
      expect(page.find((r) => r.id === p.id)).toEqual({ id: p.id, ...sheet });
    }
    // a pledge typed in another currency claims no share on the page either
    expect(page[0]!.share).toBeNull();
  });

  it("الصفحة والورقة والقاعة تنادي الدالّة نفسها، ولا تصوغ الأثر بنفسها", () => {
    const page = read("src/components/try/TryImpactKinds.tsx");
    expect(page).toContain("tryPledgeReaches(pledges, kind, locale)");
    expect(page).toMatch(/\{r\.head\}[\s\S]*\{r\.line\}/);
    expect(read("src/routes/try.impact.tsx")).toContain("pledges={pledges ?? []}");
    expect(read("src/components/try/TrySupportSheet.tsx")).toContain("tryReachText(");
    expect(read("src/lib/hall/trial.ts")).toContain("tryReachText(");
    // one wording: nobody else writes a share of a fund
    for (const f of ["src/components/try/TryImpactKinds.tsx", "src/routes/try.impact.tsx"])
      expect(read(f)).not.toMatch(/shareText|tryPledgeReach\(/);
  });
});
