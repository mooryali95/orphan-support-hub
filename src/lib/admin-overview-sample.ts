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
import type { SupportExtras } from "@/lib/admin-overview";
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

/** اثنا عشر شهراً تنتهي بالشهر الجاري. */
function extras(now: number): SupportExtras {
  const sponsorship = [
    21_400, 22_900, 23_600, 25_100, 26_800, 27_500, 29_300, 30_200, 32_600, 33_900, 35_000, 36_136,
  ];
  const qualification = [
    2_100, 2_300, 2_900, 3_100, 3_400, 3_300, 4_000, 4_600, 5_100, 5_400, 6_000, 6_450,
  ];
  const inKind = [
    1_800, 2_600, 2_100, 3_400, 2_900, 2_400, 3_100, 3_700, 2_800, 3_300, 3_600, 3_900,
  ];
  const end = new Date(now);
  return {
    currency: "USD",
    kinds: [
      { kind: "qualification", active: 86, monthly: 6_450 },
      { kind: "in_kind", active: 41, monthly: 3_900 },
    ],
    trend: sponsorship.map((v, i) => {
      const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (11 - i), 1));
      return {
        month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
        sponsorship: v,
        qualification: qualification[i]!,
        in_kind: inKind[i]!,
      };
    }),
  };
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
  extras: SupportExtras;
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
    extras: extras(now),
  };
}
