/**
 * عيّنةٌ نموذجية للوحة الإدارة — «بيانات نموذجية» لا غير.
 *
 * وحدةٌ آمنة للمتصفّح، بلا شبكة ولا قاعدة: تُعيد الأشكال نفسها التي تعيدها دوالّ
 * الإدارة الحقيقية، فتمرّ بمسار الاشتقاق نفسه (`admin-overview.ts`) ولا يُكتب
 * للعيّنة عرضٌ ثانٍ. كلّ معرّفٍ فيها يبدأ بـ`DEMO-`، ولا اسم طفلٍ ولا صورة ولا
 * موقع، ولا معرّف يصلح للدفع: لا تدخل مسار كفالةٍ ولا تُخلط ببيانات القاعدة —
 * اللوحة تعرض هذه أو تلك، لا الاثنتين.
 */
import type { AdminOverview } from "@/lib/admin.functions";
import { parseSupportSummary, type SupportSummary } from "@/lib/admin-overview";
import type { InboxItem, InboxKind } from "@/lib/inbox.functions";
import type { SourceRow, SourcesOverview } from "@/lib/integrity.functions";
import type { DispatchHealth, OpsHealth } from "@/lib/monitoring.functions";
import type { GeoCountryRow } from "@/lib/protection.functions";
import type { ReviewLocale } from "@/lib/ui-i18n-admin.functions";
import type { OperatingLink } from "@/lib/vision-links.functions";

export const SAMPLE_PREFIX = "DEMO-";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (now: number, ago: number) => new Date(now - ago).toISOString();
const demoId = (group: string, n: number) =>
  `${SAMPLE_PREFIX}${group}-${String(n).padStart(3, "0")}`;

/** دولٌ من الشبكة النموذجية: المجموع، المكفول بالكامل، والفجوة الشهرية بعملتها. */
const COUNTRIES: Array<[string, number, number, number, string]> = [
  ["ID", 148, 96, 3120, "USD"],
  ["BD", 132, 71, 3660, "USD"],
  ["NG", 117, 64, 3180, "USD"],
  ["TD", 96, 41, 3300, "USD"],
  ["AL", 84, 58, 1430, "EUR"],
  ["XK", 61, 37, 1320, "EUR"],
  ["KG", 45, 19, 1560, "USD"],
  ["BA", 38, 22, 880, "EUR"],
];
/** دولتان دون حدّ الحشد: تعود محجوبة الأعداد كما تفعل `geo_stats`. */
const SMALL = ["SO", "MK"];

function geo(): GeoCountryRow[] {
  return [
    ...COUNTRIES.map(([country, total, sponsored, gap, currency]): GeoCountryRow => ({
      country,
      small: false,
      total,
      sponsored,
      gap,
      currency,
      delivered: null,
      regions: [],
    })),
    ...SMALL.map((country): GeoCountryRow => ({
      country,
      small: true,
      total: null,
      sponsored: null,
      gap: null,
      currency: null,
      delivered: null,
      regions: [],
    })),
  ];
}

/** ٥١٢ داعماً بأسماءٍ رمزية؛ تواريخ بدئهم ثابتة النمط فيثبت «الجدد» بين تحميلٍ وآخر. */
function sponsorRows(now: number): AdminOverview["sponsor_rows"] {
  return Array.from({ length: 512 }, (_, i) => {
    const active = i % 7 === 0 ? 0 : 1 + (i % 3 === 0 ? 1 : 0);
    return {
      id: demoId("DONOR", i + 1),
      email: null,
      name: demoId("DONOR", i + 1),
      sponsorships: active + (i % 11 === 0 ? 1 : 0),
      active,
      monthly: active * 45,
      paid: active * 45 * (1 + (i % 14)),
      // واحدٌ من كلّ ثلاثة عشر بدأ هذا الشهر، والباقون على مدى سنتين.
      since: iso(now, i % 13 === 0 ? (3 + (i % 26)) * DAY : (40 + ((i * 17) % 690)) * DAY),
    };
  });
}

