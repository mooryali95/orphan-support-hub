import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, FileText, Heart } from "lucide-react";

import { MuralImage, registerFor } from "@/components/brand/MuralImage";
import { EmptyState } from "@/components/kit/EmptyState";
import { Name } from "@/components/kit/Name";
import { SimilarReadyChildren } from "@/components/orphans/SimilarReadyChildren";
import { VerificationBadge } from "@/components/orphans/VerificationBadge";
import { useLedger } from "@/components/sponsorship/ledger-query";
import { ManageSponsorshipLink } from "@/components/sponsorship/ManageSponsorship";
import { monthLabel } from "@/components/sponsorship/sponsor-format";
import { PackageSteps } from "@/components/sponsorship/SponsorshipJourney";
import { useStatusLabel } from "@/components/sponsorship/status-copy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { useDemo } from "@/lib/demo-mode";
import { formatDate, formatMoney, fundingPercent } from "@/lib/format";
import { listReports } from "@/lib/impact.functions";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import {
  applyFilter,
  CHILD_FILTERS,
  COMPACT_FROM,
  currentMonth,
  filterOf,
  isFirstMonth,
  newestFirst,
  type ChildFilter,
} from "@/lib/sponsor-center";
import type { MySponsorship } from "@/lib/sponsorships.functions";
import { trialRoute } from "@/lib/trial-gate";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/sponsorship/ChildCard", {
  ar: {
    deletedFile: "ملفّ محذوف",
    monthly: (amount: string) => `${amount} شهرياً`,
    once: (amount: string) => `${amount} لمرّة واحدة`,
    follow: "تابع الرحلة",
    history: "السجلّ والإيصالات",
    noMonth: "لم يبدأ شهرٌ مدفوع بعد.",
    latestReport: (period: string, date: string) => `آخر تقرير: ${period} · ${date}`,
    noReport: "لم يُعتمد تقريرٌ بعد.",
    endsOn: (date: string) => `تنتهي في ${date} بعد آخر شهرٍ مدفوع.`,
    pausedUntil: (date: string) => `موقوفة بطلبك، وتُستأنف في ${date}.`,
    providerPaused: "أوقف مزوّد الدفع التحصيل مؤقّتاً.",
    childExit: (date: string) => `انتهت في ${date} لأن الطفل أتمّ البرنامج أو غادره.`,
    ended: (date: string) =>
      `انتهت في ${date}. جزاك الله خيراً على ما قدّمت؛ سجلّها وإيصالاتها باقيةٌ هنا.`,
    nextTitle: "ما الذي يحدث بعد ذلك",
    nextSteps: [
      "يُدفع الشهر ويُجدول تحويله للجهة الميدانية.",
      "تُحوَّل الكفالة للجهة الميدانية في بلد الطفل.",
      "تصل الطفلَ، وترفع الجهة مستند الاستلام.",
    ],
    nextTiming:
      "يصلك أوّل تقريرٍ عادةً بعد دورة المراجعة القادمة للمكتب. لا نعدك بتاريخٍ لا تعطيه البيانات.",
    filters: {
      all: "الكلّ",
      active: "جارية",
      paused: "موقوفة",
      ended: "منتهية",
    } as Record<ChildFilter, string>,
    filterLabel: "عرض الكفالات",
    none: "لا كفالات في هذا العرض.",
    open: (name: string) => `افتح رحلة ${name}`,
  },
  en: {
    deletedFile: "Deleted file",
    monthly: (amount: string) => `${amount} monthly`,
    once: (amount: string) => `${amount} once`,
    follow: "Follow the journey",
    history: "History and receipts",
    noMonth: "No paid month has started yet.",
    latestReport: (period: string, date: string) => `Latest report: ${period} · ${date}`,
    noReport: "No report approved yet.",
    endsOn: (date: string) => `Ends on ${date} after the last paid month.`,
    pausedUntil: (date: string) => `Paused at your request; resumes on ${date}.`,
    providerPaused: "The payment provider has paused collection for now.",
    childExit: (date: string) =>
      `Ended on ${date} because the child completed or left the programme.`,
    ended: (date: string) =>
      `Ended on ${date}. Thank you for what you gave; its history and receipts stay here.`,
    nextTitle: "What happens next",
    nextSteps: [
      "The month is paid and its transfer is scheduled.",
      "The sponsorship is sent to the field organization in the child's country.",
      "It reaches the child, and the organization uploads the receipt document.",
    ],
    nextTiming:
      "Your first report usually arrives after the office's next review cycle. We don't promise a date the data doesn't give.",
    filters: {
      all: "All",
      active: "Active",
      paused: "Paused",
      ended: "Ended",
    } as Record<ChildFilter, string>,
    filterLabel: "Show sponsorships",
    none: "No sponsorships in this view.",
    open: (name: string) => `Open ${name}'s journey`,
  },
});

