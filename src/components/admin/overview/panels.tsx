import { Circle, CircleAlert, TriangleAlert } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import {
  attentionTotals,
  countryRows,
  dueRows,
  kindRows,
  PERIODS,
  ratesMissing,
  regionRows,
  STALE_DECISION_DAYS,
  trendView,
  waitingDays,
  type AttentionItem,
  type DonorsSummary,
  type Loaded,
  type Period,
  type Severity,
  type SupportKindKey,
  type SupportRow,
  type SupportSummary,
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
  Amounts,
  Failed,
  Fig,
  Forward,
  Key,
  Meter,
  MoreLink,
  Panel,
  Quiet,
  Segmented,
  SplitBar,
  TabLink,
} from "./parts";

// الرسم في قطعته: لا يُحمَّل إلا حين توجد سلسلةٌ تُرسم.
const TrendSpark = lazy(() => import("./TrendSpark"));
const TrendTable = lazy(() => import("./TrendSpark").then((m) => ({ default: m.TrendTable })));

/* ── ما يحتاج انتباهاً ─────────────────────────────────────────────── */

const SEVERITIES: readonly Severity[] = ["critical", "warn", "info"];
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
  failed,
  onRetry,
  now,
  tag,
}: {
  items: AttentionItem[];
  /** مصدرٌ واحد على الأقلّ لم يصل بعد. */
  pending: boolean;
  /** أسماء الطوابير التي تعذّرت قراءتها: القائمة ناقصةٌ بقدرها. */
  failed: string[];
  onRetry: () => void;
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
            {SEVERITIES.filter((s) => totals[s] > 0).map((s) => {
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
      {failed.length > 0 && (
        <div className="mb-4">
          <Failed
            title={t.attentionFailedTitle}
            text={t.attentionFailedText(failed.join(t.listJoin))}
            retry={t.retry}
            onRetry={onRetry}
          />
        </div>
      )}
      {items.length === 0 ? (
        pending ? (
          <div aria-busy="true" className="space-y-2">
            <span className="sr-only">{t.attentionPending}</span>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-secondary" />
            ))}
          </div>
        ) : failed.length > 0 ? null : (
          <Quiet title={t.attentionEmptyTitle} text={t.attentionEmptyText} />
        )
      ) : (
        <>
          {SEVERITIES.map((sev) => {
            const rows = shown.filter((it) => it.severity === sev);
            if (rows.length === 0) return null;
            const Icon = SEVERITY_ICON[sev];
            return (
              <section key={sev} aria-label={t.severity[sev]} className="ov-sev">
                <h3 className="ov-sev-head">
                  <Icon
                    aria-hidden="true"
                    className={cn("size-4 shrink-0", SEVERITY_TONE[sev])}
                    strokeWidth={2}
                  />
                  {t.severity[sev]}
                </h3>
                <ul className="ov-bleed ov-divide">
                  {rows.map((it) => {
                    const m = meta(it);
                    const days = waitingDays(it, now);
                    const hideCount = it.topic.type === "ops" && OPS_NO_COUNT.has(it.topic.check);
                    return (
                      <li key={it.key}>
                        <TabLink
                          tab={it.tab}
                          data-sev={sev}
                          className="ov-row flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-[0.9375rem] leading-6 font-medium">
                              {label(it)}
                            </span>
                            <span className="flex flex-wrap gap-x-2 text-xs leading-5 text-muted-foreground">
                              {days !== null && (
                                <span
                                  className={cn(
                                    days > STALE_DECISION_DAYS && "font-bold text-bridge-ink",
                                  )}
                                >
                                  {t.oldest(days)}
                                </span>
                              )}
                              {m && <span>{m}</span>}
                              <span className="ov-row-to">{t.opens(t.screens[it.tab])}</span>
                            </span>
                          </span>
                          {!hideCount && (
                            <span className="text-xl leading-none font-bold tabular-nums">
                              {formatCount(it.count, locale)}
                            </span>
                          )}
                          <Forward className="size-4 shrink-0 text-muted-foreground" />
                        </TabLink>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {items.length > FIRST_ROWS && (
            <button
              type="button"
              aria-expanded={all}
              onClick={() => setAll((v) => !v)}
              className="ov-noprint mt-2 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

export function SupportPanel({
  rows,
  activeSponsorships,
  awaitingPayment,
  summary,
  absent,
  period,
  onPeriod,
  onRetry,
  tag,
}: {
  rows: SupportRow[];
  activeSponsorships: number;
  awaitingPayment: number;
  summary: Loaded<SupportSummary>;
  /** دالّة المجاميع لم تُنشأ في هذه القاعدة بعد. */
  absent: boolean;
  period: Period;
  onPeriod: (p: Period) => void;
  onRetry: () => void;
  tag: string | null;
}) {
  const t = useCopy(COPY);
  const locale = useLocale();
  const n = (v: number) => formatCount(v, locale);
  // أسماء الأنواع من مصدرها الواحد (giving-tracks)، لا نسخةٌ ثانية هنا.
  const tracks = useGivingCopy().tracks;
  const kinds: Record<SupportKindKey, string> = {
    sponsorship: tracks.monthly.name,
    qualification: tracks.qualification.name,
    in_kind: tracks.in_kind.name,
  };
  const list = kindRows(summary, { rows, activeSponsorships, awaitingPayment });
  const view = trendView(summary, period);
  const missing = summary ? ratesMissing(summary) : [];

  return (
    <Panel
      id="ov-support"
      title={t.supportTitle}
      lead={t.supportLead}
      tag={tag}
      aside={
        view ? (
          <Segmented
            label={t.periodLabel}
            value={period}
            options={PERIODS.map((p) => ({ value: p, label: t.periodMonths(p) }))}
            onChange={onPeriod}
          />
        ) : undefined
      }
      footer={<MoreLink tab="overview">{t.openTreasury}</MoreLink>}
    >
      <div className="ov-support">
        <div>
          <ul className="ov-divide">
            {list.map((r) => {
              const line = view?.lines.find((l) => l.kind === r.kind);
              return (
                <li key={r.kind} className="ov-kind">
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] leading-6 font-bold">{kinds[r.kind]}</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {r.source === "none"
                        ? summary === undefined
                          ? t.kindLoading
                          : t.kindNoSource
                        : [
                            t.kindActive(n(r.active)),
                            r.pending > 0 ? t.kindPending(n(r.pending)) : null,
                            r.done > 0 ? t.kindDone(n(r.done)) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                    </p>
                  </div>
                  <div className="text-end">
                    {r.source === "none" || r.amounts.length === 0 ? (
                      <p aria-hidden="true" className="text-lg leading-7 text-muted-foreground">
                        —
                      </p>
                    ) : (
                      <>
                        <p className="text-lg leading-7 font-bold tabular-nums">
                          {r.unified ? (
                            r.unified.basis === "indicative" ? (
                              approxMoney(Math.round(r.unified.amount), r.unified.currency, locale)
                            ) : (
                              formatMoney(r.unified.amount, r.unified.currency, locale)
                            )
                          ) : (
                            <Amounts items={r.amounts} locale={locale} />
                          )}
                        </p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {r.kind === "sponsorship" ? t.kindMonthly : t.kindPledged}
                        </p>
                      </>
                    )}
                  </div>
                  {line && (
                    <div className="ov-kind-spark">
                      {line.values.length > 1 ? (
                        <>
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
                              months={view!.months}
                              values={line.values}
                              currency={line.currency}
                              label={t.trendChartLabel(kinds[r.kind])}
                            />
                          </Suspense>
                          <p className="ov-kind-cap mt-1 text-xs leading-5 text-muted-foreground tabular-nums">
                            <span>
                              {t.periodTotal(formatMoney(line.total, line.currency, locale))}
                            </span>
                            {line.delta !== null && (
                              <span>
                                {t.trendDelta(
                                  `${line.delta > 0 ? "+" : ""}${formatCount(line.delta, locale, { percent: true })}`,
                                )}
                              </span>
                            )}
                          </p>
                        </>
                      ) : line.blocked.length > 0 ? (
                        <p className="text-xs leading-5 text-muted-foreground">
                          {t.trendBlocked(line.blocked.join(t.listJoin))}
                        </p>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {view && (
            <details className="mt-1 text-sm">
              <summary className="ov-noprint inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {t.trendTitle(t.periodMonths(period))} — {t.trendTable}
              </summary>
              <Suspense fallback={null}>
                <TrendTable
                  view={view}
                  kinds={kinds}
                  monthHeading={t.trendMonth}
                  blocked={t.trendBlockedCell}
                />
              </Suspense>
            </details>
          )}
          {summary ? (
            <p className="text-xs leading-6 text-muted-foreground">
              {t.trendBasis}
              {missing.length > 0 && <> {t.ratesMissing(missing.join(t.listJoin))}</>}
            </p>
          ) : summary === null && !absent ? (
            <div className="mt-3">
              <Failed
                title={t.summaryFailedTitle}
                text={t.summaryFailedText}
                retry={t.retry}
                onRetry={onRetry}
              />
            </div>
          ) : summary === null ? (
            <p className="mt-1 text-xs leading-6 text-muted-foreground">{t.trendUnavailable}</p>
          ) : null}
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

/* ── المستحقّات ────────────────────────────────────────────────────── */

export function DuePanel({
  summary,
  absent,
  donors,
  rows,
  now,
  onRetry,
  tag,
}: {
  summary: Loaded<SupportSummary>;
  absent: boolean;
  donors: DonorsSummary;
  rows: SupportRow[];
  now: number;
  onRetry: () => void;
  tag: string | null;
}) {
  const t = useCopy(COPY);
  const locale = useLocale();
  const n = (v: number) => formatCount(v, locale);
  const pending = rows.filter((r) => r.pending > 0);
  const due = summary ? dueRows(summary) : null;
  return (
    <Panel
      id="ov-due"
      title={t.due}
      lead={t.dueLead}
      tag={tag}
      footer={
        <>
          <MoreLink tab="sponsors">{t.openDonors}</MoreLink>
          <MoreLink tab="queue">{t.openQueue}</MoreLink>
        </>
      }
    >
      {due ? (
        due.every((d) => d.count === 0) ? (
          <Quiet title={t.dueNone} />
        ) : (
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr>
                <th scope="col">{t.dueWhen}</th>
                <th scope="col">{t.dueCountHead}</th>
                <th scope="col">{t.dueAmount}</th>
              </tr>
            </thead>
            <tbody className="ov-divide">
              {due.map((d) => {
                const late = d.bucket === "overdue" && d.count > 0;
                const at = d.oldest ? Date.parse(d.oldest) : NaN;
                const days =
                  (d.bucket === "overdue" || d.bucket === "first") && Number.isFinite(at)
                    ? Math.max(0, Math.floor((now - at) / 86_400_000))
                    : null;
                return (
                  <tr key={d.bucket}>
                    <th scope="row" className="py-3 text-start font-normal">
                      <span className="flex items-center gap-2 text-[0.9375rem] leading-6 font-medium">
                        {late && (
                          <TriangleAlert
                            aria-hidden="true"
                            className="size-4 shrink-0 text-bridge-ink"
                            strokeWidth={2}
                          />
                        )}
                        {t.dueBucket[d.bucket]}
                      </span>
                      {days !== null && d.count > 0 && (
                        <span className="block text-xs leading-5 text-muted-foreground">
                          {t.oldest(days)}
                        </span>
                      )}
                    </th>
                    <td className="px-3 py-3 text-end text-lg leading-7 font-bold tabular-nums">
                      {n(d.count)}
                    </td>
                    <td className="py-3 text-end leading-7 tabular-nums">
                      {d.amounts.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Amounts items={d.amounts} locale={locale} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      ) : summary === undefined ? (
        <div aria-busy="true" className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-xl bg-secondary" />
          ))}
        </div>
      ) : (
        <>
          {donors.awaitingPayment === 0 && pending.length === 0 ? (
            <Quiet title={t.dueNone} />
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Fig label={t.dueCount} value={n(donors.awaitingPayment)} />
              <Fig
                label={t.dueAmount}
                value={
                  pending.length === 0 ? (
                    "—"
                  ) : (
                    <Amounts
                      items={pending.map((r) => ({ currency: r.currency, amount: r.pending }))}
                      locale={locale}
                    />
                  )
                }
              />
            </div>
          )}
          {absent ? (
            <p className="mt-3 text-xs leading-6 text-muted-foreground">{t.dueNoSource}</p>
          ) : (
            <div className="mt-3">
              <Failed title={t.summaryFailedTitle} retry={t.retry} onRetry={onRetry} />
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

/* ── الداعمون ──────────────────────────────────────────────────────── */

export function DonorsPanel({
  donors,
  summary,
  tag,
}: {
  donors: DonorsSummary;
  summary: Loaded<SupportSummary>;
  tag: string | null;
}) {
  const t = useCopy(COPY);
  const locale = useLocale();
  const n = (v: number) => formatCount(v, locale);
  const health = summary?.donors ?? null;
  return (
    <Panel
      id="ov-donors"
      title={t.donorsTitle}
      lead={t.donorsLead}
      tag={tag}
      footer={<MoreLink tab="sponsors">{t.openDonors}</MoreLink>}
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
          <div className="mt-4 grid grid-cols-2 gap-x-4">
            <Fig label={t.donorsActive} value={n(donors.active)} />
            <Fig label={t.donorsInactive} value={n(donors.inactive)} />
          </div>
          <div className="ov-rule-top mt-4 grid grid-cols-3 gap-x-4 pt-4">
            <Fig
              label={t.donorsNew}
              value={
                health ? (
                  n(health.recent)
                ) : donors.recent === null ? (
                  <span className="text-sm font-normal text-muted-foreground">
                    {t.donorsNewPartial}
                  </span>
                ) : (
                  n(donors.recent)
                )
              }
            />
            {health && (
              <>
                <Fig label={t.donorsAtRisk} value={n(health.atRisk)} />
                <Fig label={t.donorsLapsed} value={n(health.lapsed)} />
              </>
            )}
          </div>
          <p className="mt-4 text-xs leading-6 text-muted-foreground">
            {health ? t.donorsRule(health.graceDays) : t.donorsNoHealth}
          </p>
        </>
      )}
    </Panel>
  );
}

/* ── الدول ─────────────────────────────────────────────────────────── */

const FIRST_COUNTRIES = 8;

export function CountriesPanel({
  geo,
  summary,
  onRetry,
  tag,
}: {
  geo: Loaded<GeoCountryRow[]>;
  summary: Loaded<SupportSummary>;
  onRetry: () => void;
  tag: string | null;
}) {
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
        <Failed
          title={t.unavailable}
          text={t.countriesUnavailable}
          retry={t.retry}
          onRetry={onRetry}
        />
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
                              className="ov-track h-2 rounded-full"
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
              <Key tone="done" label={t.sponsored} />
              <Key tone="rest" label={t.waiting} />
            </div>
            {rows.length > FIRST_COUNTRIES && (
              <button
                type="button"
                aria-expanded={all}
                onClick={() => setAll((v) => !v)}
                className="ov-noprint inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {all ? t.showLess : t.showAll(n(rows.length))}
              </button>
            )}
          </div>
        </>
      )}
      {summary && summary.byCountry.length > 0 && (
        <div className="ov-rule-top mt-5 pt-5">
          <h3 className="text-sm font-bold">{t.pledgeCountries}</h3>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            {t.pledgeCountriesLead(n(summary.cohortMin))}
          </p>
          <ul className="ov-pledges mt-3">
            {summary.byCountry.map((c) => (
              <li key={c.country} className="min-w-0">
                <p className="truncate text-[0.9375rem] leading-6 font-medium">
                  <bdi>{countryName(c.country, locale)}</bdi>
                </p>
                {c.small || c.count === null ? (
                  <p className="text-xs leading-5 text-muted-foreground">{t.hiddenShort}</p>
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground tabular-nums">
                    <span className="font-bold text-foreground">
                      <Amounts items={c.amounts ?? []} locale={locale} />
                    </span>{" "}
                    · {t.pledges(c.count)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