function overview(now: number): AdminOverview {
  const sponsors = sponsorRows(now);
  return {
    currency: "USD",
    orphans: {
      total: 771,
      published: 728,
      fully_sponsored: 410,
      awaiting_review: 23,
      monthly_need: 41_200,
      monthly_funded: 26_200,
      monthly_gap: 15_000,
    },
    organizations: { total: 19, approved: 14, pending: 3 },
    sponsors: {
      total: sponsors.length,
      with_active: sponsors.filter((s) => s.active > 0).length,
      sponsorships: 689,
      active: 574,
      awaiting_payment: 31,
      monthly_committed: 26_200,
    },
    money: {
      collected: 148_600,
      fees: 4_310,
      pending: 5_240,
      failed: 860,
      disbursed: 121_300,
      balance: 27_300,
    },
    orphans_by_currency: [
      { currency: "EUR", monthly_need: 12_900, monthly_funded: 9_200, monthly_gap: 3_700 },
      { currency: "USD", monthly_need: 41_200, monthly_funded: 26_200, monthly_gap: 15_000 },
    ],
    committed_by_currency: [
      { currency: "EUR", amount: 9_200 },
      { currency: "USD", amount: 26_200 },
    ],
    money_by_currency: [
      {
        currency: "EUR",
        collected: 51_800,
        fees: 1_420,
        pending: 1_180,
        failed: 0,
        disputed: 240,
        disbursed: 43_900,
        balance: 7_900,
      },
      {
        currency: "USD",
        collected: 148_600,
        fees: 4_310,
        pending: 5_240,
        failed: 860,
        disputed: 0,
        disbursed: 121_300,
        balance: 27_300,
      },
    ],
    orphan_rows_total: 728,
    sponsor_rows_total: sponsors.length,
    // لا صفوف أطفالٍ في العيّنة: اللوحة مجاميع، والقوائم في شاشاتها.
    orphan_rows: [],
    sponsor_rows: sponsors,
    pending_orphans: [],
    pending_orgs: [],
  };
}

/** عدد البنود لكلّ نوع، وعمر أقدمها بالأيام. */
const INBOX: Array<[InboxKind, number, number]> = [
  ["money_issue", 2, 4],
  ["transfer", 6, 9],
  ["unlock", 3, 2],
  ["discrepancy", 4, 6],
  ["access", 5, 3],
  ["orphan", 23, 11],
  ["org", 3, 8],
  ["pledge", 7, 5],
  ["progress_report", 9, 19],
  ["circle_role", 2, 1],
  ["donor", 1, 2],
];

function inbox(now: number): InboxItem[] {
  return INBOX.flatMap(([kind, count, oldest]) =>
    Array.from({ length: count }, (_, i) => ({
      kind,
      id: demoId(kind.toUpperCase().replace("_", "-"), i + 1),
      title: demoId("ITEM", i + 1),
      subtitle: "",
      created_at: iso(now, Math.max(HOUR, (oldest * DAY * (count - i)) / count)),
    })),
  );
}

const CHECKED = {
  key_issued: true,
  first_sync: true,
  reconciled: true,
  org_linked: true,
  office_reviewed: true,
  regions_mapped: true,
};

function sources(now: number): SourcesOverview {
  const row = (
    key: string,
    country: string,
    status: SourceRow["status"],
    syncAgo: number | null,
    mirrored: number,
    checklist: SourceRow["checklist"],
    last_error: string | null = null,
  ): SourceRow => ({
    key: demoId("SRC", Number(key)),
    name: demoId("PLATFORM", Number(key)),
    country,
    country_name: country,
    country_status: status === "active" ? "active" : "planned",
    emergency_note: null,
    status,
    base_url: null,
    last_sync_at: syncAgo == null ? null : iso(now, syncAgo),
    last_error,
    last_reconcile_at: syncAgo == null ? null : iso(now, syncAgo + DAY),
    mirrored,
    locked: mirrored,
    open_discrepancies: status === "active" ? 4 : 0,
    batches: mirrored > 0 ? 12 : 0,
    checklist,
  });
  return {
    sources: [
      row("1", "AL", "active", 5 * HOUR, 84, CHECKED),
      row(
        "2",
        "XK",
        "trial",
        80 * HOUR,
        61,
        { ...CHECKED, reconciled: false, office_reviewed: false },
        "DEMO: timeout",
      ),
      row("3", "ID", "onboarding", null, 0, {
        ...CHECKED,
        first_sync: false,
        reconciled: false,
        org_linked: false,
        regions_mapped: false,
      }),
    ],
    pending_unlocks: 3,
    open_discrepancies: 4,
    locked_total: 145,
  };
}