/** أوّل ما يظهر من البطاقات يجلب سجلّه؛ وما بعد هذا العدد يُفتح من صفحته. */
export const LEDGER_CARDS = 6;

/** يصير صحيحاً مرّةً حين تقترب البطاقة من الشاشة، ثم يبقى. */
function useSeen<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") return setSeen(true);
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) setSeen(true);
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

function journeyLink(id: string, demo: boolean) {
  return demo
    ? { to: trialRoute(`/try/sponsorships/${encodeURIComponent(id)}`) }
    : { to: "/sponsorships/$sponsorshipId" as const, params: { sponsorshipId: id } };
}

/** ما سيحدث للكفالة بتاريخه، أو شكرٌ لما انتهى — لا حالةٌ مبهمة. */
function lifecycle(s: MySponsorship, c: (typeof COPY)["ar"], locale: string): string | null {
  const d = (v: string | null | undefined) => formatDate(v, locale);
  if (s.cancel_effective_at && (s.status === "active" || s.status === "paused"))
    return c.endsOn(d(s.cancel_effective_at));
  if (s.status === "paused")
    return s.paused_until ? c.pausedUntil(d(s.paused_until)) : c.providerPaused;
  if (s.status === "completed" && s.end_reason === "child_exit") return c.childExit(d(s.ended_at));
  if (s.status === "cancelled" || s.status === "completed")
    return c.ended(d(s.ended_at ?? s.cancel_effective_at));
  return null;
}

/**
 * بطاقة الطفل في «أثري»: الصورة المأذونة أو رسمٌ بدلها، والاسم والحالة والشارة، وخطّ طرد
 * هذا الشهر (مُجدول ← حُوِّل ← وصل)، وآخر تقرير، ثم «تابع الرحلة» و«إدارة الكفالة». السجلّ
 * يُجلب حين تقترب البطاقة من الشاشة، وللبطاقات الستّ الأولى وحدها.
 */
