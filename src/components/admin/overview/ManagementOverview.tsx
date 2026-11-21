import { FlaskConical, RefreshCw, TriangleAlert } from "lucide-react";
import { useMemo } from "react";

import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isTrial } from "@/config/platform";
import {
  attentionItems,
  childrenSummary,
  donorsSummary,
  sourceStates,
  supportRows,
  unifiedTotal,
  type AdminTab,
  type SourceKey,
  type SupportRow,
} from "@/lib/admin-overview";
import { approxMoney } from "@/lib/currency";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import { intlOf, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

import { COPY } from "./copy";
import "./overview.css";
import { AttentionPanel, ChildrenPanel, CountriesPanel, DonorsPanel, SupportPanel } from "./panels";
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

/**
 * لوحة الإدارة: نظرةٌ واحدة تهبط عليها الإدارة، مبنيّةٌ على دوالّ الإدارة القائمة.
 * كلّ رقمٍ من دالّته، وكلّ سطرٍ يقود إلى شاشته في ‎/admin — لا شاشة تُعاد هنا.
 *
 * هي التبويب الأوّل في ‎/admin لا مسارٌ جديد: المسار الجديد يزيد الحزمة الأولى
 * التي تحمّلها كلّ صفحة، وهذه تُحمَّل قطعةً مستقلّة لمن فتح الإدارة وحده.
 */
export default function ManagementOverview({
  sample: wantSample,
  fns,
  actions,
}: {
  sample: boolean;
  /** فتح تبويبٍ قائم في ‎/admin، وتبديل العيّنة النموذجية. */
  actions: OverviewActions;
  /** دوالّ الإدارة القائمة، تمرّرها صفحة الإدارة التي تحملها. */
  fns: AdminSourceFns;
}) {
  const t = useCopy(COPY);
  const locale = useLocale();
  // العيّنة للعرض قبل الاعتماد وحده؛ بعده تُهمل ولو طُلبت في الرابط.
  const sample = wantSample && isTrial();
  const d = useOverviewData(sample, fns);
  const { open, setSample } = actions;
  const n = (v: number) => formatCount(v, locale);

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
    d.now,
    locale,
    fns,
  ]);

  const states = sourceStates({
    overview: d.overview,
    geo: d.geo,
    inbox: d.inbox,
    sources: d.sources,
    locales: d.locales,
    dispatch: d.dispatch,
    ops: d.ops,
    links: d.links,
    payments: d.payments,
  });
  const failed = (Object.keys(states) as SourceKey[]).filter((k) => states[k] === "failed");
  const queuesPending = (["inbox", "sources", "locales", "dispatch", "ops", "links"] as const).some(
    (k) => states[k] === "loading",
  );
  const tag = sample ? t.sampleTag : null;

  return (
    <OverviewActionsContext.Provider value={actions}>
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
            <Button variant="outline" size="sm" onClick={() => setSample(false)}>
              {t.sampleOff}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
          {d.updatedAt && (
            <p className="ms-auto text-xs text-muted-foreground tabular-nums">
              {t.updatedAt(
                new Intl.DateTimeFormat(intlOf(locale), {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(d.updatedAt),
              )}
            </p>
          )}
        </div>

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
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3"
              >
                <TriangleAlert
                  aria-hidden="true"
                  className="size-5 shrink-0 text-bridge-ink"
                  strokeWidth={1.5}
                />
                <p className="min-w-0 flex-1 text-sm leading-7">
                  <strong className="font-bold">{t.partialTitle}</strong>
                  <span className="text-muted-foreground">
                    {" — "}
                    {t.partialText(failed.map((k) => t.sourceNames[k]).join(t.listJoin))}
                  </span>
                </p>
                <Button variant="outline" size="sm" onClick={d.refresh}>
                  {t.retry}
                </Button>
              </div>
            )}

            <div className="ov-top">
              <Hero rows={model.rows} active={model.donors.activeSponsorships} tag={tag} />
              <Tile
                label={t.childrenLabel}
                value={n(model.children.sponsored)}
                suffix={t.ofTotal(n(model.children.published))}
                tag={tag}
                caption={
                  model.children.share === null
                    ? t.childrenEmpty
                    : t.childrenCaption(
                        formatCount(model.children.share, locale, { percent: true }),
                      )
                }
              >
                {model.children.share !== null && (
                  <Meter percent={model.children.share} label={t.childrenLabel} />
                )}
              </Tile>
              <Tile
                label={t.donorsLabel}
                value={n(model.donors.active)}
                suffix={t.ofTotal(n(model.donors.total))}
                tag={tag}
                caption={
                  model.donors.recent === null
                    ? t.donorsRecentUnknown
                    : t.donorsRecent(n(model.donors.recent))
                }
              >
                {model.donors.total > 0 && (
                  <Meter
                    percent={Math.round((model.donors.active / model.donors.total) * 100)}
                    label={t.donorsLabel}
                  />
                )}
              </Tile>
            </div>

            <div className="ov-mid">
              <div>
                <AttentionPanel
                  items={model.attention}
                  pending={queuesPending}
                  now={d.now}
                  tag={tag}
                />
              </div>
              <div className="grid gap-5">
                <ChildrenPanel summary={model.children} rows={model.rows} tag={tag} />
                <DonorsPanel donors={model.donors} rows={model.rows} tag={tag} />
              </div>
            </div>

            <SupportPanel
              rows={model.rows}
              activeSponsorships={model.donors.activeSponsorships}
              extras={d.extras}
              sample={sample}
            />
            <CountriesPanel geo={d.geo} tag={tag} />

            <nav aria-labelledby="ov-screens" className="pt-3">
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
    </OverviewActionsContext.Provider>
  );
}