function links(now: number): OperatingLink[] {
  return [
    {
      country: "AL",
      platform: demoId("PLATFORM", 1),
      syncedAt: iso(now, 5 * HOUR),
      groups: 9,
      orphans: 84,
    },
    {
      country: "XK",
      platform: demoId("PLATFORM", 2),
      syncedAt: iso(now, 80 * HOUR),
      groups: 6,
      orphans: 61,
    },
  ];
}

const LOCALES: ReviewLocale[] = [
  {
    code: "sq",
    name: "Shqip",
    dir: "ltr",
    status: "live",
    countries: ["AL", "XK"],
    counts: { draft: 46, reviewed: 18, published: 1320 },
  },
  {
    code: "id",
    name: "Bahasa Indonesia",
    dir: "ltr",
    status: "draft",
    countries: ["ID"],
    counts: { draft: 212, reviewed: 0, published: 0 },
  },
];

function dispatch(now: number): DispatchHealth {
  return {
    schema: { ready: true, missing: [] },
    runs24h: 96,
    failedRuns24h: 1,
    dbErrorRuns24h: 0,
    sent24h: 318,
    failedEmails24h: 3,
    attempts24h: 327,
    queue: { pending: 14, failed: 3 },
    lastRun: {
      at: iso(now, 12 * 60_000),
      ok: true,
      provider: "demo",
      sent: 4,
      failed: 0,
      errorKind: null,
      error: null,
    },
    alerts: [],
  };
}

function ops(now: number): OpsHealth {
  const ok = (key: string) => ({ key, level: "ok" as const, count: 0, title: key });
  return {
    level: "warn",
    at: iso(now, 60_000),
    checks: [
      ok("integrity_chain"),
      ok("webhook_errors"),
      { key: "payments_stuck", level: "warn", count: 2, title: "payments_stuck" },
      ok("discrepancies"),
      ok("unlock_waiting"),
      { key: "email_failed", level: "warn", count: 3, title: "email_failed" },
      { key: "mirror_lag", level: "warn", count: 1, title: "mirror_lag" },
      ok("admin_quorum"),
    ],
    last_run: { at: iso(now, 15 * 60_000), level: "warn", notified: 2 },
  };
}

/** سعرٌ معتمد نموذجي: يُظهر المجموع الدقيق بالعملة الموحّدة كما يظهر بسعرٍ معتمد. */
const SAMPLE_RATE = 1.08;

/**
 * مجاميع الدعم النموذجية بشكل ناتج `admin_support_summary` نفسه، فتمرّ بـ
 * `parseSupportSummary` وبمسار الاشتقاق كلّه. اثنا عشر شهراً تنتهي بالشهر الجاري.
 */
