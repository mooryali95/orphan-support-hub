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
  /**
   * `same` بلا تحويل · `firm` بسعرٍ معتمد مخزَّن (رقمٌ محاسبي بتاريخ سعره) ·
   * `indicative` بسعرٍ استرشادي: يُعرض «≈» لا رقماً محاسبياً.
   */
  basis: "same" | "firm" | "indicative";
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
    basis: exact ? "same" : "indicative",
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
  | { type: "due_overdue" }
  | { type: "donors_at_risk" }
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

/** من الصندوق يُقرأ النوع والتاريخ وحدهما — لا عنوان ولا اسم يصل اللوحة. */
export type InboxEntry = Pick<InboxItem, "kind" | "created_at">;

export type AttentionInput = {
  inbox: Loaded<readonly InboxEntry[]>;
  sources: Loaded<SourcesOverview>;
  locales: Loaded<ReviewLocale[]>;
  dispatch: Loaded<DispatchHealth>;
  ops: Loaded<OpsHealth>;
  /** صحّة ربط منصّات التشغيل كما تحسبها `linkHealth` من `getOperatingLinks`. */
  links: Loaded<{ linked: number; healthy: number }>;
  /** شروط الاعتماد كما تحسبها `goLiveSteps`؛ تُهمل في الوضع الحقيقي. */
  goLive: GoLiveStep[] | null;
  /** مجاميع الدعم من القاعدة، إن وُجدت دالّتها: فائت الاستحقاق والمتعثّرون. */
  summary?: SupportSummary | null | undefined;
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

  if (i.summary) {
    const overdue = i.summary.due.filter((d) => d.bucket === "overdue");
    add(
      "due_overdue",
      { type: "due_overdue" },
      "warn",
      overdue.reduce((a, d) => a + d.count, 0),
      "sponsors",
      overdue.reduce<string | null>(
        (a, d) => (d.oldest && (!a || d.oldest < a) ? d.oldest : a),
        null,
      ),
    );
    add(
      "donors_at_risk",
      { type: "donors_at_risk" },
      "info",
      i.summary.donors?.atRisk ?? 0,
      "sponsors",
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

  // الأخطر أوّلاً، ثم الأقدم انتظاراً (ما لا عمر له بعد ما له عمر)، ثم الأكثر.
  const age = (it: AttentionItem) => waitingDays(it, now) ?? -1;
  return [...out.values()].sort(
    (a, b) =>
      RANK[a.severity] - RANK[b.severity] ||
      age(b) - age(a) ||
      b.count - a.count ||
      a.key.localeCompare(b.key),
  );
}

/**
 * كم يوماً انتظر أقدم بندٍ في الصفّ. `null` حيث لا عمر: صفٌّ بلا تاريخ، أو طابور
 * الإرسال (تاريخه آخر تشغيلٍ لا عمر انتظار).
 */
export function waitingDays(it: AttentionItem, now: number): number | null {
  if (!it.oldestAt || it.topic.type === "dispatch_pending") return null;
  const at = Date.parse(it.oldestAt);
  return Number.isFinite(at) ? Math.max(0, Math.floor((now - at) / 86_400_000)) : null;
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
  | "overview"
  | "geo"
  | "inbox"
  | "sources"
  | "locales"
  | "dispatch"
  | "ops"
  | "links"
  | "payments"
  | "summary";
/** `absent`: المصدر لم يُنشأ في هذه القاعدة بعد — ليس عطلاً ولا فراغاً. */
export type SourceState = "loading" | "ready" | "failed" | "absent";

export function sourceStates(
  sources: Record<SourceKey, Loaded<unknown>>,
  absent: readonly SourceKey[] = [],
): Record<SourceKey, SourceState> {
  const out = {} as Record<SourceKey, SourceState>;
  for (const k of Object.keys(sources) as SourceKey[]) {
    const v = sources[k];
    out[k] = absent.includes(k)
      ? "absent"
      : v === undefined
        ? "loading"
        : v === null
          ? "failed"
          : "ready";
  }
  return out;
}

/** لماذا لم تُجب دالّة القاعدة: لم تُنشأ بعد · رُفض الحساب · عطل. */
export type RpcFailure = "absent" | "denied" | "failed";

/**
 * هجرة المجاميع قد لا تكون طُبّقت على القاعدة: الدالّة الغائبة (أو جدولٌ وعمود
 * تعتمد عليهما) تُقرأ «غائبة» فتعود اللوحة إلى سلوكها بلا المجاميع، ولا تُعرض
 * عطلاً. وما عدا ذلك عطلٌ يُقال.
 */
export function rpcFailure(error: { code?: string | null; message?: string | null }): RpcFailure {
  const c = String(error.code ?? "");
  const m = String(error.message ?? "");
  if (c === "42501" || /not authori[sz]ed/i.test(m)) return "denied";
  if (
    /^(PGRST202|42883|42P01|42703)$/.test(c) ||
    /schema cache|does not exist|could not find the function/i.test(m)
  ) {
    return "absent";
  }
  return "failed";
}

/* ------------------------------------------------------------------ */
/* مجاميع الدعم من القاعدة (admin_support_summary)                      */
/* ------------------------------------------------------------------ */

export type SupportKindKey = "sponsorship" | "qualification" | "in_kind";
export const SUPPORT_KINDS: readonly SupportKindKey[] = ["sponsorship", "qualification", "in_kind"];
export type MoneyMeasure = "committed" | "collected" | "pending" | "disbursed";
export type DueBucket = "overdue" | "week" | "month" | "first";
export const DUE_BUCKETS: readonly DueBucket[] = ["overdue", "week", "month", "first"];

/** مبلغٌ بعملته، ومعادله بالعملة الموحّدة بسعرٍ معتمد — `null` حين لا سعر معتمداً. */
export type MoneyCell = { currency: string; amount: number; unified: number | null };
export type Amount = { currency: string; amount: number };

export type SupportSummary = {
  unified: string;
  cohortMin: number;
  /** أشهرٌ متتالية (YYYY-MM)، الأقدم أوّلاً. */
  months: string[];
  kinds: Array<MoneyCell & { kind: SupportKindKey; status: string; count: number }>;
  trend: Array<MoneyCell & { kind: SupportKindKey; month: string; count: number }>;
  money: Array<MoneyCell & { measure: MoneyMeasure }>;
  rates: Array<{ currency: string; firm: boolean; asOf: string | null; source: string | null }>;
  donors: {
    total: number;
    active: number;
    recent: number;
    atRisk: number;
    lapsed: number;
    newDays: number;
    graceDays: number;
  } | null;
  due: Array<MoneyCell & { bucket: DueBucket; count: number; oldest: string | null }>;
  byCountry: Array<{
    country: string;
    /** دون حدّ الحشد: القاعدة حجبت العدد والمبلغ. */
    small: boolean;
    count: number | null;
    amounts: Amount[] | null;
  }>;
};

/** الحقول التي تُقرأ من ناتج الدالّة — كلّها «مجهولة» حتى تُضبط. */
type RawKey =
  | "unified"
  | "cohort_min"
  | "months"
  | "kinds"
  | "trend"
  | "money"
  | "rates"
  | "donors"
  | "due"
  | "by_country"
  | "kind"
  | "status"
  | "count"
  | "currency"
  | "amount"
  | "month"
  | "measure"
  | "bucket"
  | "oldest"
  | "firm"
  | "as_of"
  | "source"
  | "total"
  | "active"
  | "new"
  | "at_risk"
  | "lapsed"
  | "rule"
  | "new_days"
  | "grace_days"
  | "country"
  | "small"
  | "amounts";
type Raw = { readonly [K in RawKey]?: unknown };
const list = (v: unknown): Raw[] =>
  Array.isArray(v) ? v.filter((x): x is Raw => !!x && typeof x === "object") : [];
const text = (v: unknown) => (typeof v === "string" && v ? v : null);
const cell = (x: Raw): MoneyCell => ({
  currency: code(x.currency),
  amount: num(x.amount),
  unified: x.unified == null ? null : num(x.unified),
});
const oneOf = <T extends string>(v: unknown, all: readonly T[]): T | null =>
  all.includes(v as T) ? (v as T) : null;

/**
 * ناتج الدالّة كما يصل (JSONB، والمبالغ قد تكون نصّاً) ← شكلٌ مضبوط. ما لا يُعرف
 * نوعه أو سلّته يُهمل ولا يُخمَّن؛ وما ليس ناتج الدالّة أصلاً يعود `null`.
 */
export function parseSupportSummary(raw: unknown): SupportSummary | null {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { kinds?: unknown }).kinds)) {
    return null;
  }
  const r = raw as Raw;
  const d = r.donors && typeof r.donors === "object" ? (r.donors as Raw) : null;
  const rule = (d?.rule ?? {}) as Raw;
  const kinds: SupportSummary["kinds"] = [];
  for (const x of list(r.kinds)) {
    const kind = oneOf(x.kind, SUPPORT_KINDS);
    if (kind) kinds.push({ ...cell(x), kind, status: String(x.status ?? ""), count: num(x.count) });
  }
  const trend: SupportSummary["trend"] = [];
  for (const x of list(r.trend)) {
    const kind = oneOf(x.kind, SUPPORT_KINDS);
    const month = text(x.month);
    if (kind && month) trend.push({ ...cell(x), kind, month, count: num(x.count) });
  }
  const money: SupportSummary["money"] = [];
  for (const x of list(r.money)) {
    const measure = oneOf(x.measure, ["committed", "collected", "pending", "disbursed"] as const);
    if (measure) money.push({ ...cell(x), measure });
  }
  const due: SupportSummary["due"] = [];
  for (const x of list(r.due)) {
    const bucket = oneOf(x.bucket, DUE_BUCKETS);
    if (bucket) due.push({ ...cell(x), bucket, count: num(x.count), oldest: text(x.oldest) });
  }
  return {
    unified: code(r.unified) || UNIFIED_CURRENCY,
    cohortMin: num(r.cohort_min),
    months: Array.isArray(r.months)
      ? r.months.filter((m): m is string => typeof m === "string")
      : [],
    kinds,
    trend,
    money,
    rates: list(r.rates).map((x) => ({
      currency: code(x.currency),
      firm: x.firm === true,
      asOf: text(x.as_of),
      source: text(x.source),
    })),
    donors: d
      ? {
          total: num(d.total),
          active: num(d.active),
          recent: num(d.new),
          atRisk: num(d.at_risk),
          lapsed: num(d.lapsed),
          newDays: num(rule.new_days) || NEW_DONOR_DAYS,
          graceDays: num(rule.grace_days),
        }
      : null,
    due,
    byCountry: list(r.by_country).map((x) => {
      const small = x.small === true || x.count == null;
      return {
        country: code(x.country),
        small,
        count: small ? null : num(x.count),
        amounts: small
          ? null
          : list(x.amounts).map((a) => ({ currency: code(a.currency), amount: num(a.amount) })),
      };
    }),
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** مجموعٌ لكلّ عملة، العملة الموحّدة أوّلاً ثم الأكبر. */
function byCurrency(cells: readonly Amount[], unified: string): Amount[] {
  const m = new Map<string, number>();
  for (const c of cells) m.set(c.currency, (m.get(c.currency) ?? 0) + c.amount);
  return [...m]
    .map(([currency, amount]) => ({ currency, amount: round2(amount) }))
    .filter((a) => a.amount !== 0)
    .sort(
      (a, b) =>
        Number(b.currency === unified) - Number(a.currency === unified) ||
        b.amount - a.amount ||
        a.currency.localeCompare(b.currency),
    );
}

/**
 * مجموع خلايا بالعملة الموحّدة بالسعر المعتمد. خليّةٌ واحدة بلا سعرٍ معتمد تُسقط
 * المجموع كلّه (`null`) — لا مجموع ناقص يُعرض كأنّه كامل، ولا سعر استرشادي.
 */
function firmSum(s: SupportSummary, cells: readonly MoneyCell[]): UnifiedTotal | null {
  const used = cells.filter((c) => c.amount !== 0);
  if (used.length === 0 || used.some((c) => c.unified === null)) return null;
  let asOf = "";
  for (const c of used) {
    if (c.currency === s.unified) continue;
    const at = s.rates.find((r) => r.currency === c.currency && r.firm)?.asOf ?? "";
    if (at && (!asOf || at < asOf)) asOf = at;
  }
  const exact = used.every((c) => c.currency === s.unified);
  return {
    amount: round2(used.reduce((a, c) => a + (c.unified ?? 0), 0)),
    currency: s.unified,
    exact,
    basis: exact ? "same" : "firm",
    asOf,
    missing: [],
  };
}

/**
 * المجموع الدقيق بالعملة الموحّدة لمقياسٍ مالي، بالأسعار المعتمدة المخزّنة. يعود
 * `null` حين لا مجاميع من القاعدة أو حين عملةٌ بلا سعرٍ معتمد — فتعود اللوحة
 * إلى التقريب المعلَّم «≈» كما كانت.
 */
export function firmTotal(
  s: SupportSummary | null | undefined,
  measure: MoneyMeasure | "balance",
): UnifiedTotal | null {
  if (!s) return null;
  if (measure !== "balance") {
    return firmSum(
      s,
      s.money.filter((c) => c.measure === measure),
    );
  }
  const signed = s.money
    .filter((c) => c.measure === "collected" || c.measure === "disbursed")
    .map((c) =>
      c.measure === "collected"
        ? c
        : { ...c, amount: -c.amount, unified: c.unified === null ? null : -c.unified },
    );
  return firmSum(s, signed);
}

/** عملاتٌ مستعملة بلا سعرٍ معتمد إلى الموحّدة. */
export function ratesMissing(s: SupportSummary): string[] {
  return s.rates.filter((r) => !r.firm).map((r) => r.currency);
}

export type KindRow = {
  kind: SupportKindKey;
  /** `summary` من دالّة المجاميع · `overview` من المجاميع العامّة · `none` لا مصدر. */
  source: "summary" | "overview" | "none";
  active: number;
  pending: number;
  /** اكتمل: تعهّدٌ وُفِّي أو كفالةٌ أتمّت مدّتها. */
  done: number;
  /** قيمة النشط بعملاته (للكفالة: شهرياً). */
  amounts: Amount[];
  unified: UnifiedTotal | null;
};

const PENDING_STATUS = new Set(["pending", "pending_payment"]);
const DONE_STATUS = new Set(["fulfilled", "completed"]);

/**
 * سطرٌ لكلّ نوع دعم. من دالّة المجاميع إن وُجدت؛ وإلا فالكفالة من المجاميع
 * العامّة كما كانت، والتأهيل والعيني بلا مصدر (`none`) — لا صفر يُختلق.
 */
export function kindRows(
  s: SupportSummary | null | undefined,
  fallback: { rows: readonly SupportRow[]; activeSponsorships: number; awaitingPayment: number },
): KindRow[] {
  return SUPPORT_KINDS.map((kind): KindRow => {
    if (!s) {
      if (kind !== "sponsorship") {
        return { kind, source: "none", active: 0, pending: 0, done: 0, amounts: [], unified: null };
      }
      return {
        kind,
        source: "overview",
        active: fallback.activeSponsorships,
        pending: fallback.awaitingPayment,
        done: 0,
        amounts: fallback.rows
          .filter((r) => r.committed !== 0)
          .map((r) => ({ currency: r.currency, amount: r.committed })),
        unified: unifiedTotal(fallback.rows, "committed"),
      };
    }
    const cells = s.kinds.filter((c) => c.kind === kind);
    const live = cells.filter((c) => c.status === "active");
    const count = (pick: (status: string) => boolean) =>
      cells.filter((c) => pick(c.status)).reduce((a, c) => a + c.count, 0);
    return {
      kind,
      source: "summary",
      active: count((st) => st === "active"),
      pending: count((st) => PENDING_STATUS.has(st)),
      done: count((st) => DONE_STATUS.has(st)),
      amounts: byCurrency(live, s.unified),
      unified: firmSum(s, live),
    };
  });
}

export const PERIODS = [3, 6, 12] as const;
export type Period = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: Period = 12;
export const parsePeriod = (v: unknown): Period =>
  PERIODS.find((p) => p === Number(v)) ?? DEFAULT_PERIOD;

export type TrendLine = {
  kind: SupportKindKey;
  /** عملة السلسلة: الموحّدة حين لكلّ مبلغٍ سعرٌ معتمد، وإلا العملة الوحيدة. */
  currency: string;
  /** قيمةٌ لكلّ شهر؛ فارغةٌ حين تعدّدت العملات بلا سعرٍ معتمد (`blocked`). */
  values: number[];
  total: number;
  delta: number | null;
  /** عملاتٌ منعت رسم خطٍّ واحد: لا تُجمع عملتان بلا سعرٍ معتمد. */
  blocked: string[];
};
export type TrendView = { months: string[]; lines: TrendLine[] };

/**
 * السلسلة الشهرية لكلّ نوع خلال آخر `period` شهراً. الشهر الخالي صفرٌ حقيقي (لم
 * يُحصَّل فيه شيء)، لا فجوة. ويعود `null` حين لا مجاميع من القاعدة.
 */
export function trendView(s: SupportSummary | null | undefined, period: number): TrendView | null {
  if (!s || s.months.length === 0) return null;
  const months = s.months.slice(-Math.max(1, period));
  const lines = SUPPORT_KINDS.map((kind): TrendLine => {
    const cells = s.trend.filter((c) => c.kind === kind && months.includes(c.month));
    const currencies = [...new Set(cells.map((c) => c.currency))];
    const firm = cells.every((c) => c.unified !== null);
    if (!firm && currencies.length > 1) {
      const blocked = [...new Set(cells.filter((c) => c.unified === null).map((c) => c.currency))];
      return { kind, currency: s.unified, values: [], total: 0, delta: null, blocked };
    }
    const values = months.map((m) =>
      round2(
        cells
          .filter((c) => c.month === m)
          .reduce((a, c) => a + (firm ? (c.unified ?? 0) : c.amount), 0),
      ),
    );
    return {
      kind,
      currency: firm ? s.unified : (currencies[0] ?? s.unified),
      values,
      total: round2(values.reduce((a, v) => a + v, 0)),
      delta: trendDelta(values),
      blocked: [],
    };
  });
  return { months, lines };
}

export type DueRow = { bucket: DueBucket; count: number; amounts: Amount[]; oldest: string | null };

/** المستحقّات بسلال تاريخها، بترتيبٍ ثابت؛ السلّة الخالية تبقى بصفرها. */
export function dueRows(s: SupportSummary): DueRow[] {
  return DUE_BUCKETS.map((bucket) => {
    const cells = s.due.filter((d) => d.bucket === bucket);
    return {
      bucket,
      count: cells.reduce((a, d) => a + d.count, 0),
      amounts: byCurrency(cells, s.unified),
      oldest: cells.reduce<string | null>(
        (a, d) => (d.oldest && (!a || d.oldest < a) ? d.oldest : a),
        null,
      ),
    };
  });
}

/** تغيّر آخر شهرٍ عن الذي قبله بالنسبة المئوية؛ `null` حين لا أساس للمقارنة. */
export function trendDelta(series: readonly number[]): number | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1]!;
  const prev = series[series.length - 2]!;
  if (!(prev > 0)) return null;
  return Math.round(((last - prev) / prev) * 100);
}

/* ------------------------------------------------------------------ */
/* التصدير                                                             */
/* ------------------------------------------------------------------ */

export type CsvSection = {
  title: string;
  head: string[];
  rows: Array<Array<string | number | null>>;
};

/**
 * CSV للمجاميع المعروضة وحدها. الأرقام خامٌ (بلا رمز عملة ولا فواصل) لتُجمع في
 * الجدول، والنصّ الذي يبدأ بما يُقرأ صيغةً (= + - @) يُسبق بفاصلةٍ عليا فلا يُنفَّذ.
 * يبدأ بعلامة BOM ليُقرأ العربيّ صحيحاً في برامج الجداول.
 */
const BOM = String.fromCharCode(0xfeff);

export function overviewCsv(sections: readonly CsvSection[]): string {
  const esc = (v: string | number | null) => {
    if (v === null) return "";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines: string[] = [];
  for (const s of sections) {
    if (s.rows.length === 0) continue;
    if (lines.length > 0) lines.push("");
    lines.push(esc(s.title));
    lines.push(s.head.map(esc).join(","));
    for (const row of s.rows) lines.push(row.map(esc).join(","));
  }
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
