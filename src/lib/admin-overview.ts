/**
 * لوحة الإدارة — اشتقاق صورةٍ واحدة ممّا تعيده دوالّ الإدارة القائمة.
 *
 * لا رقم يُحسب هنا مرّتين: كلّ مؤشّرٍ يُقرأ من دالّته (`getAdminOverview`،
 * `getGeoStats`، `getDecisionInbox`، `getSourcesOverview`، `getMyReviewLocales`،
 * `getDispatchHealth`، `getOpsHealth`، `getOperatingLinks`، `getPaymentsReady`)،
 * وهذه الوحدة ترتّب وتقارن فقط. وهي نقيّةٌ بلا شبكة: تعمل بالبيانات الحقيقية
 * وبالعيّنة النموذجية بالمسار نفسه، وتُختبر وحدها.
 *
 * كلّ مصدرٍ يصل بثلاث أحوال: `undefined` لم يصل بعد، `null` تعذّر، وقيمته.
 * ما تعذّر مصدره لا يُعرض صفراً — يغيب بنده ويُذكر المصدر في «الحالة الجزئية».
 */
import type { AdminOverview } from "@/lib/admin.functions";
import { continentOf, resolveCountry, type Continent } from "@/lib/countries";
import { findRate, UNIFIED_CURRENCY } from "@/lib/currency";
import type { GoLiveStep } from "@/lib/go-live";
import type { InboxItem, InboxKind } from "@/lib/inbox.functions";
import type { SourcesOverview } from "@/lib/integrity.functions";
import type { DispatchHealth, OpsHealth, OpsLevel } from "@/lib/monitoring.functions";
import type { GeoCountryRow } from "@/lib/protection.functions";
import type { ReviewLocale } from "@/lib/ui-i18n-admin.functions";

/** `undefined` لم يصل بعد · `null` تعذّر · القيمة. */
export type Loaded<T> = T | null | undefined;

/* ------------------------------------------------------------------ */
/* الدعم المالي بعملاته                                                */
/* ------------------------------------------------------------------ */

export type SupportRow = {
  currency: string;
  unified: boolean;
  /** الالتزام الشهري النشط — ما يُقيَّد لحاجة الطفل بعملة الحاجة. */
  committed: number;
  need: number;
  funded: number;
  gap: number;
  /** ما حُصِّل فعلاً بعملة المال نفسها. */
  collected: number;
  pending: number;
  failed: number;
  disputed: number;
  disbursed: number;
  balance: number;
};

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const code = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toUpperCase();

/**
 * سطرٌ لكلّ عملة: لا يُجمع يورو مع دولار. العملة الموحّدة أوّلاً ثم الأكبر التزاماً.
 * في قاعدةٍ لم تصلها مجاميع العملات تُقرأ المجاميع القديمة بعملة المنصّة كما تفعل
 * تبويب «نظرة عامة».
 */
export function supportRows(o: AdminOverview): SupportRow[] {
  const cur = code(o.currency) || UNIFIED_CURRENCY;
  const rows = new Map<string, SupportRow>();
  const row = (c: string) => {
    const key = code(c) || cur;
    let r = rows.get(key);
    if (!r) {
      r = {
        currency: key,
        unified: key === UNIFIED_CURRENCY,
        committed: 0,
        need: 0,
        funded: 0,
        gap: 0,
        collected: 0,
        pending: 0,
        failed: 0,
        disputed: 0,
        disbursed: 0,
        balance: 0,
      };
      rows.set(key, r);
    }
    return r;
  };

  const orphans = o.orphans_by_currency ?? [
    {
      currency: cur,
      monthly_need: o.orphans.monthly_need,
      monthly_funded: o.orphans.monthly_funded,
      monthly_gap: o.orphans.monthly_gap,
    },
  ];
  for (const x of orphans) {
    const r = row(x.currency);
    r.need = num(x.monthly_need);
    r.funded = num(x.monthly_funded);
    r.gap = num(x.monthly_gap);
  }
  const committed = o.committed_by_currency ?? [
    { currency: cur, amount: o.sponsors.monthly_committed },
  ];
  for (const x of committed) row(x.currency).committed = num(x.amount);
  const money = o.money_by_currency ?? [{ currency: cur, disputed: 0, ...o.money }];
  for (const x of money) {
    const r = row(x.currency);
    r.collected = num(x.collected);
    r.pending = num(x.pending);
    r.failed = num(x.failed);
    r.disputed = num(x.disputed);
    r.disbursed = num(x.disbursed);
    r.balance = num(x.balance);
  }

  return [...rows.values()]
    .filter((r) => MONEY_FIELDS.some((k) => r[k] !== 0))
    .sort(
      (a, b) =>
        Number(b.unified) - Number(a.unified) ||
        b.committed - a.committed ||
        a.currency.localeCompare(b.currency),
    );
}

