import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, CircleAlert, FileText, ImageIcon, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { MuralImage, registerFor } from "@/components/brand/MuralImage";
import { Name } from "@/components/kit/Name";
import { VerificationBadge } from "@/components/orphans/VerificationBadge";
import { SampleBadge } from "@/components/impact/SupportImpactParts";
import { useLedgers } from "@/components/sponsorship/ledger-query";
import { monthLabel } from "@/components/sponsorship/sponsor-format";
import { useStatusLabel } from "@/components/sponsorship/status-copy";
import { Skeleton } from "@/components/ui/skeleton";
import { captionOf } from "@/lib/child-updates";
import { listChildUpdates } from "@/lib/child-updates.functions";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { useDemo } from "@/lib/demo-mode";
import { listReports } from "@/lib/impact.functions";
import { formatMoney, fundingPercent } from "@/lib/format";
import { evidenceFromLedger, sortEvidence, type EvidenceMonth } from "@/lib/impact-evidence";
import { defineCopy, pluralOf, useCopy, useLocale } from "@/lib/locale";
import type { MySponsorship } from "@/lib/sponsorships.functions";
import { trialRoute } from "@/lib/trial-gate";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/impact/MyChildrenNow", {
  ar: {
    title: "أطفالك هذا الشهر",
    lead: "كلّ طفلٍ بحال شهره كما قيّدته المنصّة: دُفع، ثم حُوِّل، ثم وصل بمستند.",
    delivered: (month: string) => `وصلت كفالة ${month} إليه بمستند تسليم.`,
    transferred: (month: string) =>
      `حُوِّلت كفالة ${month} إلى الجهة الميدانية، وننتظر مستند التسليم.`,
    paid: (month: string) => `دُفعت كفالة ${month}، وتحويلها إلى الجهة الميدانية مجدول.`,
    issue: (month: string) => `تعذّر تحصيل كفالة ${month}؛ تجد الإجراء في أعلى الصفحة.`,
    starting: "بدأت كفالتك، وأوّل شهرٍ مدفوع يظهر هنا حين يُقيَّد.",
    pending: "تنتظر إتمام الدفع لتبدأ.",
    open: (name: string) => `افتح رحلة ${name}`,
    steps: ["دُفع", "حُوِّل", "وصل"],
    stepsLabel: "مراحل الشهر",
    more: pluralOf(
      {
        one: "وطفلٌ آخر في بطاقاتك أدناه",
        two: "وطفلان آخران في بطاقاتك أدناه",
        few: "و{0} أطفال آخرين في بطاقاتك أدناه",
        many: "و{0} طفلاً آخرين في بطاقاتك أدناه",
        other: "و{0} طفل آخر في بطاقاتك أدناه",
      },
      0,
      "ar",
    ),
    sinceTitle: "منذ زيارتك الأخيرة",
    sinceFirst: "هذه أوّل زيارة نسجّلها على هذا الجهاز؛ في المرّة القادمة نريك هنا ما تغيّر.",
    sinceNone: "لا جديد منذ زيارتك الأخيرة؛ الشهر يمضي في مساره.",
    changed: {
      3: (name: string, month: string) => `وصل مستند تسليم ${month} لـ${name}`,
      2: (name: string, month: string) => `حُوِّلت كفالة ${month} لـ${name}`,
      1: (name: string, month: string) => `قُيِّدت دفعة ${month} لـ${name}`,
    },
    latestTitle: "آخر ما قُيِّد",
    latestEmpty: "لم يُقيَّد شهرٌ بعد. أوّل دفعةٍ ثم تحويلها ثم مستند تسليمها تظهر هنا بالترتيب.",
    state: { 1: "دُفع", 2: "حُوِّل للجهة الميدانية", 3: "وصل بمستند" } as Record<1 | 2 | 3, string>,
    receipt: "إيصال",
    full: "السجلّ كاملاً",
    report: (period: string) => `تقرير تقدّم معتمد: ${period}`,
    update: "تحديثٌ جديد من الجهة الميدانية",
  },
  en: {
    title: "Your children this month",
    lead: "Each child with their month as the platform recorded it: paid, then transferred, then delivered with a document.",
    delivered: (month: string) => `${month}'s support reached them with a delivery document.`,
    transferred: (month: string) =>
      `${month}'s support was sent to the field organization; the delivery document is awaited.`,
    paid: (month: string) => `${month} is paid, and its transfer to the field is scheduled.`,
    issue: (month: string) =>
      `${month} could not be collected; the action is at the top of the page.`,
    starting: "Your sponsorship has begun; the first paid month shows here once recorded.",
    pending: "Waiting for payment to begin.",
    open: (name: string) => `Open ${name}'s journey`,
    steps: ["Paid", "Sent", "Delivered"],
    stepsLabel: "Stages of the month",
    more: pluralOf({
      one: "and one more child in your cards below",
      other: "and {0} more in your cards below",
    }),
    sinceTitle: "Since your last visit",
    sinceFirst:
      "This is the first visit we have noted on this device; next time we will show what changed here.",
    sinceNone: "Nothing new since your last visit; the month is on its way.",
    changed: {
      3: (name: string, month: string) => `${month} delivery document arrived for ${name}`,
      2: (name: string, month: string) => `${month} was sent to the field for ${name}`,
      1: (name: string, month: string) => `${month} payment was recorded for ${name}`,
    },
    latestTitle: "Latest on record",
    latestEmpty:
      "No month recorded yet. The first payment, its transfer and its delivery document appear here in order.",
    state: { 1: "Paid", 2: "Sent to the field", 3: "Delivered with a document" } as Record<
      1 | 2 | 3,
      string
    >,
    receipt: "Receipt",
    full: "Full record",
    report: (period: string) => `Approved progress report: ${period}`,
    update: "A new update from the field organization",
  },
});

