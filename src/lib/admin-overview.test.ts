import { describe, expect, it } from "vitest";

import type { AdminOverview } from "./admin.functions";
import {
  attentionItems,
  attentionTotals,
  childrenSummary,
  countryRows,
  donorsSummary,
  dueRows,
  firmTotal,
  kindRows,
  overviewCsv,
  parsePeriod,
  parseSupportSummary,
  ratesMissing,
  regionRows,
  rpcFailure,
  sourceStates,
  supportRows,
  trendDelta,
  trendView,
  unifiedTotal,
  waitingDays,
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
        { kind: "unlock", created_at: "2026-11-20T00:00:00Z" },
        { kind: "unlock", created_at: "2026-11-18T00:00:00Z" },
        {
          kind: "money_issue",

          created_at: "2026-11-21T00:00:00Z",
        },
        { kind: "donor", created_at: "2026-10-01T00:00:00Z" },
      ],
    });
    expect(items.map((i) => [i.key, i.severity, i.count, i.tab])).toEqual([
      ["inbox:money_issue", "critical", 1, "inbox"],
      // «للعلم» انتظر أكثر من أسبوعين: يرتفع إلى تنبيه — والأقدم انتظاراً يسبق.
      ["inbox:donor", "warn", 1, "inbox"],
      ["inbox:unlock", "warn", 2, "integrity"],
    ]);
    expect(items[2]!.oldestAt).toBe("2026-11-18T00:00:00Z");
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
      inbox: [{ kind: "unlock", created_at: "2026-11-21T00:00:00Z" }],
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
      summary: undefined,
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

  it("متّسقةٌ مع نفسها: دول الخريطة لا تتجاوز مجاميع اللوحة", () => {
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
    expect(s.summary.months).toHaveLength(12);
    expect(s.summary.months[11]).toBe("2026-11");
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

/** ناتج `admin_support_summary` كما يصل: JSONB، والمبالغ نصوصٌ (NUMERIC). */
function rawSummary(firm: boolean) {
  const eur = (amount: number) => ({
    currency: "EUR",
    amount: String(amount),
    unified: firm ? Math.round(amount * 110) / 100 : null,
  });
  const usd = (amount: number) => ({ currency: "USD", amount, unified: amount });
  return {
    version: 1,
    unified: "USD",
    cohort_min: 5,
    months: ["2026-08", "2026-09", "2026-10", "2026-11"],
    kinds: [
      { kind: "sponsorship", status: "active", count: 3, ...usd(120) },
      { kind: "sponsorship", status: "active", count: 2, ...eur(100) },
      { kind: "sponsorship", status: "pending_payment", count: 1, ...usd(20) },
      { kind: "sponsorship", status: "completed", count: 4, ...usd(90) },
      { kind: "qualification", status: "active", count: 2, ...eur(160) },
      { kind: "qualification", status: "fulfilled", count: 1, ...usd(50) },
      { kind: "in_kind", status: "pending", count: 1, ...usd(25) },
      { kind: "gift", status: "active", count: 9, ...usd(999) },
    ],
    trend: [
      { kind: "sponsorship", month: "2026-09", count: 1, ...usd(40) },
      { kind: "sponsorship", month: "2026-10", count: 2, ...usd(100) },
      { kind: "sponsorship", month: "2026-10", count: 1, ...eur(50) },
      { kind: "sponsorship", month: "2026-11", count: 2, ...usd(110) },
      { kind: "qualification", month: "2026-10", count: 1, ...eur(60) },
      { kind: "qualification", month: "2026-11", count: 1, ...eur(100) },
    ],
    money: [
      { measure: "committed", ...usd(120) },
      { measure: "committed", ...eur(100) },
      { measure: "collected", ...usd(900) },
      { measure: "collected", ...eur(200) },
      { measure: "disbursed", ...eur(60) },
      { measure: "pending", ...usd(20) },
      { measure: "mystery", ...usd(1) },
    ],
    rates: [
      {
        currency: "EUR",
        firm,
        rate: firm ? 1.1 : null,
        as_of: firm ? "2026-11-19" : null,
        source: firm ? "desk" : null,
      },
    ],
    donors: {
      total: 9,
      active: 5,
      new: 2,
      at_risk: 1,
      lapsed: 3,
      rule: { new_days: 30, grace_days: 14 },
    },
    due: [
      { bucket: "overdue", count: 1, oldest: "2026-10-12T00:00:00Z", ...usd(40) },
      { bucket: "overdue", count: 2, oldest: "2026-10-30T00:00:00Z", ...eur(70) },
      { bucket: "month", count: 3, oldest: "2026-12-01T00:00:00Z", ...usd(120) },
      { bucket: "first", count: 1, oldest: "2026-11-18T00:00:00Z", ...usd(20) },
      { bucket: "someday", count: 7, ...usd(1) },
    ],
    by_country: [
      { country: "al", small: false, count: 3, amounts: [{ currency: "EUR", amount: "160" }] },
      { country: "XK", small: true, count: null, amounts: null },
    ],
  };
}

describe("مجاميع الدعم من القاعدة", () => {
  it("الدالّة الغائبة ليست عطلاً ولا رفضاً", () => {
    expect(rpcFailure({ code: "PGRST202", message: "Could not find the function" })).toBe("absent");
    expect(
      rpcFailure({ message: "Could not find the function public.f(_m) in the schema cache" }),
    ).toBe("absent");
    expect(rpcFailure({ code: "42883", message: "function does not exist" })).toBe("absent");
    // دالّةٌ موجودة تعتمد على عمودٍ أو جدولٍ لم تصله القاعدة بعد.
    expect(rpcFailure({ code: "42703" })).toBe("absent");
    expect(rpcFailure({ code: "42P01" })).toBe("absent");
    expect(rpcFailure({ code: "42501", message: "admin_support_summary: not authorised" })).toBe(
      "denied",
    );
    expect(rpcFailure({ code: "57014", message: "canceling statement due to timeout" })).toBe(
      "failed",
    );
    expect(rpcFailure({})).toBe("failed");
  });

  it("ناتج الدالّة يُضبط: نصوص الأرقام أرقام، وما لا يُعرف يُهمل، وغير الناتج null", () => {
    expect(parseSupportSummary(null)).toBeNull();
    expect(parseSupportSummary("x")).toBeNull();
    expect(parseSupportSummary({ donors: {} })).toBeNull();
    const s = parseSupportSummary(rawSummary(true))!;
    expect(s.kinds).toHaveLength(7);
    expect(s.kinds[1]).toMatchObject({ currency: "EUR", amount: 100, unified: 110 });
    expect(s.money.map((m) => m.measure)).not.toContain("mystery");
    expect(s.due).toHaveLength(4);
    expect(s.donors).toEqual({
      total: 9,
      active: 5,
      recent: 2,
      atRisk: 1,
      lapsed: 3,
      newDays: 30,
      graceDays: 14,
    });
    expect(s.byCountry).toEqual([
      { country: "AL", small: false, count: 3, amounts: [{ currency: "EUR", amount: 160 }] },
      { country: "XK", small: true, count: null, amounts: null },
    ]);
    expect(parseSupportSummary({ kinds: [] })).toMatchObject({ donors: null, months: [] });
  });

  it("المجموع الدقيق بالسعر المعتمد وحده؛ بلا سعرٍ معتمد لا مجموع — يعود التقريب المعلَّم", () => {
    const firm = parseSupportSummary(rawSummary(true))!;
    expect(firmTotal(firm, "committed")).toEqual({
      amount: 230,
      currency: "USD",
      exact: false,
      basis: "firm",
      asOf: "2026-11-19",
      missing: [],
    });
    // الرصيد = المحصَّل − المصروف، كلٌّ بمعادله.
    expect(firmTotal(firm, "balance")?.amount).toBe(900 + 220 - 66);
    expect(firmTotal(firm, "pending")).toMatchObject({ amount: 20, exact: true, basis: "same" });
    expect(ratesMissing(firm)).toEqual([]);

    const indicativeOnly = parseSupportSummary(rawSummary(false))!;
    expect(firmTotal(indicativeOnly, "committed")).toBeNull();
    expect(firmTotal(indicativeOnly, "balance")).toBeNull();
    expect(firmTotal(indicativeOnly, "pending")?.amount).toBe(20);
    expect(ratesMissing(indicativeOnly)).toEqual(["EUR"]);
    expect(firmTotal(null, "committed")).toBeNull();
    expect(firmTotal(undefined, "collected")).toBeNull();

    // ما تفعله اللوحة حينها: التقريب بالسعر الاسترشادي، معلَّماً كذلك.
    const rows = supportRows(
      base({
        committed_by_currency: [
          { currency: "USD", amount: 120 },
          { currency: "EUR", amount: 100 },
        ],
      }),
    );
    const shown = firmTotal(indicativeOnly, "committed") ?? unifiedTotal(rows, "committed");
    expect(shown?.basis).toBe("indicative");
    expect(shown?.amount).toBe(228);
  });

  it("بلا دالّة المجاميع: الكفالة من المجاميع العامّة، والتأهيل والعيني بلا مصدر لا أصفار", () => {
    const rows = supportRows(base());
    const fallback = { rows, activeSponsorships: 7, awaitingPayment: 2 };
    for (const absent of [null, undefined]) {
      const list = kindRows(absent, fallback);
      expect(list.map((r) => [r.kind, r.source])).toEqual([
        ["sponsorship", "overview"],
        ["qualification", "none"],
        ["in_kind", "none"],
      ]);
      expect(list[0]).toMatchObject({
        active: 7,
        pending: 2,
        amounts: [{ currency: "USD", amount: 500 }],
      });
      expect(list[0]!.unified).toMatchObject({ amount: 500, basis: "same" });
      expect(list[1]!.amounts).toEqual([]);
      expect(trendView(absent, 12)).toBeNull();
    }
  });

  it("بدالّة المجاميع: كلّ نوعٍ بعدّه وحالاته وعملاته", () => {
    const s = parseSupportSummary(rawSummary(true))!;
    const list = kindRows(s, { rows: [], activeSponsorships: 0, awaitingPayment: 0 });
    expect(list[0]).toMatchObject({
      kind: "sponsorship",
      source: "summary",
      active: 5,
      pending: 1,
      done: 4,
      amounts: [
        { currency: "USD", amount: 120 },
        { currency: "EUR", amount: 100 },
      ],
    });
    expect(list[0]!.unified).toMatchObject({ amount: 230, basis: "firm" });
    expect(list[1]).toMatchObject({ active: 2, pending: 0, done: 1 });
    expect(list[1]!.unified?.amount).toBe(176);
    // عينيٌّ بلا نشط: لا مبلغ يُعرض، والمنتظر معدود.
    expect(list[2]).toMatchObject({ active: 0, pending: 1, amounts: [], unified: null });

    const loose = parseSupportSummary(rawSummary(false))!;
    const noRate = kindRows(loose, { rows: [], activeSponsorships: 0, awaitingPayment: 0 });
    // بلا سعرٍ معتمد: العملتان متجاورتان، ولا مجموع.
    expect(noRate[0]!.unified).toBeNull();
    expect(noRate[0]!.amounts).toHaveLength(2);
  });

  it("السلسلة: نافذة الفترة، والشهر الخالي صفر، ولا خطّ لعملتين بلا سعرٍ معتمد", () => {
    const firm = parseSupportSummary(rawSummary(true))!;
    const all = trendView(firm, 12)!;
    expect(all.months).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
    const sp = all.lines[0]!;
    expect(sp).toMatchObject({
      currency: "USD",
      values: [0, 40, 155, 110],
      total: 305,
      delta: -29,
    });
    expect(all.lines[2]).toMatchObject({ kind: "in_kind", values: [0, 0, 0, 0], total: 0 });

    const three = trendView(firm, 3)!;
    expect(three.months).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(three.lines[0]!.values).toEqual([40, 155, 110]);

    const loose = trendView(parseSupportSummary(rawSummary(false))!, 12)!;
    // كفالةٌ بدولار ويورو بلا سعرٍ معتمد: لا تُجمع في خطٍّ واحد.
    expect(loose.lines[0]).toMatchObject({ values: [], blocked: ["EUR"] });
    // تأهيلٌ بعملةٍ واحدة: خطٌّ بعملته هو.
    expect(loose.lines[1]).toMatchObject({ currency: "EUR", values: [0, 0, 60, 100] });

    expect(parsePeriod("6")).toBe(6);
    expect(parsePeriod(3)).toBe(3);
    expect(parsePeriod("7")).toBe(12);
    expect(parsePeriod(undefined)).toBe(12);
  });

  it("المستحقّات بسلالها، وفائت الاستحقاق والمتعثّرون يدخلان «يحتاج انتباهاً»", () => {
    const s = parseSupportSummary(rawSummary(true))!;
    const due = dueRows(s);
    expect(due.map((d) => [d.bucket, d.count])).toEqual([
      ["overdue", 3],
      ["week", 0],
      ["month", 3],
      ["first", 1],
    ]);
    expect(due[0]).toMatchObject({
      amounts: [
        { currency: "USD", amount: 40 },
        { currency: "EUR", amount: 70 },
      ],
      oldest: "2026-10-12T00:00:00Z",
    });
    const items = attentionItems({ ...empty, summary: s });
    expect(items.map((i) => [i.key, i.severity, i.count, i.tab])).toEqual([
      ["due_overdue", "warn", 3, "sponsors"],
      ["donors_at_risk", "info", 1, "sponsors"],
    ]);
    expect(waitingDays(items[0]!, NOW)).toBe(40);
    expect(waitingDays(items[1]!, NOW)).toBeNull();
    expect(attentionItems({ ...empty, summary: null })).toEqual([]);
  });

  it("بالخطورة نفسها: الأقدم انتظاراً أوّلاً", () => {
    const items = attentionItems({
      ...empty,
      inbox: [
        { kind: "access", created_at: "2026-11-20T00:00:00Z" },
        { kind: "access", created_at: "2026-11-19T00:00:00Z" },
        { kind: "access", created_at: "2026-11-19T00:00:00Z" },
        { kind: "transfer", created_at: "2026-11-10T00:00:00Z" },
      ],
    });
    expect(items.map((i) => i.key)).toEqual(["inbox:transfer", "inbox:access"]);
  });

  it("دالّةٌ لم تُنشأ: «غائبة» لا «تعذّرت»", () => {
    const sources = {
      overview: base(),
      geo: [],
      inbox: [],
      sources: {},
      locales: [],
      dispatch: {},
      ops: {},
      links: [],
      payments: false,
      summary: null,
    };
    expect(sourceStates(sources).summary).toBe("failed");
    expect(sourceStates(sources, ["summary"]).summary).toBe("absent");
  });
});

describe("التصدير", () => {
  it("CSV: أرقامٌ خام، واقتباسٌ صحيح، وما يُقرأ صيغةً لا يُنفَّذ، والقسم الفارغ يُحذف", () => {
    const csv = overviewCsv([
      { title: "أوّل", head: ["البند", "القيمة"], rows: [["مبلغ، بفاصلة", 1234.5]] },
      { title: "فارغ", head: ["x"], rows: [] },
      {
        title: "ثانٍ",
        head: ["a", "b", "c"],
        rows: [
          ['قال "نعم"', null, "=SUM(A1)"],
          ["-1", "@x", Number.NaN],
        ],
      },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "أوّل",
      "البند,القيمة",
      '"مبلغ، بفاصلة",1234.5'.replace('"مبلغ، بفاصلة"', "مبلغ، بفاصلة"),
      "",
      "ثانٍ",
      "a,b,c",
      `"قال ""نعم""",,'=SUM(A1)`,
      "'-1,'@x,",
      "",
    ]);
  });
});

describe("العيّنة النموذجية — المجاميع", () => {
  const s = sampleOverview(NOW);

  it("متّسقةٌ مع المجاميع العامّة: الالتزام والداعمون والمحصَّل", () => {
    const rows = supportRows(s.overview);
    for (const r of rows) {
      const cell = (m: string) =>
        s.summary.money.find((x) => x.measure === m && x.currency === r.currency)?.amount ?? 0;
      expect(cell("committed")).toBe(r.committed);
      expect(cell("collected")).toBe(r.collected);
      expect(cell("disbursed")).toBe(r.disbursed);
      expect(cell("pending")).toBe(r.pending);
    }
    const d = donorsSummary(s.overview, NOW);
    expect(s.summary.donors).toMatchObject({ total: d.total, active: d.active });
    expect(s.summary.donors!.lapsed + s.summary.donors!.atRisk).toBeLessThanOrEqual(
      d.total - d.active + s.summary.donors!.atRisk,
    );
    const list = kindRows(s.summary, { rows, activeSponsorships: 0, awaitingPayment: 0 });
    expect(list[0]!.active).toBe(d.activeSponsorships);
    expect(list[0]!.pending).toBe(d.awaitingPayment);
    expect(dueRows(s.summary)[3]!.count).toBe(d.awaitingPayment);
  });

  it("سعرها معتمدٌ نموذجي: مجموعٌ دقيق، وخطٌّ لكلّ نوع، ودولةٌ محجوبة", () => {
    expect(firmTotal(s.summary, "committed")).toMatchObject({ amount: 36_136, basis: "firm" });
    const view = trendView(s.summary, 6)!;
    expect(view.months).toHaveLength(6);
    expect(view.lines.every((l) => l.values.length === 6 && l.currency === "USD")).toBe(true);
    expect(s.summary.byCountry.filter((c) => c.small)).toHaveLength(1);
    expect(JSON.stringify(s.summary)).not.toMatch(/@|example/);
  });
});
