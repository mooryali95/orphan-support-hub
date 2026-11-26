// سجلّ التجربة ولحظات الأثر — من ملفّات التجربة (`trial.manifest.json`)، يُحذف معها.
import { describe, expect, it } from "vitest";

import { evidenceTotals, impactMoments } from "./impact-evidence";
import { childStanding, myImpact } from "./my-impact";
import { giftsAsSponsorships, type TryGift } from "./try-demo";
import { tryEvidence } from "./try-evidence";

describe("سجلّ التجربة ولحظات الأثر", () => {
  const gift: TryGift = {
    id: "g1",
    childId: "try-01",
    amount: 80,
    cadence: "monthly",
    at: "2026-11-21T10:00:00Z",
  };
  const at = (ahead: number) =>
    new Date(Date.parse(gift.at) + ahead * 30.44 * 86_400_000 + 3_600_000);

  it("اليوم: دفعةٌ مقيّدة فقط، ولا تسليم يُدَّعى قبل أن يمضي شهره", () => {
    const rows = tryEvidence([gift], 0, "en");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reached: 1,
      receipt: null,
      note: null,
      month: "2026-11",
      child: "Sara",
    });
    expect(evidenceTotals(rows)).toMatchObject({ delivered: 0, paid: 1, reports: 0 });
  });

  it("بعد n أشهر: n شهراً مسلَّماً بمرجع DEMO- وسطر تقرير، والجاري ينتظر", () => {
    const rows = tryEvidence([gift], 3, "en");
    expect(rows.map((r) => r.reached)).toEqual([3, 3, 3, 1]);
    expect(rows[0]!.receipt).toBe("DEMO-TRY-01-2026-11");
    expect(rows.slice(0, 3).every((r) => r.receipt!.startsWith("DEMO-") && r.note)).toBe(true);
    expect(evidenceTotals(rows)).toEqual({
      delivered: 3,
      paid: 4,
      reports: 3,
      given: [{ currency: "EUR", amount: 320 }],
    });
    // matches «أشهر الرعاية» in the hero at the same moment
    expect(myImpact(giftsAsSponsorships([gift], "en"), at(3)).months).toBe(3);
  });

  it("العطاء لمرّة واحدة شهرٌ واحد، بلا تقارير متوالية", () => {
    const rows = tryEvidence([{ ...gift, cadence: "one_time" }], 5, "ar");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reached: 3, note: null });
  });

  it("اللحظات بما قُيّد: اكتمال الحاجة ثم أوّل تسليم ثم البدء", () => {
    const impact = myImpact(giftsAsSponsorships([gift], "en"), at(0));
    expect(impactMoments(impact, tryEvidence([gift], 0, "en")).map((m) => m.key)).toEqual([
      "completed",
      "begun",
    ]);
    expect(impactMoments(impact, tryEvidence([gift], 2, "en"))).toEqual([
      { key: "completed", child: "Sara" },
      { key: "delivered", child: "Sara", month: "2026-11" },
      { key: "begun", child: "Sara" },
    ]);
    const partial = { ...gift, amount: 20 };
    expect(
      impactMoments(
        myImpact(giftsAsSponsorships([partial], "en"), at(0)),
        tryEvidence([partial], 0, "en"),
      ).map((m) => m.key),
    ).toEqual(["begun"]);
    expect(impactMoments(myImpact([], at(0)), [])).toEqual([]);
  });

  it("بحصّتك وبدونها: من بطاقة الكفالة وحدها", () => {
    const [c] = myImpact(giftsAsSponsorships([{ ...gift, amount: 60 }], "en"), at(0)).children;
    const s = childStanding(c!);
    expect(Math.round(s.without * 100)).toBe(33);
    expect(Math.round(s.withYou * 100)).toBe(83);
    expect(s).toMatchObject({ complete: false, open: 20 });
    const [full] = myImpact(giftsAsSponsorships([gift], "en"), at(0)).children;
    expect(childStanding(full!)).toMatchObject({ complete: true, open: 0, withYou: 1 });
  });
});