export function ChildCard({
  s,
  fetchLedger = true,
  compact = false,
}: {
  s: MySponsorship;
  fetchLedger?: boolean;
  compact?: boolean;
}) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const demo = useDemo();
  const statusLabel = useStatusLabel();
  const [ref, seen] = useSeen<HTMLElement>();
  const started = s.status !== "pending_payment";
  const ledger = useLedger(s.id, fetchLedger && seen && started);
  const orphan = s.orphan;
  const fetchReports = useDataFn("impact.reports", listReports);
  const reports = useQuery({
    queryKey: useDataKey(["reports", orphan?.id]),
    queryFn: () => fetchReports({ data: { orphanId: orphan!.id } }),
    enabled: !compact && seen && Boolean(orphan) && started,
    staleTime: 5 * 60_000,
  });
  const name = orphan?.display_name ?? c.deletedFile;
  const percent = orphan ? fundingPercent(orphan.monthly_need, orphan.funded_monthly) : 0;
  const money = formatMoney(s.amount, s.currency, locale);
  const m = ledger.data?.ledger ? currentMonth(ledger.data.ledger) : null;
  const note = lifecycle(s, c, locale);
  const first = isFirstMonth(s);
  const latest = (reports.data?.reports ?? [])
    .filter((r) => r.status === "approved")
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))[0];
  const link = journeyLink(s.id, demo);

  const packageBlock = !started ? null : ledger.isLoading || (fetchLedger && !seen) ? (
    <Skeleton className="h-6 w-full max-w-sm" />
  ) : m ? (
    <div className="max-w-md">
      <p className="text-xs text-muted-foreground">{monthLabel(m.month, locale)}</p>
      <PackageSteps m={m} compact={compact} className="mt-1" />
    </div>
  ) : fetchLedger ? (
    <p className="text-xs text-muted-foreground">{c.noMonth}</p>
  ) : null;

  if (compact)
    return (
      <li ref={ref as React.RefObject<HTMLLIElement>}>
        <Link
          {...link}
          aria-label={c.open(name)}
          className="flex min-h-16 items-center gap-3 rounded-2xl bg-card p-3 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] transition-[box-shadow,transform] duration-150 hover:shadow-[0_0_0_1px_rgb(0_0_0/0.12),0_4px_12px_-4px_rgb(0_0_0/0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.99] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)]"
        >
          <MuralImage
            photoUrl={null}
            displayName={name}
            register={registerFor("", percent)}
            className="size-12 shrink-0 rounded-xl bg-secondary"
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2">
              <Name className="truncate font-bold">{name}</Name>
              <span className="text-xs text-muted-foreground">{statusLabel(s.status)}</span>
            </span>
            <span className="mt-1.5 block">{packageBlock}</span>
          </span>
          <ChevronLeft
            className="size-5 shrink-0 text-muted-foreground ltr:-scale-x-100"
            aria-hidden="true"
          />
        </Link>
      </li>
    );

  return (
    <li ref={ref as React.RefObject<HTMLLIElement>}>
      <article className="rounded-2xl bg-card p-4 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.04)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)] sm:p-5">
        <div className="flex items-start gap-4">
          <MuralImage
            photoUrl={null}
            displayName={name}
            register={registerFor("", percent)}
            className="size-16 shrink-0 rounded-xl bg-secondary sm:size-20"
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-lg leading-snug font-bold text-balance">
              <Name>{name}</Name>
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant={s.status === "active" ? "default" : "secondary"}>
                {statusLabel(s.status)}
              </Badge>
              {orphan && <VerificationBadge orphanId={orphan.id} />}
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground tabular-nums">
              {s.type === "monthly" ? c.monthly(money) : c.once(money)}
            </p>
          </div>
        </div>

        {packageBlock && <div className="mt-4">{packageBlock}</div>}

        {note && <p className="mt-3 text-sm leading-7 text-bridge-ink">{note}</p>}

        {started && orphan && reports.isSuccess && (
          <p className="mt-3 flex items-start gap-1.5 text-sm leading-6 text-muted-foreground">
            <FileText className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            {latest
              ? c.latestReport(
                  latest.period,
                  formatDate(latest.published_at ?? latest.created_at, locale),
                )
              : c.noReport}
          </p>
        )}

        {first && (
          <details className="group mt-4 rounded-xl bg-secondary/50 p-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold">
              <Heart className="size-4 text-bridge-ink" strokeWidth={1.75} aria-hidden="true" />
              {c.nextTitle}
            </summary>
            <ol className="mt-1 list-decimal space-y-1 ps-5 text-sm leading-7">
              {c.nextSteps.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">{c.nextTiming}</p>
          </details>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {started && (
            <Button asChild className="min-h-11">
              <Link {...link}>{filterOf(s) === "ended" ? c.history : c.follow}</Link>
            </Button>
          )}
          <ManageSponsorshipLink s={s} />
        </div>
      </article>
    </li>
  );
}

/**
 * «أطفالي»: بطاقةٌ لكلّ كفالة، الأحدث أولاً. من أربعٍ فأكثر تصير قائمةً مختصرة بمرشّحات
 * (الكلّ / جارية / موقوفة / منتهية) تُحسب في المتصفّح من الحالة. المنتهية تبقى بسجلّها.
 */
export function ChildCards({
  list,
  className,
}: {
  list: readonly MySponsorship[];
  className?: string;
}) {
  const c = useCopy(COPY);
  const [filter, setFilter] = useState<ChildFilter>("all");
  const sorted = newestFirst(list);
  const compact = sorted.length >= COMPACT_FROM;
  const shown = compact ? applyFilter(sorted, filter) : sorted;
  return (
    <div className={className}>
      {compact && (
        <div role="group" aria-label={c.filterLabel} className="mb-3 flex flex-wrap gap-2">
          {CHILD_FILTERS.map((f) => {
            const n = applyFilter(sorted, f).length;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-foreground shadow-[0_0_0_1px_rgb(0_0_0/0.08)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.12)]",
                )}
              >
                {c.filters[f]}
                <span className="tabular-nums opacity-75">{n}</span>
              </button>
            );
          })}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {c.none}
        </p>
      ) : (
        <ul className={compact ? "space-y-2" : "grid gap-4 lg:grid-cols-2"}>
          {shown.map((s, i) => (
            <ChildCard key={s.id} s={s} compact={compact} fetchLedger={i < LEDGER_CARDS} />
          ))}
        </ul>
      )}
    </div>
  );
}

