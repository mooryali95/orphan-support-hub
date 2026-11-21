import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { byCode, regionsFor, TRAITS } from "./hall/model";
import { IMPACT_COHORT_MIN, journeyFromQualification } from "./support-impact";
import { TRY_CHILDREN } from "./try-demo";
import {
  placeChildren,
  TRY_FEATURED,
  TRY_GROUP_SIZE,
  TRY_PLACES,
  TRY_SESSIONS,
  TRY_TRAITS,
  tryChildOf,
  tryChildren,
  tryRegionOfChild,
  tryTraitName,
} from "./try-places";
import {
  addPledge,
  loadPledges,
  resetPledges,
  targetChildren,
  targetLabel,
  tryArea,
  tryAreaCounts,
  tryInKind,
  tryMapStats,
  tryMyPledges,
  tryOrphanQualification,
  tryQualification,
  tryRegionByName,
  validTarget,
  type TryPledge,
  type TryTarget,
} from "./try-support";

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
const region: TryTarget = { scope: "region", target: "EGY-1533", co: "EG" };

/** every target the trial can pledge to, from the source */
const allTargets = (): TryTarget[] =>
  TRY_PLACES.flatMap((p) => [
    { scope: "country" as const, target: p.co, co: p.co },
    ...p.regions.map((r) => ({ scope: "region" as const, target: r.id, co: p.co })),
    { scope: "group" as const, target: p.group.id, co: p.co },
    { scope: "orphan" as const, target: tryChildOf(p.co)!.id, co: p.co },
  ]);

