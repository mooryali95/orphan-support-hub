import { Circle, CircleAlert, TriangleAlert } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import {
  attentionTotals,
  countryRows,
  regionRows,
  trendDelta,
  unifiedTotal,
  type AttentionItem,
  type ChildrenSummary,
  type DonorsSummary,
  type Loaded,
  type Severity,
  type SupportExtras,
  type SupportKindKey,
  type SupportRow,
} from "@/lib/admin-overview";
import { useGivingCopy } from "@/config/giving-tracks";
import { CONTINENT_LABEL, countryName } from "@/lib/countries";
import { approxMoney, currencyName } from "@/lib/currency";
import { formatCount, formatMoney, fundingPercent } from "@/lib/format";
import { useCopy, useLocale } from "@/lib/locale";
import type { GeoCountryRow } from "@/lib/protection.functions";
import { cn } from "@/lib/utils";

import { COPY } from "./copy";
import {
  Fig,
  Forward,
  Key,
  Meter,
  MoreLink,
  Panel,
  Quiet,
  SampleTag,
  SplitBar,
  TabLink,
} from "./parts";

// الرسم في قطعته: لا يُحمَّل إلا حين توجد سلسلةٌ تُرسم.
const TrendSpark = lazy(() => import("./TrendSpark"));
const TrendTable = lazy(() => import("./TrendSpark").then((m) => ({ default: m.TrendTable })));

const DAY = 86_400_000;

/* ── ما يحتاج انتباهاً ─────────────────────────────────────────────── */

const SEVERITY_ICON: Record<Severity, typeof Circle> = {
  critical: CircleAlert,
  warn: TriangleAlert,
  info: Circle,
};
const SEVERITY_TONE: Record<Severity, string> = {
  critical: "text-destructive",
  warn: "text-bridge-ink",
  info: "text-muted-foreground",
};
/** فحوصٌ عددُها ليس «كم بنداً ينتظر»: يُعرض السطر بلا رقم. */
const OPS_NO_COUNT = new Set(["integrity_chain", "admin_quorum"]);
const FIRST_ROWS = 10;

export function AttentionPanel({
  items,
  pending,
  now,
  tag,
}: {
  items: AttentionItem[];
  /** مصدرٌ واحد على الأقلّ لم يصل بعد. */
  pending: boolean;
  now: number;
  tag: string | null;
}) {
  const t = useCopy(COPY);
  const locale = useLocale();
  const [all, setAll] = useState(false);
  const totals = attentionTotals(items);
  const shown = all ? items : items.slice(0, FIRST_ROWS);

  const label = (it: AttentionItem) => {
    const topic = it.topic;
    if (topic.type === "inbox") return t.inbox[topic.kind] ?? topic.kind;
    if (topic.type === "ops") {
      return (t.ops as Record<string, string | undefined>)[topic.check] ?? topic.title;
    }
    return t.topics[topic.type];
  };
  const meta = (it: AttentionItem) => {
    const topic = it.topic;
    if (topic.type === "source_checklist") return t.inSources(topic.sources);
    if (topic.type === "go_live") return t.goLiveOf(formatCount(topic.total, locale));
    if (topic.type === "inbox" && it.oldestAt) {
      const at = Date.parse(it.oldestAt);
      if (Number.isFinite(at)) return t.oldest(Math.max(0, Math.floor((now - at) / DAY)));
    }
    return null;
  };

  return (
    <Panel
      id="ov-attention"
      title={t.attentionTitle}
      lead={t.attentionLead}
      tag={tag}
      aside={
        items.length > 0 ? (
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {(["critical", "warn", "info"] as const)
              .filter((s) => totals[s] > 0)
              .map((s) => {
                const Icon = SEVERITY_ICON[s];
                return (
                  <li key={s} className="inline-flex items-center gap-1.5">
                    <Icon
                      aria-hidden="true"
                      className={cn("size-4", SEVERITY_TONE[s])}
                      strokeWidth={2}
                    />
                    <span className="font-bold tabular-nums">{formatCount(totals[s], locale)}</span>
                    <span className="text-muted-foreground">{t.severity[s]}</span>
                  </li>
                );
              })}
          </ul>
        ) : undefined
      }
      footer={<MoreLink tab="inbox">{t.screens.inbox}</MoreLink>}
    >
      {items.length === 0 ? (
        pending ? (
          <div aria-busy="true" className="space-y-2">
            <span className="sr-only">{t.attentionPending}</span>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-secondary" />
            ))}
          </div>
        ) : (
          <Quiet title={t.attentionEmptyTitle} text={t.attentionEmptyText} />
        )
      ) : (
        <>
          <ul className="ov-bleed ov-divide">
            {shown.map((it) => {
              const Icon = SEVERITY_ICON[it.severity];
              const m = meta(it);
              const hideCount = it.topic.type === "ops" && OPS_NO_COUNT.has(it.topic.check);
              return (
                <li key={it.key}>
                  <TabLink
                    tab={it.tab}
                    className="ov-row flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon
                      role="img"
                      aria-label={t.severity[it.severity]}
                      className={cn("size-5 shrink-0", SEVERITY_TONE[it.severity])}
                      strokeWidth={2}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.9375rem] leading-6 font-medium">
                        {label(it)}
                      </span>
                      {m && (
                        <span className="block text-xs leading-5 text-muted-foreground">{m}</span>
                      )}
                    </span>
                    {!hideCount && (
                      <span className="text-lg leading-none font-bold tabular-nums">
                        {formatCount(it.count, locale)}
                      </span>
                    )}
                    <Forward className="size-4 shrink-0 text-muted-foreground" />
                  </TabLink>
                </li>
              );
            })}
          </ul>
          {items.length > FIRST_ROWS && (
            <button
              type="button"
              aria-expanded={all}
              onClick={() => setAll((v) => !v)}
              className="mt-2 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {all ? t.showLess : t.attentionAll(formatCount(items.length, locale))}
            </button>
          )}
        </>
      )}
    </Panel>
  );
}