/** how many child tiles the hero shows before pointing to the cards below */
const HERO_CHILDREN = 3;

/* per-viewer convenience only: which month stage each row stood at on this device's last visit */
const SEEN_KEY = (demo: boolean) => `kh-impact-seen:v1:${demo ? "try" : "live"}`;
type Seen = Record<string, number>;
function readSeen(key: string): Seen | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) ?? "null");
    return v && typeof v === "object" ? (v as Seen) : null;
  } catch {
    return null;
  }
}
function writeSeen(key: string, rows: EvidenceMonth[]) {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify(Object.fromEntries(rows.map((r) => [r.id, r.issue ? 0 : r.reached]))),
    );
  } catch {
    /* storage denied: the strip simply says «first visit» next time */
  }
}

function journeyLink(id: string, demo: boolean) {
  return demo
    ? { to: trialRoute(`/try/sponsorships/${encodeURIComponent(id)}`) }
    : { to: "/sponsorships/$sponsorshipId" as const, params: { sponsorshipId: id } };
}

/**
 * رأس «أثري»: الطفل أوّلاً. لكلّ طفلٍ رسمه واسمه وشارة توثيقه وجملةٌ واحدة عن شهره، ثم شريط
 * «منذ زيارتك الأخيرة» (ما تقدّم من مراحل منذ آخر فتحٍ على هذا الجهاز)، ثم آخر ما قُيِّد.
 * كلّه من سجلّ الكفالة نفسه (`sponsor.ledger`)، فلا نسبة ولا رقم لا يسنده قيد.
 */