/** الرقم الذي تبدأ به اللوحة: الالتزام الشهري، بعملاته ثم معادله الموحّد. */
function Hero({ rows, active, tag }: { rows: SupportRow[]; active: number; tag: string | null }) {
  const t = useCopy(COPY);
  const locale = useLocale();
  const committed = unifiedTotal(rows, "committed");
  const collected = unifiedTotal(rows, "collected");
  const balance = unifiedTotal(rows, "balance");
  const money = (x: NonNullable<typeof committed>) =>
    x.exact
      ? formatMoney(x.amount, x.currency, locale)
      : approxMoney(Math.round(x.amount), x.currency, locale);
  const parts = rows.filter((r) => r.committed > 0);

  return (
    <section
      aria-labelledby="ov-hero"
      className="ov-top-hero relative overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-soft"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="ov-hero" className="text-sm font-medium opacity-80">
          {t.heroLabel}
        </h2>
        {tag && <span className="ov-hero-tag">{tag}</span>}
      </div>
      {committed ? (
        <>
          <p className="ov-hero-num mt-3">{money(committed)}</p>
          {!committed.exact && (
            <p className="mt-3 flex flex-wrap gap-x-4 text-lg font-bold tabular-nums">
              {parts.map((r) => (
                <span key={r.currency}>{formatMoney(r.committed, r.currency, locale)}</span>
              ))}
            </p>
          )}
          <p className="mt-2 text-sm leading-7 opacity-80">
            {t.heroCaption}
            {!committed.exact && committed.asOf && (
              <> · {t.heroApprox(formatDate(committed.asOf, locale))}</>
            )}
            {committed.missing.length > 0 && (
              <> · {t.heroMissing(committed.missing.join(t.listJoin))}</>
            )}
          </p>
        </>
      ) : (
        <p className="mt-3 text-2xl leading-9 font-bold">{t.heroNone}</p>
      )}
      <span aria-hidden="true" className="rule-champagne my-5 block" />
      <dl className="grid grid-cols-3 gap-4">
        {(
          [
            [t.heroSponsorships, formatCount(active, locale)],
            [t.heroCollected, collected ? money(collected) : "—"],
            [t.heroBalance, balance ? money(balance) : "—"],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dd className="ov-hero-fig">{value}</dd>
            <dt className="text-xs leading-5 opacity-80">{label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Tile({
  label,
  value,
  suffix,
  caption,
  tag,
  children,
}: {
  label: string;
  value: string;
  suffix: string;
  caption: string;
  tag: string | null;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
        {tag && <SampleTag>{tag}</SampleTag>}
      </div>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <span className="text-4xl leading-none font-extrabold">{value}</span>
        <span className="text-sm text-muted-foreground tabular-nums">{suffix}</span>
      </p>
      <div className="mt-auto pt-5">
        {children}
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{caption}</p>
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