const EMPTY = defineCopy("components/sponsorship/NoSponsorships", {
  ar: {
    title: "لم تبدأ أيّ كفالة بعد",
    text: "اختر ملفاً موثّقاً وابدأ كفالتك الأولى، أو ادعم مجموعةً أو منطقة.",
    pendingTitle: "لا كفالة جارية بعد",
    pendingText: "حين يُؤكَّد دفع الكفالة في «يحتاج إجراءك» تظهر هنا بخطّها وأثرها.",
    browse: "تصفّح الملفات",
    ready: "ملفّاتٌ موثّقة تقبل كفالةً جديدة الآن.",
  },
  en: {
    title: "You haven't started a sponsorship yet",
    text: "Choose a verified file and start your first sponsorship, or support a group or a region.",
    pendingTitle: "No ongoing sponsorship yet",
    pendingText:
      "Once the payment under “Needs your action” is confirmed, the sponsorship appears here with its steps and impact.",
    browse: "Browse files",
    ready: "Verified files that accept a new sponsorship now.",
  },
});

/** no file to exclude: the suggestion only needs a valid id that matches no child */
const NO_CHILD = "00000000-0000-0000-0000-000000000000";

/**
 * لا كفالة بعد: حالةٌ فارغة واضحة (غير حالة التعذّر)، ومعها حتى ثلاثة أطفالٍ جاهزين يقبلون
 * كفالةً جديدة (`golden_accepts_new_support`، عبر `sponsor.readySimilar`).
 */
export function NoSponsorships({
  pendingOnly = false,
  browseTo = "/orphans",
  amount = 50,
}: {
  pendingOnly?: boolean;
  browseTo?: string;
  amount?: number;
}) {
  const c = useCopy(EMPTY);
  return (
    <div className="space-y-6">
      <EmptyState
        title={pendingOnly ? c.pendingTitle : c.title}
        text={pendingOnly ? c.pendingText : c.text}
        action={
          <Button asChild className="min-h-11">
            <Link to={browseTo as "/"}>{c.browse}</Link>
          </Button>
        }
      />
      {!pendingOnly && <SimilarReadyChildren orphanId={NO_CHILD} amount={amount} lead={c.ready} />}
    </div>
  );
}