/* ── الدعم ─────────────────────────────────────────────────────────── */

const KINDS: SupportKindKey[] = ["sponsorship", "qualification", "in_kind"];

export function SupportPanel({
  rows,
  activeSponsorships,
  extras,
  sample,
}: {
  rows: SupportRow[];
  activeSponsorships: number;
  extras: SupportExtras | null;
  sample: boolean;
}) {
  const t = useCopy(COPY);
  const locale = useLocale();
  // أسماء الأنواع من مصدرها الواحد (giving-tracks)، لا نسخةٌ ثانية هنا.
  const tracks = useGivingCopy().tracks;
  const kinds: Record<SupportKindKey, string> = {
    sponsorship: tracks.monthly.name,
    qualification: tracks.qualification.name,
    in_kind: tracks.in_kind.name,
  };
  const committed = unifiedTotal(rows, "committed");
  const months = extras?.trend.map((p) => p.month) ?? [];

  const kindRow = (kind: SupportKindKey) => {
    if (kind === "sponsorship") {
      return committed
        ? {
            active: activeSponsorships,
            monthly: committed.exact
              ? formatMoney(committed.amount, committed.currency, locale)
              : approxMoney(committed.amount, committed.currency, locale),
          }
        : null;
    }
    const x = extras?.kinds.find((k) => k.kind === kind);
    return x
      ? { active: x.active, monthly: formatMoney(x.monthly, extras!.currency, locale) }
      : null;
  };

  return (
    <Panel
      id="ov-support"
      title={t.supportTitle}
      lead={t.supportLead}
      tag={sample ? t.sampleTag : null}
      footer={<MoreLink tab="overview">{t.openTreasury}</MoreLink>}
    >
      <div className="ov-support">
        <div>
          <ul className="ov-divide">
            {KINDS.map((kind) => {
              const r = kindRow(kind);
              const series = extras?.trend.map((p) => p[kind]) ?? [];
              const delta = trendDelta(series);
              return (
                <li key={kind} className="ov-kind">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] leading-6 font-bold">
                      {kinds[kind]}
                      {sample && kind !== "sponsorship" && <SampleTag>{t.sampleOnlyTag}</SampleTag>}
                    </p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {r ? (
                        <>
                          <span className="tabular-nums">{formatCount(r.active, locale)}</span>{" "}
                          {t.kindActive}
                        </>
                      ) : (
                        t.kindNoSource
                      )}
                    </p>
                  </div>
                  <div className="text-end">
                    {r ? (
                      <>
                        <p className="text-lg leading-7 font-bold tabular-nums">{r.monthly}</p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {delta === null
                            ? t.kindMonthly
                            : t.trendDelta(
                                `${delta > 0 ? "+" : ""}${formatCount(delta, locale, { percent: true })}`,
                              )}
                        </p>
                      </>
                    ) : (
                      <p aria-hidden="true" className="text-lg leading-7 text-muted-foreground">
                        —
                      </p>
                    )}
                  </div>
                  {series.length > 1 && extras && (
                    <div className="ov-kind-spark">
                      <Suspense
                        fallback={
                          <div
                            role="status"
                            aria-label={t.trendLoading}
                            className="h-14 animate-pulse rounded-lg bg-secondary"
                          />
                        }
                      >
                        <TrendSpark
                          months={months}
                          values={series}
                          currency={extras.currency}
                          label={t.trendChartLabel(kinds[kind])}
                        />
                      </Suspense>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {extras ? (
            <details className="mt-1 text-sm">
              <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {t.trendTitle} — {t.trendTable}
                <SampleTag>{t.sampleOnlyTag}</SampleTag>
              </summary>
              <Suspense fallback={null}>
                <TrendTable extras={extras} kinds={kinds} monthHeading={t.trendMonth} />
              </Suspense>
            </details>
          ) : null}
          {extras ? (
            <p className="text-xs leading-6 text-muted-foreground">{t.sampleOnlyNote}</p>
          ) : (
            <p className="mt-1 text-xs leading-6 text-muted-foreground">{t.trendUnavailable}</p>
          )}
        </div>
        <div className="ov-support-side">
          <h3 className="text-sm font-bold">{t.byCurrency}</h3>
          {rows.length === 0 ? (
            <div className="mt-3">
              <Quiet title={t.supportEmpty} text={t.supportEmptyText} />
            </div>
          ) : (
            <div className="mt-3 space-y-5">
              {rows.map((r) => {
                const pct = fundingPercent(r.need, r.funded);
                return (
                  <div key={r.currency}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <p className="text-sm font-medium">
                        {currencyName(r.currency, locale)}{" "}
                        <bdi className="text-xs text-muted-foreground">{r.currency}</bdi>
                      </p>
                      {r.need > 0 && (
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {t.coverage(formatCount(pct, locale, { percent: true }))}
                        </p>
                      )}
                    </div>
                    {r.need > 0 && (
                      <div className="mt-2">
                        <Meter percent={pct} label={t.coverageLabel(r.currency)} />
                      </div>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                      <Fig
                        label={t.credited}
                        hint={t.creditedHint}
                        value={formatMoney(r.committed, r.currency, locale)}
                      />
                      <Fig
                        label={t.charged}
                        hint={t.chargedHint}
                        value={formatMoney(r.collected, r.currency, locale)}
                      />
                      <Fig label={t.gap} value={formatMoney(r.gap, r.currency, locale)} />
                      <Fig
                        label={t.disbursed}
                        value={formatMoney(r.disbursed, r.currency, locale)}
                      />
                      <Fig label={t.balance} value={formatMoney(r.balance, r.currency, locale)} />
                      <Fig label={t.pending} value={formatMoney(r.pending, r.currency, locale)} />
                    </div>
                    {(r.failed > 0 || r.disputed > 0) && (
                      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-destructive">
                        <TriangleAlert aria-hidden="true" className="size-3.5" strokeWidth={2} />
                        {r.failed > 0 && (
                          <span>{t.failedNote(formatMoney(r.failed, r.currency, locale))}</span>
                        )}
                        {r.disputed > 0 && (
                          <span>{t.disputedNote(formatMoney(r.disputed, r.currency, locale))}</span>
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
              <p className="text-xs leading-6 text-muted-foreground">{t.currencyNote}</p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

/* ── الأطفال ───────────────────────────────────────────────────────── */

export function ChildrenPanel({
  summary,
  rows,
  tag,
}: {
  summary: ChildrenSummary;
  rows: SupportRow[];
  tag: string | null;
}) {
  const t = useCopy(COPY);
  const locale = useLocale();
  const n = (v: number) => formatCount(v, locale);
  const gaps = rows.filter((r) => r.gap > 0);
  return (
    <Panel
      id="ov-children"
      title={t.childrenTitle}
      lead={t.childrenLead}
      tag={tag}
      footer={
        <>
          <MoreLink tab="orphans">{t.openChildren}</MoreLink>
          <MoreLink tab="queue">{t.openQueue}</MoreLink>
        </>
      }
    >
      {summary.published === 0 ? (
        <Quiet title={t.childrenEmpty} text={t.countriesEmptyText} />
      ) : (
        <>
          <SplitBar
            done={summary.sponsored}
            rest={summary.waiting}
            label={t.childrenBarLabel(n(summary.sponsored), n(summary.waiting))}
          />
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1">
            <Key tone="done" label={t.sponsored} value={n(summary.sponsored)} />
            <Key tone="rest" label={t.waiting} value={n(summary.waiting)} />
          </div>
        </>
      )}
      <dl className="ov-divide ov-rule-top mt-5">
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-sm text-muted-foreground">{t.awaitingReview}</dt>
          <dd className="text-lg leading-7 font-bold tabular-nums">{n(summary.awaitingReview)}</dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
          <dt className="text-sm text-muted-foreground">{t.openNeed}</dt>
          <dd className="flex flex-wrap justify-end gap-x-4 text-lg leading-7 font-bold tabular-nums">
            {gaps.length === 0 ? (
              <span className="text-sm font-normal text-muted-foreground">{t.openNeedNone}</span>
            ) : (
              gaps.map((r) => (
                <span key={r.currency}>{formatMoney(r.gap, r.currency, locale)}</span>
              ))
            )}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

/* ── الداعمون ──────────────────────────────────────────────────────── */

export function DonorsPanel({
  donors,
  rows,
  tag,
}: {
  donors: DonorsSummary;
  rows: SupportRow[];
  tag: string | null;
}) {
  const t = useCopy(COPY);
  const locale = useLocale();
  const n = (v: number) => formatCount(v, locale);
  const pending = rows.filter((r) => r.pending > 0);
  return (
    <Panel
      id="ov-donors"
      title={t.donorsTitle}
      lead={t.donorsLead}
      tag={tag}
      footer={
        <>
          <MoreLink tab="sponsors">{t.openDonors}</MoreLink>
          <MoreLink tab="queue">{t.openQueue}</MoreLink>
        </>
      }
    >
      {donors.total === 0 ? (
        <Quiet title={t.donorsEmpty} text={t.supportEmptyText} />
      ) : (
        <>
          <SplitBar
            done={donors.active}
            rest={donors.inactive}
            label={t.donorsBarLabel(n(donors.active), n(donors.inactive))}
          />
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1">
            <Key tone="done" label={t.donorsActive} value={n(donors.active)} />
            <Key tone="rest" label={t.donorsInactive} value={n(donors.inactive)} />
          </div>
          <dl className="ov-divide ov-rule-top mt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <dt className="text-sm text-muted-foreground">{t.donorsNew}</dt>
              <dd className="text-lg leading-7 font-bold tabular-nums">
                {donors.recent === null ? (
                  <span className="text-sm font-normal text-muted-foreground">
                    {t.donorsNewPartial}
                  </span>
                ) : (
                  n(donors.recent)
                )}
              </dd>
            </div>
            <div className="py-3">
              <dt className="text-sm font-bold">{t.due}</dt>
              <dd className="mt-2">
                {donors.awaitingPayment === 0 && pending.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.dueNone}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <Fig label={t.dueCount} value={n(donors.awaitingPayment)} />
                    <Fig
                      label={t.dueAmount}
                      value={
                        pending.length === 0 ? (
                          "—"
                        ) : (
                          <span className="flex flex-wrap gap-x-3">
                            {pending.map((r) => (
                              <span key={r.currency}>
                                {formatMoney(r.pending, r.currency, locale)}
                              </span>
                            ))}
                          </span>
                        )
                      }
                    />
                  </div>
                )}
              </dd>
            </div>
          </dl>
        </>
      )}
    </Panel>
  );
}

/* ── الدول ─────────────────────────────────────────────────────────── */

const FIRST_COUNTRIES = 8;

export function CountriesPanel({ geo, tag }: { geo: Loaded<GeoCountryRow[]>; tag: string | null }) {
  const t = useCopy(COPY);
  const locale = useLocale();
  const [all, setAll] = useState(false);
  const n = (v: number) => formatCount(v, locale);
  const rows = geo ? countryRows(geo) : [];
  const regions = regionRows(rows);
  const max = Math.max(1, ...rows.map((r) => r.total ?? 0));
  const shown = all ? rows : rows.slice(0, FIRST_COUNTRIES);
  const continent = (c: keyof typeof CONTINENT_LABEL) =>
    CONTINENT_LABEL[c][locale === "ar" ? "ar" : "en"];

  return (
    <Panel
      id="ov-countries"
      title={t.countriesTitle}
      lead={t.countriesLead}
      tag={tag}
      footer={<MoreLink tab="countries">{t.screens.countries}</MoreLink>}
    >
      {geo === undefined ? (
        <div aria-busy="true" className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-xl bg-secondary" />
          ))}
        </div>
      ) : geo === null ? (
        <Quiet title={t.unavailable} text={t.countriesUnavailable} />
      ) : rows.length === 0 ? (
        <Quiet title={t.countriesEmpty} text={t.countriesEmptyText} />
      ) : (
        <>
          {regions.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-medium text-muted-foreground">{t.regionsLabel}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {regions.map((r) => (
                  <li
                    key={r.continent}
                    className="inline-flex items-baseline gap-2 rounded-full border border-border px-3 py-1 text-sm"
                  >
                    <span>{continent(r.continent)}</span>
                    <span className="font-bold tabular-nums">{n(r.total)}</span>
                    {r.partial && (
                      <span className="text-xs text-muted-foreground">{t.regionPartial}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="ov-country-head border-b border-border pb-2 text-xs font-medium text-muted-foreground">
            <span>{t.colCountry}</span>
            <span>{t.colCoverage}</span>
            <span className="text-end">{t.colCounts}</span>
            <span className="text-end">{t.colGap}</span>
          </div>
          <ul className="ov-divide">
            {shown.map((r) => {
              const name = r.code ? countryName(r.code, locale) : r.name;
              return (
                <li key={r.code ?? r.name} className="ov-country">
                  <div className="min-w-0">
                    <p className="truncate text-[0.9375rem] leading-6 font-medium">
                      <bdi>{name}</bdi>
                    </p>
                    {r.continent && (
                      <p className="text-xs leading-5 text-muted-foreground">
                        {continent(r.continent)}
                      </p>
                    )}
                  </div>
                  {r.total === null ? (
                    <p className="ov-c-hidden text-end text-xs leading-5 text-muted-foreground">
                      <span className="ov-only-narrow">{t.hiddenShort}</span>
                      <span className="ov-only-wide">{t.hidden}</span>
                    </p>
                  ) : (
                    <>
                      <p className="ov-c-count text-end text-sm tabular-nums">
                        {r.sponsored === null ? (
                          <>
                            <span className="font-bold">{n(r.total)}</span>{" "}
                            <span className="text-xs text-muted-foreground">
                              {t.sponsoredHidden}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="font-bold">{n(r.sponsored)}</span>
                            <span className="text-muted-foreground"> / {n(r.total)}</span>
                          </>
                        )}
                      </p>
                      <div className="ov-c-bar">
                        <div style={{ width: `${Math.max(4, (r.total / max) * 100)}%` }}>
                          {r.sponsored === null ? (
                            <div
                              role="img"
                              aria-label={`${name}: ${n(r.total)}`}
                              className="ov-bar-neutral h-2 rounded-full"
                            />
                          ) : (
                            <SplitBar
                              done={r.sponsored}
                              rest={r.total - r.sponsored}
                              label={t.countryBarLabel(name, n(r.sponsored), n(r.total))}
                            />
                          )}
                        </div>
                      </div>
                      <p className="ov-c-gap tabular-nums">
                        <span className="ov-only-narrow">{t.colGap}: </span>
                        {r.gap !== null && r.currency
                          ? formatMoney(r.gap, r.currency, locale)
                          : "—"}
                      </p>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="size-2.5 rounded-full bg-primary" />
                {t.sponsored}
              </span>
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="size-2.5 rounded-full bg-bridge" />
                {t.waiting}
              </span>
            </div>
            {rows.length > FIRST_COUNTRIES && (
              <button
                type="button"
                aria-expanded={all}
                onClick={() => setAll((v) => !v)}
                className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {all ? t.showLess : t.showAll(n(rows.length))}
              </button>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