export function MyChildrenNow({
  list,
  sample = false,
  className,
}: {
  list: MySponsorship[];
  /** trial: every line is sample data, and says so */
  sample?: boolean;
  className?: string;
}) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const demo = useDemo();
  const statusLabel = useStatusLabel();
  const shown = list.filter((s) => s.orphan);
  const started = shown.filter((s) => s.status !== "pending_payment");
  const ledgers = useLedgers(started.map((s) => s.id));
  const loading = ledgers.some((q) => q.isLoading);
  const rows = useMemo(
    () => ledgers.flatMap((q) => (q.data?.ledger ? evidenceFromLedger(q.data.ledger) : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ledgers.map((q) => q.dataUpdatedAt).join()],
  );
  const past = rows.filter((r) => !r.upcoming);

  // approved progress reports and child updates join the money record in «آخر ما قُيِّد»
  const fetchReports = useDataFn("impact.reports", listReports);
  const fetchUpdates = useDataFn("sponsor.childUpdates", listChildUpdates);
  const reportKey = useDataKey(["reports"]);
  const updateKey = useDataKey(["child-updates"]);
  const kids = started.slice(0, HERO_CHILDREN).filter((s) => s.orphan);
  const reportQs = useQueries({
    queries: kids.map((s) => ({
      queryKey: [...reportKey, s.orphan!.id],
      queryFn: () => fetchReports({ data: { orphanId: s.orphan!.id } }),
      staleTime: 5 * 60_000,
    })),
  });
  const updateQs = useQueries({
    queries: kids.map((s) => ({
      queryKey: [...updateKey, s.orphan!.id],
      queryFn: () => fetchUpdates({ data: { orphanId: s.orphan!.id } }),
      staleTime: 8 * 60_000,
    })),
  });

  const key = SEEN_KEY(demo);
  /* read once per mount: «since your last visit» compares against what was there before today */
  const [before, setBefore] = useState<Seen | null | undefined>(undefined);
  useEffect(() => setBefore(readSeen(key)), [key]);
  useEffect(() => {
    if (!loading && before !== undefined && rows.length > 0) writeSeen(key, rows);
  }, [loading, before, rows, key]);

  if (shown.length === 0) return null;

  const changes =
    before && !loading
      ? sortEvidence(past)
          .filter((r) => !r.issue && r.reached > (before[r.id] ?? 0))
          .slice(0, 3)
      : [];
  const latest = sortEvidence(past.filter((r) => r.reached > 0)).slice(0, 3);
  type Extra = { id: string; at: string; child: string; kind: "report" | "update"; text: string };
  const extras: Extra[] = kids
    .flatMap((s, i): Extra[] => {
      const name = s.orphan!.display_name;
      const reps = (reportQs[i]?.data?.reports ?? [])
        .filter((r) => r.status === "approved")
        .map((r) => ({
          id: `r-${r.id}`,
          at: r.published_at ?? r.created_at,
          child: name,
          kind: "report" as const,
          text: c.report(r.period),
        }));
      const ups = updateQs[i]?.data;
      const items = ups && "ok" in ups && ups.ok ? ups.data : [];
      return [
        ...reps,
        ...items.map((u) => ({
          id: `u-${u.id}`,
          at: u.at,
          child: name,
          kind: "update" as const,
          text: captionOf(u, locale) || c.update,
        })),
      ];
    })
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 2);
  const month = (ym: string) => monthLabel(ym, locale);

  function sentence(s: MySponsorship): string {
    if (s.status === "pending_payment") return c.pending;
    if (s.status !== "active") return statusLabel(s.status);
    const mine = past
      .filter((r) => r.sponsorshipId === s.id)
      .sort((a, b) => a.month.localeCompare(b.month))
      .at(-1);
    if (!mine || mine.reached === 0) return c.starting;
    if (mine.issue) return c.issue(month(mine.month));
    return mine.reached === 3
      ? c.delivered(month(mine.month))
      : mine.reached === 2
        ? c.transferred(month(mine.month))
        : c.paid(month(mine.month));
  }
  function reachedOf(s: MySponsorship): number {
    return (
      past
        .filter((r) => r.sponsorshipId === s.id && !r.issue)
        .sort((a, b) => a.month.localeCompare(b.month))
        .at(-1)?.reached ?? 0
    );
  }

  const Arrow = (
    <ArrowLeft className="size-4 shrink-0 ltr:-scale-x-100" strokeWidth={1.75} aria-hidden="true" />
  );

  return (
    <section aria-labelledby="children-now" className={cn("mt-6", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="children-now" className="text-xl font-bold text-balance">
          {c.title}
        </h2>
        {sample && <SampleBadge />}
      </div>
      <p className="mt-1 text-sm leading-7 text-muted-foreground text-pretty">{c.lead}</p>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.slice(0, HERO_CHILDREN).map((s, i) => {
          const o = s.orphan!;
          const reached = reachedOf(s);
          return (
            <li key={s.id} className="reveal" style={{ animationDelay: `${i * 60}ms` }}>
              <Link
                {...journeyLink(s.id, demo)}
                aria-label={c.open(o.display_name)}
                className="group flex h-full flex-col gap-3 rounded-2xl bg-card p-4 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.04)] transition-[transform,box-shadow] duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_8px_24px_-8px_rgb(0_0_0/0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.98] motion-reduce:transform-none dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)]"
              >
                <span className="flex items-start gap-3">
                  <MuralImage
                    photoUrl={null}
                    displayName={o.display_name}
                    register={registerFor("", fundingPercent(o.monthly_need, o.funded_monthly))}
                    className="size-16 shrink-0 rounded-xl bg-secondary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-lg leading-7 font-bold">
                      <Name className="truncate">{o.display_name}</Name>
                      <span className="ms-auto text-muted-foreground transition-transform duration-200 group-hover:-translate-x-0.5 ltr:group-hover:translate-x-0.5 motion-reduce:transform-none">
                        {Arrow}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                      <bdi>{formatMoney(s.amount, s.currency, locale)}</bdi>
                    </span>
                    <span className="mt-1.5 block">
                      <VerificationBadge orphanId={o.id} />
                    </span>
                  </span>
                </span>
                {loading && s.status === "active" ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <span className="text-sm leading-7 text-pretty">{sentence(s)}</span>
                )}
                {s.status === "active" && (
                  <span
                    role="img"
                    aria-label={`${c.stepsLabel}: ${reached > 0 ? c.steps[reached - 1] : "—"}`}
                    className="mt-auto grid grid-cols-3 gap-1.5"
                  >
                    {c.steps.map((label, k) => (
                      <span key={label} className="min-w-0">
                        <span
                          className={cn(
                            "block h-1.5 rounded-full transition-colors duration-300",
                            k < reached ? "bg-primary" : "bg-secondary",
                          )}
                        />
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-1 block truncate text-[11px] leading-4",
                            k < reached ? "font-bold text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {label}
                        </span>
                      </span>
                    ))}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      {shown.length > HERO_CHILDREN && (
        <p className="mt-2 text-sm text-muted-foreground">
          <a href="#sponsorship-cards" className="underline-offset-4 hover:underline">
            {c.more(shown.length - HERO_CHILDREN)}
          </a>
        </p>
      )}

      {started.length > 0 && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div
            role="status"
            className="reveal flex gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4"
            style={{ animationDelay: "120ms" }}
          >
            <Sparkles
              className="mt-1 size-4 shrink-0 text-primary"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h3 className="text-sm font-bold">{c.sinceTitle}</h3>
              {before === undefined || loading ? (
                <Skeleton className="mt-2 h-4 w-48" />
              ) : before === null ? (
                <p className="mt-1 text-sm leading-7 text-muted-foreground">{c.sinceFirst}</p>
              ) : changes.length === 0 ? (
                <p className="mt-1 text-sm leading-7 text-muted-foreground">{c.sinceNone}</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {changes.map((r) => (
                    <li key={r.id} className="flex items-start gap-2 text-sm leading-7">
                      <Check
                        className="mt-1.5 size-3.5 shrink-0 text-shore-thrive"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                      {c.changed[r.reached as 1 | 2 | 3](r.child, month(r.month))}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div
            className="reveal rounded-2xl bg-card p-4 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)]"
            style={{ animationDelay: "180ms" }}
          >
            <h3 className="text-sm font-bold">{c.latestTitle}</h3>
            {loading ? (
              <Skeleton className="mt-2 h-16 w-full" />
            ) : latest.length === 0 && extras.length === 0 ? (
              <p className="mt-1 text-sm leading-7 text-muted-foreground">{c.latestEmpty}</p>
            ) : (
              <ol className="mt-2 border-s border-border ps-4">
                {latest.map((r) => (
                  <li key={r.id} className="relative py-1.5">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute top-3.5 -start-[21px] size-2.5 rounded-full ring-4 ring-card",
                        r.issue
                          ? "bg-destructive"
                          : r.reached === 3
                            ? "bg-shore-thrive"
                            : "bg-primary",
                      )}
                    />
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm leading-6">
                      <Name className="font-bold">{r.child}</Name>
                      <span className="text-muted-foreground">{month(r.month)}</span>
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs leading-6 text-muted-foreground">
                      {r.issue ? (
                        <CircleAlert className="size-3.5 text-destructive" aria-hidden="true" />
                      ) : null}
                      {c.state[r.reached as 1 | 2 | 3]}
                      {r.receipt && (
                        <span
                          className="rounded bg-secondary px-1.5 max-w-48 truncate font-mono text-[11px]"
                          dir="ltr"
                        >
                          {c.receipt} {r.receipt}
                        </span>
                      )}
                    </p>
                  </li>
                ))}
                {extras.map((x) => (
                  <li key={x.id} className="relative py-1.5" data-latest-kind={x.kind}>
                    <span
                      aria-hidden="true"
                      className="absolute top-3.5 -start-[21px] size-2.5 rounded-full bg-bridge ring-4 ring-card"
                    />
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm leading-6">
                      <Name className="font-bold">{x.child}</Name>
                      <span className="text-muted-foreground">{month(x.at.slice(0, 7))}</span>
                    </p>
                    <p className="flex items-start gap-x-2 text-xs leading-6 text-muted-foreground">
                      {x.kind === "report" ? (
                        <FileText className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <ImageIcon className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
                      )}
                      <span className="line-clamp-2">{x.text}</span>
                    </p>
                  </li>
                ))}
              </ol>
            )}
            {latest[0]?.sponsorshipId && (
              <Link
                {...journeyLink(latest[0].sponsorshipId, demo)}
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-ring"
              >
                {c.full}
                {Arrow}
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