const MONEY_FIELDS = [
  "committed",
  "need",
  "funded",
  "gap",
  "collected",
  "pending",
  "failed",
  "disputed",
  "disbursed",
  "balance",
] as const;
export type MoneyField = (typeof MONEY_FIELDS)[number];

export type UnifiedTotal = {
  amount: number;
  currency: string;
  /** كلّ المبالغ بالعملة الموحّدة أصلاً: مجموعٌ دقيق بلا تحويل. */
  exact: boolean;
  /** أقدم تاريخ سعرٍ استُعمل؛ فارغٌ حين لا تحويل. */
  asOf: string;
  /** عملاتٌ بلا سعرٍ إلى الموحّدة: لم تدخل المجموع. */
  missing: string[];
};

/**
 * المعادل بالعملة الموحّدة لحقلٍ واحد عبر العملات — تقريبٌ بالأسعار المخزّنة في
 * `currency.ts`، يُعرض «≈» لا رقماً محاسبياً. ما لا سعر له لا يُخمَّن: يُذكر في
 * `missing`. ويعود `null` حين لا مبلغ أصلاً.
 */
export function unifiedTotal(rows: readonly SupportRow[], field: MoneyField): UnifiedTotal | null {
  const used = rows.filter((r) => r[field] !== 0);
  if (used.length === 0) return null;
  let amount = 0;
  let asOf = "";
  let exact = true;
  const missing: string[] = [];
  for (const r of used) {
    const fx = findRate(r.currency, UNIFIED_CURRENCY);
    if (!fx) {
      missing.push(r.currency);
      continue;
    }
    amount += r[field] * fx.rate;
    if (r.currency !== UNIFIED_CURRENCY) {
      exact = false;
      if (fx.asOf && (!asOf || fx.asOf < asOf)) asOf = fx.asOf;
    }
  }
  if (missing.length === used.length) return null;
  return {
    amount: Math.round(amount * 100) / 100,
    currency: UNIFIED_CURRENCY,
    exact,
    asOf,
    missing,
  };
}

/* ------------------------------------------------------------------ */
/* الأطفال                                                             */
/* ------------------------------------------------------------------ */

export type ChildrenSummary = {
  /** ملفّاتٌ منشورة في الدليل (معتمدة أو مكفولة بالكامل). */
  published: number;
  sponsored: number;
  /** منشورٌ لم تكتمل كفالته. */
  waiting: number;
  awaitingReview: number;
  /** نسبة المكفول بالكامل من المنشور (0–100)؛ `null` حين لا منشور. */
  share: number | null;
};

export function childrenSummary(o: AdminOverview): ChildrenSummary {
  const published = num(o.orphans.published);
  const sponsored = Math.min(published, num(o.orphans.fully_sponsored));
  return {
    published,
    sponsored,
    waiting: Math.max(0, published - sponsored),
    awaitingReview: num(o.orphans.awaiting_review),
    share: published > 0 ? Math.round((sponsored / published) * 100) : null,
  };
}

export type CountryRow = {
  /** رمز ISO إن عُرف، وإلا الاسم كما سُجّل. */
  code: string | null;
  name: string;
  continent: Continent | null;
  /** دون حدّ الحشد: القاعدة حجبت أعدادها، فلا يُعرض منها شيء. */
  small: boolean;
  total: number | null;
  sponsored: number | null;
  waiting: number | null;
  gap: number | null;
  currency: string | null;
};

/**
 * الأطفال بحسب الدولة من `geo_stats` كما هي: القاعدة تحجب ما دون حدّ الحشد
 * (`small` أو عددٌ `null`)، وهذه الدالّة لا تستنتج المحجوب من غيره — لا تطرح
 * مجموعاً من مجموع. الترتيب: الأكبر عدداً، والمحجوبة آخراً.
 */