function summary(now: number): SupportSummary {
  const end = new Date(now);
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (11 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const eur = (amount: number) => ({
    currency: "EUR",
    amount,
    unified: Math.round(amount * SAMPLE_RATE * 100) / 100,
  });
  const usd = (amount: number) => ({ currency: "USD", amount, unified: amount });
  // [دولار، يورو] لكلّ شهر.
  const series: Record<string, Array<[number, number]>> = {
    sponsorship: [
      [15_400, 5_500],
      [16_600, 5_800],
      [17_100, 6_000],
      [18_200, 6_400],
      [19_500, 6_700],
      [19_900, 7_000],
      [21_300, 7_400],
      [21_900, 7_700],
      [23_700, 8_200],
      [24_600, 8_600],
      [25_400, 8_900],
      [26_200, 9_200],
    ],
    qualification: [
      [1_400, 650],
      [1_500, 740],
      [1_900, 930],
      [2_000, 1_020],
      [2_200, 1_110],
      [2_100, 1_110],
      [2_600, 1_300],
      [3_000, 1_480],
      [3_300, 1_670],
      [3_500, 1_760],
      [3_900, 1_940],
      [4_150, 2_130],
    ],
    in_kind: [
      [1_200, 560],
      [1_800, 740],
      [1_400, 650],
      [2_300, 1_020],
      [2_000, 830],
      [1_600, 740],
      [2_100, 930],
      [2_500, 1_110],
      [1_900, 830],
      [2_200, 1_020],
      [2_400, 1_110],
      [2_700, 1_111],
    ],
  };
  const raw = {
    version: 1,
    generated_at: iso(now, 0),
    unified: "USD",
    cohort_min: 5,
    months,
    kinds: [
      { kind: "sponsorship", status: "active", count: 420, ...usd(26_200) },
      { kind: "sponsorship", status: "active", count: 154, ...eur(9_200) },
      { kind: "sponsorship", status: "pending_payment", count: 22, ...usd(1_180) },
      { kind: "sponsorship", status: "pending_payment", count: 9, ...eur(430) },
      { kind: "sponsorship", status: "completed", count: 48, ...usd(2_300) },
      { kind: "qualification", status: "active", count: 58, ...usd(4_150) },
      { kind: "qualification", status: "active", count: 28, ...eur(2_130) },
      { kind: "qualification", status: "pending", count: 7, ...usd(640) },
      { kind: "qualification", status: "fulfilled", count: 132, ...usd(11_900) },
      { kind: "in_kind", status: "active", count: 27, ...usd(2_700) },
      { kind: "in_kind", status: "active", count: 14, ...eur(1_111) },
      { kind: "in_kind", status: "pending", count: 5, ...eur(380) },
      { kind: "in_kind", status: "fulfilled", count: 64, ...usd(7_400) },
    ],
    trend: Object.entries(series).flatMap(([kind, rows]) =>
      rows.flatMap(([a, b], i) => [
        { kind, month: months[i], count: Math.round(a / 62), ...usd(a) },
        { kind, month: months[i], count: Math.round(b / 60), ...eur(b) },
      ]),
    ),
    money: [
      { measure: "committed", ...usd(26_200) },
      { measure: "committed", ...eur(9_200) },
      { measure: "collected", ...usd(148_600) },
      { measure: "collected", ...eur(51_800) },
      { measure: "pending", ...usd(5_240) },
      { measure: "pending", ...eur(1_180) },
      { measure: "disbursed", ...usd(121_300) },
      { measure: "disbursed", ...eur(43_900) },
    ],
    rates: [
      {
        currency: "EUR",
        firm: true,
        rate: SAMPLE_RATE,
        inverse: false,
        as_of: iso(now, 6 * DAY).slice(0, 10),
        source: `${SAMPLE_PREFIX}RATE`,
      },
    ],
    donors: {
      total: 512,
      active: 438,
      new: 40,
      at_risk: 23,
      lapsed: 51,
      rule: { new_days: 30, grace_days: 14 },
    },
    due: [
      { bucket: "overdue", count: 9, oldest: iso(now, 37 * DAY), ...usd(720) },
      { bucket: "overdue", count: 4, oldest: iso(now, 21 * DAY), ...eur(310) },
      { bucket: "week", count: 61, oldest: iso(now, -1 * DAY), ...usd(2_900) },
      { bucket: "week", count: 22, oldest: iso(now, -2 * DAY), ...eur(1_150) },
      { bucket: "month", count: 190, oldest: iso(now, -8 * DAY), ...usd(8_700) },
      { bucket: "month", count: 70, oldest: iso(now, -9 * DAY), ...eur(3_300) },
      { bucket: "first", count: 22, oldest: iso(now, 12 * DAY), ...usd(1_180) },
      { bucket: "first", count: 9, oldest: iso(now, 6 * DAY), ...eur(430) },
    ],
    by_country: [
      { country: "ID", small: false, count: 61, amounts: [{ currency: "USD", amount: 5_900 }] },
      { country: "BD", small: false, count: 48, amounts: [{ currency: "USD", amount: 4_300 }] },
      { country: "AL", small: false, count: 37, amounts: [{ currency: "EUR", amount: 2_600 }] },
      { country: "NG", small: false, count: 29, amounts: [{ currency: "USD", amount: 2_750 }] },
      { country: "XK", small: false, count: 18, amounts: [{ currency: "EUR", amount: 1_021 }] },
      { country: "SO", small: true, count: null, amounts: null },
    ],
  };
  return parseSupportSummary(raw)!;
}

export type SampleOverview = {
  overview: AdminOverview;
  geo: GeoCountryRow[];
  inbox: InboxItem[];
  sources: SourcesOverview;
  locales: ReviewLocale[];
  dispatch: DispatchHealth;
  ops: OpsHealth;
  links: OperatingLink[];
  payments: boolean;
  summary: SupportSummary;
};

/** العيّنة كاملةً منسوبةً إلى «الآن»، فتبقى أعمار المزامنة والطوابير معقولة. */
export function sampleOverview(now = Date.now()): SampleOverview {
  return {
    overview: overview(now),
    geo: geo(),
    inbox: inbox(now),
    sources: sources(now),
    locales: LOCALES,
    dispatch: dispatch(now),
    ops: ops(now),
    links: links(now),
    payments: false,
    summary: summary(now),
  };
}
