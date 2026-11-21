import { describe, expect, it } from "vitest";

import type { AdminOverview } from "./admin.functions";
import {
  attentionItems,
  attentionTotals,
  childrenSummary,
  countryRows,
  donorsSummary,
  regionRows,
  sourceStates,
  supportRows,
  trendDelta,
  unifiedTotal,
  type AttentionInput,
} from "./admin-overview";
import { SAMPLE_PREFIX, sampleOverview } from "./admin-overview-sample";
import { goLiveSteps, linkHealth } from "./go-live";

const NOW = Date.parse("2026-11-21T12:00:00Z");
const DAY = 86_400_000;

function base(over: Partial<AdminOverview> = {}): AdminOverview {
  return {
    currency: "USD",
    orphans: {
      total: 12,
      published: 10,
      fully_sponsored: 4,
      awaiting_review: 2,
      monthly_need: 900,
      monthly_funded: 500,
      monthly_gap: 400,
    },
    organizations: { total: 2, approved: 1, pending: 1 },
    sponsors: {
      total: 8,
      with_active: 5,
      sponsorships: 11,
      active: 7,
      awaiting_payment: 2,
      monthly_committed: 500,
    },
    money: { collected: 3000, fees: 90, pending: 100, failed: 0, disbursed: 2500, balance: 500 },
    orphan_rows: [],
    sponsor_rows: [],
    pending_orphans: [],
    pending_orgs: [],
    ...over,
  };
}

const empty: AttentionInput = {
  inbox: undefined,
  sources: undefined,
  locales: undefined,
  dispatch: undefined,
  ops: undefined,
  links: undefined,
  goLive: null,
  now: NOW,
};