export function countryRows(countries: readonly GeoCountryRow[]): CountryRow[] {
  const rows = countries.map((c): CountryRow => {
    const iso = resolveCountry(c.country);
    const hidden = c.small || c.total == null;
    const total = hidden ? null : num(c.total);
    const sponsored = hidden || c.sponsored == null ? null : num(c.sponsored);
    const gap = hidden || c.gap == null ? null : num(c.gap);
    return {
      code: iso,
      name: c.country,
      continent: iso ? continentOf(iso) : null,
      small: hidden,
      total,
      sponsored,
      waiting: total != null && sponsored != null ? Math.max(0, total - sponsored) : null,
      gap,
      currency: gap != null && c.currency ? code(c.currency) : null,
    };
  });
  return rows.sort(
    (a, b) =>
      Number(a.small) - Number(b.small) ||
      (b.total ?? 0) - (a.total ?? 0) ||
      a.name.localeCompare(b.name),
  );
}

export type RegionRow = {
  continent: Continent;
  countries: number;
  /** مجموع الدول الظاهرة وحدها؛ `partial` حين في القارّة دولةٌ محجوبة. */
  total: number;
  sponsored: number;
  partial: boolean;
};

/** مجموع القارّة من دولها الظاهرة؛ ما حُجب لا يدخل، ويُعلَّم المجموع «جزئياً». */
export function regionRows(rows: readonly CountryRow[]): RegionRow[] {
  const by = new Map<Continent, RegionRow>();
  for (const r of rows) {
    if (!r.continent) continue;
    let g = by.get(r.continent);
    if (!g) {
      g = { continent: r.continent, countries: 0, total: 0, sponsored: 0, partial: false };
      by.set(r.continent, g);
    }
    g.countries += 1;
    if (r.total == null || r.sponsored == null) g.partial = true;
    g.total += r.total ?? 0;
    g.sponsored += r.sponsored ?? 0;
  }
  return [...by.values()].sort(
    (a, b) => b.total - a.total || a.continent.localeCompare(b.continent),
  );
}

/* ------------------------------------------------------------------ */
/* الداعمون                                                            */
/* ------------------------------------------------------------------ */

export const NEW_DONOR_DAYS = 30;

export type DonorsSummary = {
  total: number;
  /** لهم كفالةٌ نشطة واحدة على الأقلّ. */
  active: number;
  /** بلا كفالةٍ نشطة الآن (متوقّفة أو منتهية أو لم تُدفع بعد). */
  inactive: number;
  sponsorships: number;
  activeSponsorships: number;
  /** كفالاتٌ بانتظار الدفع — تعهّداتٌ مستحقّة. */
  awaitingPayment: number;
  /**
   * بدأوا خلال آخر ٣٠ يوماً. يُشتقّ من صفوف الكفلاء، وهي أوّل مئةٍ فقط:
   * حين يزيد العدد عنها يعود `null` — لا عدّ ناقص يُعرض كأنّه كامل.
   */
  recent: number | null;
};