describe("مصدر التجربة الواحد: لا تداخل ولا تناقض ولا تكرار", () => {
  it("لا معرّف ولا رمز يتكرّر، ولا شيء يشبه معرّفاً قابلاً للدفع", () => {
    const ids = [
      ...tryChildren().map((c) => c.id),
      ...tryChildren().map((c) => c.code),
      ...TRY_PLACES.map((p) => p.co),
      ...TRY_PLACES.flatMap((p) => p.regions.map((r) => r.id)),
      ...TRY_PLACES.flatMap((p) => p.regions.map((r) => `${p.co}:${r.hall}`)),
      ...TRY_PLACES.map((p) => p.group.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    for (const p of TRY_PLACES) expect(p.group.id.startsWith("DEMO-")).toBe(true);
    expect(new Set(TRY_TRAITS).size).toBe(TRY_TRAITS.length);
  });

  it("الأماكن دول أطفال التجربة، وكل طفلٍ في منطقةٍ منها هي منطقته في القاعة", () => {
    expect(TRY_FEATURED.map((p) => p.co).sort()).toEqual(TRY_CHILDREN.map((c) => c.co).sort());
    // every country of the trial, generated or written by hand, has exactly one trial child
    expect(TRY_PLACES.map((p) => p.co).sort()).toEqual(
      tryChildren()
        .map((c) => c.co)
        .sort(),
    );
    for (const c of tryChildren()) {
      const r = tryRegionOfChild(c);
      expect(r?.hall).toBe(c.region);
      expect(tryChildOf(c.co)).toBe(c);
    }
  });

  it("مناطق التجربة في ملفّ الخريطة باسمها ومعرّفها", () => {
    for (const p of TRY_PLACES) {
      const file = JSON.parse(readFileSync(`public/geo/admin1/${p.co}.json`, "utf8")) as {
        regions: Array<{ id: string; en: string }>;
      };
      for (const r of p.regions) {
        expect(file.regions.find((x) => x.id === r.id)?.en).toBe(r.en);
        expect(tryRegionByName(p.co, r.en)?.id).toBe(r.id);
      }
    }
  });

  it("عدد أطفال المنطقة هو ما تعرضه قاعة الأثر لمنطقتها، والسمات بترتيبها وأسمائها", () => {
    // the six hand-written countries carry the hall model's own counts
    for (const p of TRY_FEATURED) {
      const hall = regionsFor(byCode(p.co)!);
      for (const r of p.regions) {
        expect(hall.find((h) => h.id === r.hall)?.need, `${p.co}:${r.hall}`).toBe(r.children);
      }
    }
    for (const p of TRY_PLACES) {
      expect(p.group.children).toBe(TRY_GROUP_SIZE);
      expect(p.group.children).toBeLessThanOrEqual(p.regions[0].children);
    }
    expect(TRY_TRAITS.map((k) => tryTraitName(k, "ar"))).toEqual(TRAITS.map(([name]) => name));
  });

  it("المجاميع مجموع أجزائها: الدولة منطقتاها، في الخريطة وفي الأثر، في كل شهر", () => {
    const stats = tryMapStats();
    for (const p of TRY_PLACES) {
      const s = stats[p.co]!;
      const parts = p.regions.map((r) => s.regions[r.en]!.total!);
      expect(s.total).toBe(parts.reduce((a, b) => a + b, 0));
      expect(s.total).toBe(placeChildren(p));
      expect(s.gap).toBeNull();
      const country: TryTarget = { scope: "country", target: p.co, co: p.co };
      expect(targetChildren(country)).toBe(placeChildren(p));
      for (let m = 0; m <= 12; m += 1) {
        const whole = tryAreaCounts(country, m);
        const sum = p.regions
          .map((r) => tryAreaCounts({ scope: "region", target: r.id, co: p.co }, m))
          .reduce((a, b) => ({
            enrolled: a.enrolled + b.enrolled,
            started: a.started + b.started,
            completed: a.completed + b.completed,
            sessionsPlanned: a.sessionsPlanned + b.sessionsPlanned,
            sessionsHeld: a.sessionsHeld + b.sessionsHeld,
          }));
        expect(whole).toEqual(sum);
        // the group is part of its region, and the child is the group's first member
        const first = tryAreaCounts({ scope: "region", target: p.regions[0].id, co: p.co }, m);
        const group = tryAreaCounts({ scope: "group", target: p.group.id, co: p.co }, m);
        const child = tryAreaCounts({ scope: "orphan", target: tryChildOf(p.co)!.id, co: p.co }, m);
        expect(group.sessionsHeld).toBeLessThanOrEqual(first.sessionsHeld);
        expect(child.sessionsHeld).toBeLessThanOrEqual(group.sessionsHeld);
        expect(child.sessionsHeld).toBe(tryOrphanQualification(m).units_accepted);
      }
    }
  });

  it("متوسّط الدولة بين متوسّطَي منطقتيها", () => {
    const eg = tryArea({ scope: "country", target: "EG", co: "EG" }, 3).traits!;
    const a = tryArea({ scope: "region", target: "EGY-1533", co: "EG" }, 3).traits!;
    const b = tryArea({ scope: "region", target: "EGY-1544", co: "EG" }, 3).traits!;
    eg.forEach((t, i) => {
      for (const k of ["before", "latest"] as const) {
        expect(t[k]).toBeGreaterThanOrEqual(Math.min(a[i]![k], b[i]![k]) - 1e-9);
        expect(t[k]).toBeLessThanOrEqual(Math.max(a[i]![k], b[i]![k]) + 1e-9);
      }
    });
  });

  it("كل هدف تعهّدٍ يُحلّ إلى كيانٍ في المصدر، وما عداه يُرفض", () => {
    const store = mem();
    for (const t of allTargets()) {
      expect(validTarget(t), `${t.scope}:${t.target}`).toBe(true);
      expect(targetLabel(t, "en").label).not.toBe("");
    }
    expect(validTarget({ scope: "region", target: "EGY-1533", co: "AL" })).toBe(false);
    expect(validTarget({ scope: "orphan", target: "try-03", co: "AL" })).toBe(false);
    // a territory the map file gives no two regions for is not in the catalogue
    expect(validTarget({ scope: "country", target: "AQ", co: "AQ" })).toBe(false);
    expect(validTarget({ scope: "country", target: "ZZ", co: "ZZ" })).toBe(false);
    expect(
      addPledge(
        { ...region, target: "nope", kind: "qualification", amount: 50, currency: "USD" },
        store,
        now,
      ),
    ).toBeNull();
    // two pledges in the same millisecond still get two ids
    const a = addPledge(
      { ...region, kind: "qualification", amount: 50, currency: "USD" },
      store,
      now,
    );
    const b = addPledge({ ...region, kind: "in_kind", amount: 25, currency: "EGP" }, store, now);
    expect(a?.id.startsWith("DEMO-PLG-")).toBe(true);
    expect(a?.id).not.toBe(b?.id);
    expect(loadPledges(store)).toHaveLength(2);
    store.setItem(
      "try-support:v1",
      JSON.stringify([a, a, { kind: "monthly" }, null, { ...a, id: "x", amount: -1 }]),
    );
    expect(loadPledges(store)).toHaveLength(1);
    resetPledges(store);
    expect(loadPledges(store)).toEqual([]);
  });
});

describe("دعم التجربة بنوعه ونطاقه", () => {
  it("الأسماء بلغة الواجهة، والمجموعة برمزها", () => {
    expect(targetLabel(region, "en")).toEqual({ label: "Cairo", place: "Egypt" });
    expect(targetLabel({ scope: "group", target: "DEMO-GRP-EG", co: "EG" }, "en").code).toBe(
      "DEMO-GRP-EG",
    );
    expect(targetLabel({ scope: "orphan", target: "try-03", co: "EG" }, "en").label).toBe("Maryam");
    expect(targetLabel({ scope: "country", target: "EG", co: "EG" }, "en").place).toBeNull();
  });

  it("رحلة الطفل بشكل orphan_qualification: مشرفٌ، فقياسٌ قبلي، فجلستان كل شهر، فقياسٌ بعدي", () => {
    expect(tryOrphanQualification(0)).toMatchObject({
      units_total: TRY_SESSIONS,
      units_accepted: 0,
      has_supervisor: true,
      measured_before: false,
    });
    expect(tryOrphanQualification(1)).toMatchObject({ units_accepted: 2, measured_before: true });
    expect(tryOrphanQualification(3)).toMatchObject({
      units_accepted: TRY_SESSIONS,
      measured_after: false,
    });
    expect(tryOrphanQualification(4).measured_after).toBe(true);
    expect(journeyFromQualification(tryOrphanQualification(2, "en"))).toMatchObject({
      sessionsPlanned: TRY_SESSIONS,
      sessionsHeld: 4,
      measuredBefore: true,
    });
  });

  it("المنطقة: مجاميع تتقدّم ولا تتراجع، والمتوسّطات بعد حدّ الحشد وحده", () => {
    const at0 = tryArea(region, 0);
    expect(at0).toMatchObject({ enrolled: 44, started: null, sessionsHeld: 0, traits: null });
    let prev = at0;
    for (let m = 1; m <= 12; m += 1) {
      const a = tryArea(region, m);
      expect(a.sessionsHeld).toBeGreaterThanOrEqual(prev.sessionsHeld);
      expect(a.sessionsHeld).toBeLessThanOrEqual(a.sessionsPlanned);
      expect(a.completed ?? 0).toBeLessThanOrEqual(a.started ?? 0);
      for (const t of a.traits ?? []) {
        expect(t.latest).toBeGreaterThanOrEqual(t.before);
        expect(t.latest).toBeLessThanOrEqual(100);
      }
      prev = a;
    }
    expect(prev).toMatchObject({ started: 44, completed: 44, sessionsHeld: 44 * TRY_SESSIONS });
    expect(prev.traits).toHaveLength(TRY_TRAITS.length);
    expect(tryArea(region, 3).traits!.map((t) => t.before)).toEqual(
      prev.traits!.map((t) => t.before),
    );
    // a group of eight: after one month only three have a baseline, so no averages yet
    const group: TryTarget = { scope: "group", target: "DEMO-GRP-BA", co: "BA" };
    expect(tryArea(group, 1)).toMatchObject({ enrolled: 8, started: null, traits: null });
    expect(tryArea(group, 2).started).toBeGreaterThanOrEqual(IMPACT_COHORT_MIN);
  });

  it("القراءة بشكل my_pledges، وتقديم شهرٍ (30.44 يوماً) يقدّم التأهيل والعيني معاً", () => {
    const base = {
      ...region,
      id: "DEMO-PLG-1",
      amount: 50,
      currency: "USD",
      at: now.toISOString(),
    };
    const pledges: TryPledge[] = [
      { ...base, kind: "qualification" },
      { ...base, id: "DEMO-PLG-2", kind: "in_kind" },
      { ...base, id: "DEMO-PLG-3", kind: "qualification", scope: "orphan", target: "try-03" },
    ];
    const rows = tryMyPledges(pledges, later(2), "en");
    expect(Object.keys(rows[1]!).sort()).toEqual(
      [
        "amount",
        "created_at",
        "currency",
        "deliveries",
        "id",
        "kind",
        "status",
        "target",
        "target_type",
      ].sort(),
    );
    expect(rows[1]).toMatchObject({ target_type: "region", target: "Cairo", status: "active" });
    expect(rows[1]!.deliveries!.map((d) => [d.stage, d.documented])).toEqual([
      ["delivered", true],
      ["delivered", true],
      ["preparing", false],
    ]);
    expect(rows[0]!.deliveries).toBeUndefined();

    const q0 = tryQualification(pledges, later(0), "en");
    expect(q0).toHaveLength(2);
    expect(q0[0]).toMatchObject({ months: 0, label: "Cairo", place: "Egypt", currency: "USD" });
    expect(q0[0]!.area?.sessionsHeld).toBe(0);
    expect(q0[1]!.journey?.sessionsHeld).toBe(0);
    const q2 = tryQualification(pledges, later(2), "en");
    expect(q2[0]!.months).toBe(2);
    expect(q2[0]!.area!.sessionsHeld).toBeGreaterThan(0);
    expect(q2[1]).toMatchObject({ code: "DEMO-TRY-03", journey: { sessionsHeld: 4 } });

    const k0 = tryInKind(pledges, later(0), "en")[0]!;
    expect(k0.deliveries.map((d) => d.stage)).toEqual(["recorded"]);
    const k2 = tryInKind(pledges, later(2), "en")[0]!;
    expect(k2.deliveries.map((d) => [d.month, d.stage, d.documented])).toEqual([
      ["2027-01", "preparing", false],
      ["2026-12", "delivered", true],
      ["2026-11", "delivered", true],
    ]);
  });
});
