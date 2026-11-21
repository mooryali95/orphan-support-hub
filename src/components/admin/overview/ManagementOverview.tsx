import { Download, FlaskConical, Printer, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useGivingCopy } from "@/config/giving-tracks";
import { isTrial } from "@/config/platform";
import {
  attentionItems,
  childrenSummary,
  countryRows,
  DEFAULT_PERIOD,
  donorsSummary,
  dueRows,
  firmTotal,
  overviewCsv,
  parsePeriod,
  sourceStates,
  supportRows,
  unifiedTotal,
  waitingDays,
  type AdminTab,
  type CsvSection,
  type SourceKey,
  type SupportRow,
  type SupportSummary,
  type UnifiedTotal,
} from "@/lib/admin-overview";
import { countryName } from "@/lib/countries";
import { approxMoney } from "@/lib/currency";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import { intlOf, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

import { COPY } from "./copy";
import "./overview.css";
import { AttentionPanel, CountriesPanel, DonorsPanel, DuePanel, SupportPanel } from "./panels";
import { Meter, OverviewActionsContext, SampleTag, TabLink, type OverviewActions } from "./parts";
import { useOverviewData, type AdminSourceFns } from "./useOverviewData";

const SCREENS: AdminTab[] = [
  "inbox",
  "queue",
  "access",
  "integrity",
  "orphans",
  "sponsors",
  "countries",
  "languages",
  "monitoring",
  "overview",
];
/** الطوابير التي تُبنى منها «يحتاج انتباهاً». */
const QUEUES = ["inbox", "sources", "locales", "dispatch", "ops", "links"] as const;

/**
 * لوحة الإدارة: نظرةٌ واحدة تهبط عليها الإدارة، مبنيّةٌ على دوالّ الإدارة القائمة.
 * كلّ رقمٍ من دالّته، وكلّ سطرٍ يقود إلى شاشته في ‎/admin — لا شاشة تُعاد هنا.
 *
 * هي التبويب الأوّل في ‎/admin لا مسارٌ جديد: المسار الجديد يزيد الحزمة الأولى
 * التي تحمّلها كلّ صفحة، وهذه تُحمَّل قطعةً مستقلّة لمن فتح الإدارة وحده.
 */
export default function ManagementOverview({
  sample: wantSample,
  period: rawPeriod,
  fns,
  actions,
}: {
  sample: boolean;
  /** نافذة الاتجاه الشهري كما في عنوان الصفحة (‎?period=…)، فتُشارَك وتُستعاد. */
  period: unknown;
  /** فتح تبويبٍ قائم في ‎/admin، وتبديل العيّنة والفترة. */
  actions: OverviewActions;
  /** دوالّ الإدارة القائمة، تمرّرها صفحة الإدارة التي تحملها. */
  fns: AdminSourceFns;
}) {
  const t = useCopy(COPY);
  const locale = useLocale();
  const period = parsePeriod(rawPeriod);
  const tracks = useGivingCopy().tracks;
  // العيّنة للعرض قبل الاعتماد وحده؛ بعده تُهمل ولو طُلبت في الرابط.
  const sample = wantSample && isTrial();
  const d = useOverviewData(sample, fns);
  const { open, setSample, setPeriod } = actions;
  const n = (v: number) => formatCount(v, locale);

  // الورقة بيضاء: عند الطباعة تُثبَّت ألوان الوضع الفاتح على اللوحة مهما كان مظهر
  // الشاشة، وتعود بعدها. مباشرةً على العنصر — حدث الطباعة لا ينتظر رسماً جديداً.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const light = (on: boolean) => () => root.current?.classList.toggle("theme-light", on);
    const before = light(true);
    const after = light(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  const model = useMemo(() => {
    if (!d.overview) return null;
    const o = d.overview;
    const rows = supportRows(o);
    const goLive = isTrial()
      ? fns.goLiveSteps(
          {
            published: o.orphans.published,
            links: d.links ?? null,
            payments: d.payments ?? null,
            now: d.now,
          },
          locale,
        )
      : null;
    return {
      rows,
      children: childrenSummary(o),
      donors: donorsSummary(o, d.now),
      attention: attentionItems({
        inbox: d.inbox,
        sources: d.sources,
        locales: d.locales,
        dispatch: d.dispatch,
        ops: d.ops,
        links: d.links && fns.linkHealth(d.links, d.now),
        goLive,
        summary: d.summary,
        now: d.now,
      }),
    };
  }, [
    d.overview,
    d.inbox,
    d.sources,
    d.locales,
    d.dispatch,
    d.ops,
    d.links,
    d.payments,
    d.summary,
    d.now,
    locale,
    fns,
  ]);

  const states = sourceStates(
    {
      overview: d.overview,
      geo: d.geo,
      inbox: d.inbox,
      sources: d.sources,
      locales: d.locales,
      dispatch: d.dispatch,
      ops: d.ops,
      links: d.links,
      payments: d.payments,
      summary: d.summary,
    },
    d.summaryAbsent ? ["summary"] : [],
  );
  const failed = (Object.keys(states) as SourceKey[]).filter((k) => states[k] === "failed");
  const queuesPending = QUEUES.some((k) => states[k] === "loading");
  const queuesFailed = QUEUES.filter((k) => states[k] === "failed").map((k) => t.sourceNames[k]);
  const tag = sample ? t.sampleTag : null;
  const health = d.summary?.donors ?? null;

  function exportCsv() {
    if (!model) return;
    const kindName = {
      sponsorship: tracks.monthly.name,
      qualification: tracks.qualification.name,
      in_kind: tracks.in_kind.name,
    };
    const status = (v: string) => (t.csv.status as Record<string, string | undefined>)[v] ?? v;
    const c = t.csv;
    const s: SupportSummary | null = d.summary ?? null;
    const sections: CsvSection[] = [
      {
        title: sample ? `${t.title} — ${t.sampleBanner}` : t.title,
        head: [c.figure, c.value],
        rows: [
          [c.generated, new Date(d.now).toISOString()],
          [t.heroSponsorships, model.donors.activeSponsorships],
          [t.published, model.children.published],
          [t.childrenLabel, model.children.sponsored],
          [t.waiting, model.children.waiting],
          [t.awaitingReview, model.children.awaitingReview],
          [t.donorsTotal, model.donors.total],
          [t.donorsLabel, model.donors.active],
          ...(health
            ? ([
                [t.donorsNew, health.recent],
                [t.donorsAtRisk, health.atRisk],
                [t.donorsLapsed, health.lapsed],
              ] as Array<[string, number]>)
            : []),
        ],
      },
      {
        title: t.byCurrency,
        head: [
          c.currency,
          t.credited,
          t.charged,
          t.gap,
          t.disbursed,
          t.balance,
          t.pending,
          c.failed,
          c.disputed,
        ],
        rows: model.rows.map((r) => [
          r.currency,
          r.committed,
          r.collected,
          r.gap,
          r.disbursed,
          r.balance,
          r.pending,
          r.failed,
          r.disputed,
        ]),
      },
      {
        title: t.supportTitle,
        head: [c.kind, c.statusHead, c.currency, c.count, c.amount, c.unified(s?.unified ?? "")],
        rows: (s?.kinds ?? []).map((k) => [
          kindName[k.kind],
          status(k.status),
          k.currency,
          k.count,
          k.amount,
          k.unified,
        ]),
      },
      {
        title: c.trend,
        head: [t.trendMonth, c.kind, c.currency, c.count, c.amount, c.unified(s?.unified ?? "")],
        rows: (s?.trend ?? []).map((k) => [
          k.month,
          kindName[k.kind],
          k.currency,
          k.count,
          k.amount,
          k.unified,
        ]),
      },
      {
        title: t.due,
        head: [t.dueWhen, c.count, c.currency, c.amount],
        rows: s
          ? dueRows(s).flatMap((row) =>
              row.amounts.length === 0
                ? [[t.dueBucket[row.bucket], row.count, null, null]]
                : row.amounts.map((a, i) => [
                    t.dueBucket[row.bucket],
                    i === 0 ? row.count : null,
                    a.currency,
                    a.amount,
                  ]),
            )
          : [],
      },
      {
        title: t.attentionTitle,
        head: [c.item, c.severity, c.count, c.days, c.screen],
        rows: model.attention.map((it) => [
          it.topic.type === "inbox"
            ? (t.inbox[it.topic.kind] ?? it.topic.kind)
            : it.topic.type === "ops"
              ? ((t.ops as Record<string, string | undefined>)[it.topic.check] ?? it.topic.title)
              : t.topics[it.topic.type],
          t.severity[it.severity],
          it.count,
          waitingDays(it, d.now),
          t.screens[it.tab],
        ]),
      },
      {
        title: t.countriesTitle,
        head: [t.colCountry, t.published, t.sponsored, t.colGap, c.currency],
        rows: (d.geo ? countryRows(d.geo) : []).map((r) => [
          r.code ? countryName(r.code, locale) : r.name,
          r.total === null ? t.hiddenShort : r.total,
          r.sponsored,
          r.gap,
          r.currency,
        ]),
      },
    ];
    const url = URL.createObjectURL(
      new Blob([overviewCsv(sections)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `overview-${new Date(d.now).toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <OverviewActionsContext.Provider value={actions}>
      <div ref={root} className="ov-root">
        <DashboardShell title={t.title} description={t.lead}>
          {sample && (
            <div
              role="note"
              className="mb-6 flex flex-col gap-x-4 gap-y-3 rounded-2xl border border-bridge/60 bg-card px-4 py-3 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <FlaskConical
                  aria-hidden="true"
                  className="mt-1 size-5 shrink-0 text-bridge-ink"
                  strokeWidth={1.5}
                />
                <p className="min-w-0 flex-1 text-sm leading-7">
                  <strong className="font-bold">{t.sampleBanner}</strong>
                  <span className="text-muted-foreground"> — {t.sampleBannerText}</span>
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="ov-noprint"
                onClick={() => setSample(false)}
              >
                {t.sampleOff}
              </Button>
            </div>
          )}

          <div className="ov-noprint flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button onClick={() => open("inbox")}>{t.workspace}</Button>
            {!sample && (
              <Button
                variant="outline"
                onClick={d.refresh}
                disabled={d.refreshing}
                aria-label={d.refreshing ? t.refreshing : t.refresh}
              >
                <RefreshCw
                  aria-hidden="true"
                  className={cn(d.refreshing && "ov-spin")}
                  strokeWidth={2}
                />
                {t.refresh}
              </Button>
            )}
            {!sample && isTrial() && (
              <Button variant="ghost" onClick={() => setSample(true)}>
                <FlaskConical aria-hidden="true" strokeWidth={2} />
                {t.sampleOn}
              </Button>
            )}
            <div className="ms-auto flex flex-wrap items-center gap-x-2 gap-y-2">
              {d.updatedAt && (
                <p className="me-2 text-xs text-muted-foreground tabular-nums">
                  {t.updatedAt(
                    new Intl.DateTimeFormat(intlOf(locale), {
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(d.updatedAt),
                  )}
                </p>
              )}
              <Button variant="outline" size="sm" disabled={!model} onClick={exportCsv}>
                <Download aria-hidden="true" strokeWidth={2} />
                {t.exportCsv}
              </Button>
              <Button variant="outline" size="sm" disabled={!model} onClick={() => window.print()}>
                <Printer aria-hidden="true" strokeWidth={2} />
                {t.print}
              </Button>
            </div>
          </div>
          <p className="ov-print-only text-sm text-muted-foreground">
            {t.printedAt(formatDate(new Date(d.now).toISOString(), locale))}
          </p>

          {d.denied ? (
            <StateCard title={t.deniedTitle} text={t.deniedText} />
          ) : d.overview === null ? (
            <StateCard
              title={t.errorTitle}
              text={t.errorText}
              action={
                <Button variant="outline" onClick={d.refresh}>
                  {t.retry}
                </Button>
              }
            />
          ) : !model ? (
            <LoadingView label={t.loadingLabel} />
          ) : (
            <div className="mt-6 space-y-5">
              {failed.length > 0 && (
                <div
                  role="status"
                  className="ov-failed flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-3"
                >
                  <TriangleAlert
                    aria-hidden="true"
                    className="size-5 shrink-0 text-destructive"
                    strokeWidth={1.5}
                  />
                  <p className="min-w-0 flex-1 text-sm leading-7">
                    <strong className="font-bold">{t.partialTitle}</strong>
                    <span className="text-muted-foreground">
                      {" — "}
                      {t.partialText(failed.map((k) => t.sourceNames[k]).join(t.listJoin))}
                    </span>
                  </p>
                  <Button variant="outline" size="sm" className="ov-noprint" onClick={d.refresh}>
                    {t.retry}
                  </Button>
                </div>
              )}

              <div className="ov-top">
                <Hero
                  rows={model.rows}
                  summary={d.summary ?? null}
                  active={model.donors.activeSponsorships}
                  tag={tag}
                />
                <Tile
                  label={t.childrenLabel}
                  value={n(model.children.sponsored)}
                  suffix={t.ofTotal(n(model.children.published))}
                  tag={tag}
                  meter={model.children.share}
                  caption={
                    model.children.share === null
                      ? t.childrenEmpty
                      : t.childrenCaption(
                          formatCount(model.children.share, locale, { percent: true }),
                        )
                  }
                  facts={[
                    [t.waiting, n(model.children.waiting)],
                    [t.awaitingReview, n(model.children.awaitingReview)],
                  ]}
                  links={[
                    ["orphans", t.openChildren],
                    ["queue", t.openQueue],
                  ]}
                />
                <Tile
                  label={t.donorsLabel}
                  value={n(model.donors.active)}
                  suffix={t.ofTotal(n(model.donors.total))}
                  tag={tag}
                  meter={
                    model.donors.total > 0
                      ? Math.round((model.donors.active / model.donors.total) * 100)
                      : null
                  }
                  caption={
                    model.donors.total > 0
                      ? t.donorsCaption(
                          formatCount(
                            Math.round((model.donors.active / model.donors.total) * 100),
                            locale,
                            { percent: true },
                          ),
                        )
                      : t.donorsEmpty
                  }
                  facts={
                    health
                      ? [
                          [t.donorsNew, n(health.recent)],
                          [t.donorsAtRisk, n(health.atRisk)],
                        ]
                      : [
                          [
                            t.donorsNew,
                            model.donors.recent === null ? "—" : n(model.donors.recent),
                          ],
                          [t.donorsInactive, n(model.donors.inactive)],
                        ]
                  }
                  links={[["sponsors", t.openDonors]]}
                />
              </div>

              <div className="ov-mid">
                <div>
                  <AttentionPanel
                    items={model.attention}
                    pending={queuesPending}
                    failed={queuesFailed}
                    onRetry={d.refresh}
                    now={d.now}
                    tag={tag}
                  />
                </div>
                <div className="grid content-start gap-5">
                  <DuePanel
                    summary={d.summary}
                    absent={d.summaryAbsent}
                    donors={model.donors}
                    rows={model.rows}
                    now={d.now}
                    onRetry={d.refresh}
                    tag={tag}
                  />
                  <DonorsPanel donors={model.donors} summary={d.summary} tag={tag} />
                </div>
              </div>

              <SupportPanel
                rows={model.rows}
                activeSponsorships={model.donors.activeSponsorships}
                awaitingPayment={model.donors.awaitingPayment}
                summary={d.summary}
                absent={d.summaryAbsent}
                period={period}
                onPeriod={(p) => setPeriod(p === DEFAULT_PERIOD ? null : p)}
                onRetry={d.refresh}
                tag={tag}
              />
              <CountriesPanel geo={d.geo} summary={d.summary} onRetry={d.refresh} tag={tag} />

              <nav aria-labelledby="ov-screens" className="ov-noprint pt-3">
                <h2 id="ov-screens" className="eyebrow">
                  {t.screensTitle}
                </h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {SCREENS.map((tab) => (
                    <li key={tab}>
                      <TabLink
                        tab={tab}
                        className="ov-chip inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
                      >
                        {t.screens[tab]}
                      </TabLink>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          )}
        </DashboardShell>
      </div>
    </OverviewActionsContext.Provider>
  );
}

/**
 * الرقم الذي تبدأ به اللوحة: الالتزام الشهري. بالعملة الموحّدة بسعرٍ معتمد مخزَّن
 * حين تتوفّر مجاميع القاعدة وأسعارها؛ وإلا فتقريبٌ معلَّم «≈» بالسعر الاسترشادي.
 */
function Hero({
  rows,
  summary,
  active,
  tag,
}: {
  rows: SupportRow[];
  summary: SupportSummary | null;
  active: number;
  tag: string | null;
}) {
  const t = useCopy(COPY);
  const locale = useLocale();
  const committed = firmTotal(summary, "committed") ?? unifiedTotal(rows, "committed");
  const collected = firmTotal(summary, "collected") ?? unifiedTotal(rows, "collected");
  const balance = firmTotal(summary, "balance") ?? unifiedTotal(rows, "balance");
  const money = (x: UnifiedTotal) =>
    x.basis === "indicative"
      ? approxMoney(Math.round(x.amount), x.currency, locale)
      : formatMoney(x.amount, x.currency, locale);
  const parts = rows.filter((r) => r.committed > 0);

  return (
    <section aria-labelledby="ov-hero" className="ov-top-hero ov-hero">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="ov-hero" className="ov-hero-quiet text-sm font-medium">
          {t.heroLabel}
        </h2>
        {tag && <span className="ov-hero-tag">{tag}</span>}
      </div>
      {committed ? (
        <>
          <p className="ov-hero-num mt-4">{money(committed)}</p>
          {!committed.exact && (
            <p className="mt-3 flex flex-wrap gap-x-4 text-lg font-bold tabular-nums">
              {parts.map((r) => (
                <span key={r.currency}>{formatMoney(r.committed, r.currency, locale)}</span>
              ))}
            </p>
          )}
          <p className="ov-hero-quiet mt-2 text-sm leading-7">
            {t.heroCaption}
            {committed.basis === "firm" && committed.asOf && (
              <> · {t.heroFirm(formatDate(committed.asOf, locale))}</>
            )}
            {committed.basis === "indicative" && committed.asOf && (
              <> · {t.heroApprox(formatDate(committed.asOf, locale))}</>
            )}
            {committed.missing.length > 0 && (
              <> · {t.heroMissing(committed.missing.join(t.listJoin))}</>
            )}
          </p>
        </>
      ) : (
        <p className="mt-4 text-2xl leading-9 font-bold">{t.heroNone}</p>
      )}
      <span aria-hidden="true" className="rule-champagne my-5 block" />
      <dl className="ov-hero-figs">
        {(
          [
            [t.heroSponsorships, formatCount(active, locale)],
            [t.heroCollected, collected ? money(collected) : "—"],
            [t.heroBalance, balance ? money(balance) : "—"],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dd className="ov-hero-fig">{value}</dd>
            <dt className="ov-hero-quiet text-xs leading-5">{label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** مؤشّرٌ رئيس: رقمٌ ومقياسه، ثم حقيقتان تكمّلانه وروابط شاشته. */
function Tile({
  label,
  value,
  suffix,
  caption,
  meter,
  facts,
  links,
  tag,
}: {
  label: string;
  value: string;
  suffix: string;
  caption: string;
  meter: number | null;
  facts: Array<[string, string]>;
  links: Array<[AdminTab, string]>;
  tag: string | null;
}) {
  return (
    <section className="flex flex-col rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
        {tag && <SampleTag>{tag}</SampleTag>}
      </div>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
        <span className="ov-tile-num">{value}</span>
        <span className="text-sm text-muted-foreground tabular-nums">{suffix}</span>
      </p>
      <div className="mt-4">
        {meter !== null && <Meter percent={meter} label={label} />}
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{caption}</p>
      </div>
      <dl className="ov-divide ov-rule-top mt-4">
        {facts.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-sm text-muted-foreground">{k}</dt>
            <dd className="text-base leading-6 font-bold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="ov-noprint mt-auto flex flex-wrap gap-x-5 pt-2">
        {links.map(([tab, text]) => (
          <TabLink
            key={tab}
            tab={tab}
            className="inline-flex min-h-11 items-center text-sm font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {text}
          </TabLink>
        ))}
      </div>
    </section>
  );
}

function StateCard({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mt-6 rounded-3xl border border-border bg-card px-6 py-14 text-center shadow-soft">
      <span aria-hidden="true" className="rule-champagne mx-auto block w-24" />
      <p className="mt-5 text-lg font-bold">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">{text}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

/** هيكلٌ بأبعاد اللوحة نفسها: لا يقفز شيءٌ حين تصل الأرقام. */
function LoadingView({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="mt-6 space-y-5">
      <div className="ov-top">
        <Skeleton className="ov-top-hero ov-skel-a rounded-3xl" />
        <Skeleton className="ov-skel-a rounded-3xl" />
        <Skeleton className="ov-skel-a rounded-3xl" />
      </div>
      <div className="ov-mid">
        <Skeleton className="ov-skel-b rounded-3xl" />
        <Skeleton className="ov-skel-b rounded-3xl" />
      </div>
    </div>
  );
}