export function donorsSummary(o: AdminOverview, now = Date.now()): DonorsSummary {
  const total = num(o.sponsors.total);
  const active = Math.min(total, num(o.sponsors.with_active));
  const rows = o.sponsor_rows ?? [];
  const complete = (o.sponsor_rows_total ?? rows.length) <= rows.length;
  const since = now - NEW_DONOR_DAYS * 86_400_000;
  return {
    total,
    active,
    inactive: Math.max(0, total - active),
    sponsorships: num(o.sponsors.sponsorships),
    activeSponsorships: num(o.sponsors.active),
    awaitingPayment: num(o.sponsors.awaiting_payment),
    recent: complete
      ? rows.filter((r) => {
          const at = r.since ? Date.parse(r.since) : NaN;
          return Number.isFinite(at) && at >= since && at <= now + 3_600_000;
        }).length
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* ما يحتاج انتباهاً                                                    */
/* ------------------------------------------------------------------ */

/** تبويبات `/admin?tab=…` القائمة التي تقود إليها البنود. */
export type AdminTab =
  | "inbox"
  | "queue"
  | "access"
  | "integrity"
  | "countries"
  | "languages"
  | "monitoring"
  | "overview"
  | "orphans"
  | "sponsors";

export type Severity = "critical" | "warn" | "info";

export type AttentionTopic =
  | { type: "inbox"; kind: InboxKind }
  | { type: "translation_drafts" }
  | { type: "translation_reviewed" }
  | { type: "dispatch_schema" }
  | { type: "dispatch_failed" }
  | { type: "dispatch_pending" }
  | { type: "source_checklist"; sources: number }
  | { type: "source_errors" }
  | { type: "sync_lagging" }
  | { type: "go_live"; total: number }
  | { type: "ops"; check: string; title: string };

export type AttentionItem = {
  key: string;
  topic: AttentionTopic;
  severity: Severity;
  count: number;
  tab: AdminTab;
  /** أقدم بندٍ في هذا الصفّ (ISO)، حيث يُعرف. */
  oldestAt: string | null;
};

export type AttentionInput = {
  inbox: Loaded<InboxItem[]>;
  sources: Loaded<SourcesOverview>;
  locales: Loaded<ReviewLocale[]>;
  dispatch: Loaded<DispatchHealth>;
  ops: Loaded<OpsHealth>;
  /** صحّة ربط منصّات التشغيل كما تحسبها `linkHealth` من `getOperatingLinks`. */
  links: Loaded<{ linked: number; healthy: number }>;
  /** شروط الاعتماد كما تحسبها `goLiveSteps`؛ تُهمل في الوضع الحقيقي. */
  goLive: GoLiveStep[] | null;
  now?: number;
};

const INBOX_TAB: Partial<Record<InboxKind, AdminTab>> = {
  orphan: "queue",
  unlock: "integrity",
  discrepancy: "integrity",
  access: "access",
};
const INBOX_SEVERITY: Partial<Record<InboxKind, Severity>> = {
  money_issue: "critical",
  transfer: "warn",
  unlock: "warn",
  discrepancy: "warn",
  access: "warn",
  orphan: "warn",
  org: "warn",
  pledge: "warn",
};
/** بندٌ انتظر أطول من هذا يرتفع من «للعلم» إلى «تنبيه». */
export const STALE_DECISION_DAYS = 14;

/**
 * فحوص `ops_health` التي موضوعها صفٌّ قائمٌ هنا: لا تُكرَّر صفّاً ثانياً، بل ترفع
 * خطورة صفّها. وإن غاب الصفّ (تعذّر مصدره) ظهر الفحص نفسه.
 */
const OPS_COVERS: Record<string, string> = {
  discrepancies: "inbox:discrepancy",
  unlock_waiting: "inbox:unlock",
  email_failed: "dispatch_failed",
  mirror_lag: "sync_lagging",
};

const RANK: Record<Severity, number> = { critical: 0, warn: 1, info: 2 };
const worse = (a: Severity, b: Severity): Severity => (RANK[a] <= RANK[b] ? a : b);
const fromOps = (l: OpsLevel): Severity => (l === "critical" ? "critical" : "warn");

/** قائمةٌ واحدة مرتّبة بالخطورة ثم بالعدد، من كلّ الطوابير القائمة. */
export function attentionItems(i: AttentionInput): AttentionItem[] {
  const now = i.now ?? Date.now();
  const out = new Map<string, AttentionItem>();
  const add = (
    key: string,
    topic: AttentionTopic,
    severity: Severity,
    count: number,
    tab: AdminTab,
    oldestAt: string | null = null,
  ) => {
    if (count > 0) out.set(key, { key, topic, severity, count, tab, oldestAt });
  };

  if (i.inbox) {
    const groups = new Map<InboxKind, { count: number; oldest: string | null }>();
    for (const item of i.inbox) {
      const g = groups.get(item.kind) ?? { count: 0, oldest: null };
      g.count += 1;
      if (item.created_at && (!g.oldest || item.created_at < g.oldest)) g.oldest = item.created_at;
      groups.set(item.kind, g);
    }
    for (const [kind, g] of groups) {
      const at = g.oldest ? Date.parse(g.oldest) : NaN;
      const stale = Number.isFinite(at) && now - at > STALE_DECISION_DAYS * 86_400_000;
      const base = INBOX_SEVERITY[kind] ?? "info";
      add(
        `inbox:${kind}`,
        { type: "inbox", kind },
        stale ? worse(base, "warn") : base,
        g.count,
        INBOX_TAB[kind] ?? "inbox",
        g.oldest,
      );
    }
  }

  if (i.locales) {
    const sum = (k: "draft" | "reviewed") => i.locales!.reduce((a, l) => a + num(l.counts?.[k]), 0);
    add("translation_drafts", { type: "translation_drafts" }, "info", sum("draft"), "languages");
    add(
      "translation_reviewed",
      { type: "translation_reviewed" },
      "info",
      sum("reviewed"),
      "languages",
    );
  }

  if (i.dispatch) {
    if (!i.dispatch.schema.ready) {
      add(
        "dispatch_schema",
        { type: "dispatch_schema" },
        "critical",
        Math.max(1, i.dispatch.schema.missing.length),
        "monitoring",
      );
    }
    add(
      "dispatch_failed",
      { type: "dispatch_failed" },
      i.dispatch.dbErrorRuns24h >= 3 ? "critical" : "warn",
      i.dispatch.queue.failed,
      "monitoring",
    );
    add(
      "dispatch_pending",
      { type: "dispatch_pending" },
      i.dispatch.lastRun && !i.dispatch.lastRun.ok ? "warn" : "info",
      i.dispatch.queue.pending,
      "monitoring",
      i.dispatch.lastRun?.at ?? null,
    );
  }

  if (i.sources) {
    const open = i.sources.sources.filter((s) => s.status !== "paused");
    let unchecked = 0;
    let withOpen = 0;
    let liveIncomplete = false;
    for (const s of open) {
      const n = Object.values(s.checklist ?? {}).filter((v) => v !== true).length;
      if (n === 0) continue;
      unchecked += n;
      withOpen += 1;
      if (s.status === "active") liveIncomplete = true;
    }
    add(
      "source_checklist",
      { type: "source_checklist", sources: withOpen },
      liveIncomplete ? "warn" : "info",
      unchecked,
      "countries",
    );
    add(
      "source_errors",
      { type: "source_errors" },
      "warn",
      open.filter((s) => Boolean(s.last_error)).length,
      "countries",
    );
  }

  if (i.links) {
    add(
      "sync_lagging",
      { type: "sync_lagging" },
      "warn",
      i.links.linked - i.links.healthy,
      "countries",
    );
  }

  if (i.goLive) {
    add(
      "go_live",
      { type: "go_live", total: i.goLive.length },
      "info",
      i.goLive.filter((s) => s.done === false).length,
      "overview",
    );
  }

  if (i.ops) {
    for (const c of i.ops.checks) {
      if (c.level === "ok") continue;
      const covered = OPS_COVERS[c.key];
      const row = covered ? out.get(covered) : undefined;
      if (row) {
        row.severity = worse(row.severity, fromOps(c.level));
        continue;
      }
      add(
        `ops:${c.key}`,
        { type: "ops", check: c.key, title: c.title },
        fromOps(c.level),
        Math.max(1, num(c.count)),
        "monitoring",
      );
    }
  }

  return [...out.values()].sort(
    (a, b) =>
      RANK[a.severity] - RANK[b.severity] || b.count - a.count || a.key.localeCompare(b.key),
  );
}

export function attentionTotals(items: readonly AttentionItem[]) {
  const by = { critical: 0, warn: 0, info: 0 };
  for (const it of items) by[it.severity] += 1;
  return { rows: items.length, ...by };
}

/* ------------------------------------------------------------------ */
/* حال المصادر                                                         */
/* ------------------------------------------------------------------ */

export type SourceKey =
  "overview" | "geo" | "inbox" | "sources" | "locales" | "dispatch" | "ops" | "links" | "payments";
export type SourceState = "loading" | "ready" | "failed";

export function sourceStates(
  sources: Record<SourceKey, Loaded<unknown>>,
): Record<SourceKey, SourceState> {
  const out = {} as Record<SourceKey, SourceState>;
  for (const k of Object.keys(sources) as SourceKey[]) {
    const v = sources[k];
    out[k] = v === undefined ? "loading" : v === null ? "failed" : "ready";
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* ما لا مصدر حيّاً له بعد                                             */
/* ------------------------------------------------------------------ */

export type SupportKindKey = "sponsorship" | "qualification" | "in_kind";

/**
 * مجاميع الدعم بنوعه واتجاهه الشهري. لا دالّة قاعدةٍ تجمعها اليوم (التعهّدات
 * تُقرأ لصاحبها وحده عبر `my_pledges`)، فالمسار الحقيقي يتركها `null` والعيّنة
 * النموذجية وحدها تملؤها — وتُعلَّم كذلك في الواجهة.
 */
export type SupportExtras = {
  currency: string;
  kinds: Array<{ kind: SupportKindKey; active: number; monthly: number }>;
  /** أشهرٌ متتالية (YYYY-MM)، والمبالغ ما قُيِّد في الشهر بالعملة الموحّدة. */
  trend: Array<{ month: string } & Record<SupportKindKey, number>>;
};

/** تغيّر آخر شهرٍ عن الذي قبله بالنسبة المئوية؛ `null` حين لا أساس للمقارنة. */
export function trendDelta(series: readonly number[]): number | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1]!;
  const prev = series[series.length - 2]!;
  if (!(prev > 0)) return null;
  return Math.round(((last - prev) / prev) * 100);
}