describe("الدعم بعملاته", () => {
  it("سطرٌ لكلّ عملة، والموحّدة أوّلاً — لا يُجمع يورو مع دولار", () => {
    const rows = supportRows(
      base({
        orphans_by_currency: [
          { currency: "EUR", monthly_need: 600, monthly_funded: 400, monthly_gap: 200 },
          { currency: "USD", monthly_need: 300, monthly_funded: 100, monthly_gap: 200 },
        ],
        committed_by_currency: [
          { currency: "EUR", amount: 400 },
          { currency: "USD", amount: 100 },
        ],
        money_by_currency: [
          {
            currency: "EUR",
            collected: 2000,
            fees: 60,
            pending: 0,
            failed: 0,
            disputed: 0,
            disbursed: 1500,
            balance: 500,
          },
        ],
      }),
    );
    expect(rows.map((r) => r.currency)).toEqual(["USD", "EUR"]);
    expect(rows[1]).toMatchObject({ committed: 400, collected: 2000, gap: 200, unified: false });
    expect(rows[0]).toMatchObject({ committed: 100, collected: 0, unified: true });
  });

  it("قاعدةٌ بلا مجاميع العملات: المجاميع القديمة بعملة المنصّة", () => {
    const rows = supportRows(base({ currency: "eur" }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ currency: "EUR", committed: 500, collected: 3000, gap: 400 });
  });

  it("المبالغ النصّية (NUMERIC) تُقرأ أرقاماً، والعملة الخالية من كلّ مبلغٍ تُحذف", () => {
    const rows = supportRows(
      base({
        orphans_by_currency: [],
        committed_by_currency: [{ currency: "USD", amount: "120.50" as unknown as number }],
        money_by_currency: [
          {
            currency: "GBP",
            collected: 0,
            fees: 0,
            pending: 0,
            failed: 0,
            disputed: 0,
            disbursed: 0,
            balance: 0,
          },
        ],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.committed).toBe(120.5);
  });

  it("المعادل الموحّد: دقيقٌ حين كلّه دولار، وتقريبيٌّ بتاريخ السعر حين فيه يورو", () => {
    const usd = supportRows(base());
    expect(unifiedTotal(usd, "committed")).toMatchObject({ amount: 500, exact: true, asOf: "" });

    const mixed = supportRows(
      base({
        committed_by_currency: [
          { currency: "EUR", amount: 100 },
          { currency: "USD", amount: 50 },
        ],
      }),
    );
    const t = unifiedTotal(mixed, "committed")!;
    expect(t.amount).toBe(158);
    expect(t.exact).toBe(false);
    expect(t.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(t.missing).toEqual([]);
  });

  it("عملةٌ بلا سعر لا تُخمَّن: تُذكر ولا تدخل المجموع، ولا مجموع إن غابت الأسعار كلّها", () => {
    const rows = supportRows(
      base({
        committed_by_currency: [
          { currency: "XOF", amount: 9000 },
          { currency: "USD", amount: 50 },
        ],
      }),
    );
    expect(unifiedTotal(rows, "committed")).toMatchObject({ amount: 50, missing: ["XOF"] });
    const only = supportRows(
      base({
        orphans_by_currency: [],
        money_by_currency: [],
        committed_by_currency: [{ currency: "XOF", amount: 9000 }],
      }),
    );
    expect(unifiedTotal(only, "committed")).toBeNull();
    expect(unifiedTotal(only, "disputed")).toBeNull();
  });
});

describe("الأطفال", () => {
  it("المكفول والمنتظر من المنشور، والنسبة غائبةٌ حين لا منشور", () => {
    expect(childrenSummary(base())).toEqual({
      published: 10,
      sponsored: 4,
      waiting: 6,
      awaitingReview: 2,
      share: 40,
    });
    const none = childrenSummary(
      base({ orphans: { ...base().orphans, published: 0, fully_sponsored: 0 } }),
    );
    expect(none.share).toBeNull();
    expect(none.waiting).toBe(0);
  });

  it("دون حدّ الحشد: لا عدد ولا فجوة ولا عملة، والدولة آخر القائمة", () => {
    const rows = countryRows([
      {
        country: "SO",
        small: true,
        total: null,
        sponsored: null,
        gap: 90,
        currency: "USD",
        regions: [],
      },
      {
        country: "AL",
        small: false,
        total: 30,
        sponsored: 12,
        gap: "410.00",
        currency: "eur",
        regions: [],
      },
      {
        country: "TD",
        small: false,
        total: 44,
        sponsored: null,
        gap: 700,
        currency: "USD",
        regions: [],
      },
    ]);
    expect(rows.map((r) => r.code)).toEqual(["TD", "AL", "SO"]);
    expect(rows[2]).toMatchObject({
      small: true,
      total: null,
      waiting: null,
      gap: null,
      currency: null,
    });
    expect(rows[1]).toMatchObject({
      total: 30,
      sponsored: 12,
      waiting: 18,
      gap: 410,
      currency: "EUR",
    });
    // المكفول محجوبٌ تكميلياً: لا يُستنتج المنتظر من المجموع.
    expect(rows[0]).toMatchObject({ total: 44, sponsored: null, waiting: null });
  });

  it("مجموع القارّة من دولها الظاهرة وحدها، ويُعلَّم جزئياً حين فيها محجوب", () => {
    const regions = regionRows(
      countryRows([
        { country: "AL", small: false, total: 30, sponsored: 12, regions: [] },
        { country: "XK", small: false, total: 20, sponsored: 10, regions: [] },
        { country: "MK", small: true, total: null, sponsored: null, regions: [] },
        { country: "TD", small: false, total: 44, sponsored: 20, regions: [] },
      ]),
    );
    expect(regions).toEqual([
      { continent: "EU", countries: 3, total: 50, sponsored: 22, partial: true },
      { continent: "AF", countries: 1, total: 44, sponsored: 20, partial: false },
    ]);
  });
});

describe("الداعمون", () => {
  it("النشط وغير النشط من المجاميع، والجدد من الصفوف حين تكتمل", () => {
    const row = (i: number, ago: number) => ({
      id: `d${i}`,
      email: null,
      name: null,
      sponsorships: 1,
      active: 1,
      monthly: 10,
      paid: 10,
      since: new Date(NOW - ago * DAY).toISOString(),
    });
    const d = donorsSummary(
      base({
        sponsor_rows: [row(1, 3), row(2, 29), row(3, 31), row(4, 400)],
        sponsor_rows_total: 4,
      }),
      NOW,
    );
    expect(d).toMatchObject({ total: 8, active: 5, inactive: 3, awaitingPayment: 2, recent: 2 });
  });

  it("أكثر من الصفحة الأولى: «الجدد» غير معروف لا عدّاً ناقصاً", () => {
    const d = donorsSummary(base({ sponsor_rows: [], sponsor_rows_total: 250 }), NOW);
    expect(d.recent).toBeNull();
  });
});

describe("ما يحتاج انتباهاً", () => {
  it("لا مصدر وصل: قائمةٌ فارغة لا أصفار", () => {
    expect(attentionItems(empty)).toEqual([]);
  });

  it("الصندوق يُجمع بالنوع، بأقدم تاريخ، ويقود إلى تبويبه — بلا عناوين", () => {
    const items = attentionItems({
      ...empty,
      inbox: [
        { kind: "unlock", id: "1", title: "اسم", subtitle: "", created_at: "2026-11-20T00:00:00Z" },
        { kind: "unlock", id: "2", title: "اسم", subtitle: "", created_at: "2026-11-18T00:00:00Z" },
        {
          kind: "money_issue",
          id: "3",
          title: "اسم",
          subtitle: "",
          created_at: "2026-11-21T00:00:00Z",
        },
        { kind: "donor", id: "4", title: "اسم", subtitle: "", created_at: "2026-10-01T00:00:00Z" },
      ],
    });
    expect(items.map((i) => [i.key, i.severity, i.count, i.tab])).toEqual([
      ["inbox:money_issue", "critical", 1, "inbox"],
      ["inbox:unlock", "warn", 2, "integrity"],
      // «للعلم» انتظر أكثر من أسبوعين: يرتفع إلى تنبيه.
      ["inbox:donor", "warn", 1, "inbox"],
    ]);
    expect(items[1]!.oldestAt).toBe("2026-11-18T00:00:00Z");
    expect(JSON.stringify(items)).not.toContain("اسم");
  });

  it("فحص صحّة التشغيل لا يكرّر صفّاً قائماً: يرفع خطورته، ويظهر وحده إن غاب", () => {
    const ops = {
      level: "critical" as const,
      at: "",
      last_run: null,
      checks: [
        { key: "unlock_waiting", level: "critical" as const, count: 1, title: "t" },
        { key: "payments_stuck", level: "warn" as const, count: 2, title: "t" },
        { key: "admin_quorum", level: "ok" as const, count: 0, title: "t" },
      ],
    };
    const withRow = attentionItems({
      ...empty,
      ops,
      inbox: [
        { kind: "unlock", id: "1", title: "", subtitle: "", created_at: "2026-11-21T00:00:00Z" },
      ],
    });
    expect(withRow.map((i) => [i.key, i.severity])).toEqual([
      ["inbox:unlock", "critical"],
      ["ops:payments_stuck", "warn"],
    ]);
    const alone = attentionItems({ ...empty, ops, inbox: null });
    expect(alone.map((i) => i.key)).toEqual(["ops:unlock_waiting", "ops:payments_stuck"]);
  });

  it("التصريف: مخطّطٌ ناقص حرج، والفاشل تنبيه، والمنتظر للعلم", () => {
    const s = sampleOverview(NOW);
    const ok = attentionItems({ ...empty, dispatch: s.dispatch });
    expect(ok.map((i) => [i.key, i.severity, i.count])).toEqual([
      ["dispatch_failed", "warn", 3],
      ["dispatch_pending", "info", 14],
    ]);
    const broken = attentionItems({
      ...empty,
      dispatch: { ...s.dispatch, schema: { ready: false, missing: ["a", "b"] }, dbErrorRuns24h: 3 },
    });
    expect(broken.slice(0, 2).map((i) => [i.key, i.severity, i.count])).toEqual([
      ["dispatch_failed", "critical", 3],
      ["dispatch_schema", "critical", 2],
    ]);
  });

  it("المصادر والترجمة والمزامنة وجاهزية الاعتماد", () => {
    const s = sampleOverview(NOW);
    const items = attentionItems({
      ...empty,
      sources: s.sources,
      locales: s.locales,
      links: linkHealth(s.links, NOW),
      goLive: goLiveSteps({ published: 5, links: s.links, payments: false, now: NOW }),
    });
    const by = Object.fromEntries(items.map((i) => [i.key, i]));
    // XK: بندان، ID: أربعة — والمصدر النشط (AL) مكتمل فيبقى «للعلم».
    expect(by["source_checklist"]).toMatchObject({ count: 6, severity: "info", tab: "countries" });
    expect(by["source_checklist"]!.topic).toEqual({ type: "source_checklist", sources: 2 });
    expect(by["source_errors"]).toMatchObject({ count: 1, severity: "warn" });
    expect(by["sync_lagging"]).toMatchObject({ count: 1, severity: "warn" });
    expect(by["translation_drafts"]).toMatchObject({ count: 258, tab: "languages" });
    expect(by["translation_reviewed"]).toMatchObject({ count: 18 });
    expect(by["go_live"]).toMatchObject({ count: 1, tab: "overview" });
    expect(items.map((i) => i.severity)).toEqual(["warn", "warn", "info", "info", "info", "info"]);
  });

  it("المجاميع بالخطورة", () => {
    const s = sampleOverview(NOW);
    const t = attentionTotals(attentionItems({ ...empty, inbox: s.inbox, ops: s.ops }));
    expect(t.rows).toBe(t.critical + t.warn + t.info);
    expect(t.critical).toBe(1);
  });
});

describe("حال المصادر والاتجاه", () => {
  it("لم يصل · تعذّر · جاهز", () => {
    const st = sourceStates({
      overview: base(),
      geo: null,
      inbox: undefined,
      sources: {},
      locales: [],
      dispatch: null,
      ops: {},
      links: [],
      payments: false,
    });
    expect(st.overview).toBe("ready");
    expect(st.geo).toBe("failed");
    expect(st.inbox).toBe("loading");
    expect(st.payments).toBe("ready");
  });

  it("تغيّر آخر شهر، ولا نسبة بلا أساس", () => {
    expect(trendDelta([100, 110])).toBe(10);
    expect(trendDelta([200, 150])).toBe(-25);
    expect(trendDelta([0, 50])).toBeNull();
    expect(trendDelta([50])).toBeNull();
  });
});

describe("العيّنة النموذجية", () => {
  const s = sampleOverview(NOW);

  it("كلّ معرّفٍ يبدأ بـDEMO- ولا بريد ولا صفّ طفل", () => {
    const ids = [
      ...s.inbox.map((i) => i.id),
      ...s.overview.sponsor_rows.map((r) => r.id),
      ...s.sources.sources.map((r) => r.key),
      ...s.links.map((l) => l.platform),
    ];
    expect(ids.length).toBeGreaterThan(500);
    expect(ids.every((id) => id.startsWith(SAMPLE_PREFIX))).toBe(true);
    expect(s.overview.sponsor_rows.every((r) => r.email === null)).toBe(true);
    expect(s.overview.orphan_rows).toEqual([]);
    expect(s.overview.pending_orphans).toEqual([]);
  });

  it("متّسقةٌ مع نفسها: دول الخارطة لا تتجاوز مجاميع اللوحة", () => {
    const rows = countryRows(s.geo);
    const total = rows.reduce((a, r) => a + (r.total ?? 0), 0);
    const sponsored = rows.reduce((a, r) => a + (r.sponsored ?? 0), 0);
    expect(total).toBeLessThanOrEqual(s.overview.orphans.published);
    expect(sponsored).toBeLessThanOrEqual(s.overview.orphans.fully_sponsored);
    expect(rows.filter((r) => r.small)).toHaveLength(2);
    for (const cur of ["USD", "EUR"]) {
      const gap = rows.filter((r) => r.currency === cur).reduce((a, r) => a + (r.gap ?? 0), 0);
      const row = supportRows(s.overview).find((r) => r.currency === cur)!;
      expect(gap).toBeLessThanOrEqual(row.gap);
    }
    expect(s.extras.trend).toHaveLength(12);
    expect(s.extras.trend[11]!.month).toBe("2026-11");
  });

  it("تمرّ بمسار الاشتقاق نفسه وتُنتج لوحةً ممتلئة", () => {
    const d = donorsSummary(s.overview, NOW);
    expect(d.recent).toBeGreaterThan(0);
    expect(d.active + d.inactive).toBe(d.total);
    const items = attentionItems({
      inbox: s.inbox,
      sources: s.sources,
      locales: s.locales,
      dispatch: s.dispatch,
      ops: s.ops,
      links: linkHealth(s.links, NOW),
      goLive: goLiveSteps({
        published: s.overview.orphans.published,
        links: s.links,
        payments: s.payments,
        now: NOW,
      }),
      now: NOW,
    });
    expect(items[0]!.key).toBe("inbox:money_issue");
    expect(items.some((i) => i.key.startsWith("ops:mirror_lag"))).toBe(false);
    expect(items.find((i) => i.key === "ops:payments_stuck")).toBeTruthy();
  });
});
