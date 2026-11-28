import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Clock, FileText, Printer, ShieldCheck } from "lucide-react";

import { MuralImage, registerFor } from "@/components/brand/MuralImage";
import { Name } from "@/components/kit/Name";
import { usePublicVerification } from "@/components/orphans/public-verification";
import { VerificationBadge } from "@/components/orphans/VerificationBadge";
import { OrphanProfilePanel } from "@/components/profile/OrphanProfilePanel";
import { ChildUpdates } from "@/components/sponsorship/ChildUpdates";
import { useLedger } from "@/components/sponsorship/ledger-query";
import { ManageSponsorshipLink } from "@/components/sponsorship/ManageSponsorship";
import { QualificationJourney } from "@/components/sponsorship/QualificationJourney";
import { useStatusLabel } from "@/components/sponsorship/status-copy";
import { SponsorshipJourney } from "@/components/sponsorship/SponsorshipJourney";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { useDemo } from "@/lib/demo-mode";
import { formatDate, formatMoney, fundingPercent } from "@/lib/format";
import { listReports } from "@/lib/impact.functions";
import type { SponsorshipLedger } from "@/lib/ledger.functions";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { startCheckout } from "@/lib/payments.functions";
import {
  getSponsorQualification,
  learnedByMonth,
  type SponsorQualification,
} from "@/lib/scopes.functions";
import { deliveredShare } from "@/lib/sponsor-center";
import { listMySponsorships, type MySponsorship } from "@/lib/sponsorships.functions";
import { TRIAL_ENABLED, trialRoute } from "@/lib/trial-gate";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/sponsorship/SponsorshipChildPage", {
  ar: {
    actionsNav: "إجراءات الكفالة",
    loadFailed: "تعذّر تحميل الكفالة.",
    back: "العودة إلى أثري",
    since: (date: string) => `تكفله منذ ${date}`,
    monthly: (amount: string) => `${amount} شهرياً`,
    once: (amount: string) => `${amount} لمرّة واحدة`,
    file: (code: string) => `ملفّ ${code}`,
    noPhoto: "لم تُعرض الصورة حمايةً لخصوصية الطفل.",
    underReview:
      "هذا الملفّ قيد مراجعةٍ دورية. كفالتك مستمرّة، والكفالات الجديدة متوقّفة حتى تنتهي المراجعة.",
    trustTitle: "ما تعنيه شارة الملف",
    trust: {
      two_sources: "موثّق من مصدرين: طابقت المنصّة بيانات الملف بين الندوة ومكتبها في الدولة.",
      primary_source: "موثّق من الندوة: طابقت المنصّة بيانات الملف مع سجلّ الندوة.",
      under_review: "قيد التحقق: يُراجَع الملف قبل أن يستقبل كفالةً جديدة.",
    },
    trustNote: "الشارة درجةٌ وشهر فقط، ولا تذكر تفاصيل من الملف.",
    evidence: (delivered: number, paid: number) =>
      `${delivered} من ${paid} من الأشهر المدفوعة أُكِّد وصولها بمستند`,
    evidenceAll: (paid: number) => `الأشهر المدفوعة كلّها (${paid}) أُكِّد وصولها بمستند`,
    evidenceNone: "لم يُدفع شهرٌ بعد.",
    next: (amount: string, date: string) => `الدفعة القادمة ${amount} في ${date}`,
    message: {
      none: "لم ترسل رسالةً بعد",
      pending: "رسالتك قيد المراجعة",
      approved: "وصلت رسالتك الجهة الميدانية",
      rejected: "لم تُعتمد رسالتك، حمايةً للطفل",
    } as Record<SponsorshipLedger["sponsorship"]["message_status"], string>,
    messageLabel: "رسالتك للطفل",
    payFailed: "تعذّر بدء الدفع",
    report: "التقرير السنوي للطباعة",
    statement: "سجلّ التبرّعات",
    childFile: "ملفّ الطفل",
  },
  en: {
    actionsNav: "Sponsorship actions",
    loadFailed: "The sponsorship couldn't load.",
    back: "Back to my impact",
    since: (date: string) => `Sponsoring since ${date}`,
    monthly: (amount: string) => `${amount} monthly`,
    once: (amount: string) => `${amount} once`,
    file: (code: string) => `File ${code}`,
    noPhoto: "Photo not shared to protect the child's privacy.",
    underReview:
      "This file is under routine review. Your sponsorship continues; new sponsorships are paused until review ends.",
    trustTitle: "What the file badge means",
    trust: {
      two_sources:
        "Verified by two sources: the platform matched this file between WAMY and its country office.",
      primary_source: "Verified by WAMY: the platform matched this file against WAMY's record.",
      under_review: "Under verification: the file is reviewed before it takes a new sponsorship.",
    },
    trustNote: "The badge is a level and a month only, with no details from the file.",
    evidence: (delivered: number, paid: number) =>
      `${delivered} of ${paid} paid months confirmed delivered with a document`,
    evidenceAll: (paid: number) => `All ${paid} paid months confirmed delivered with a document`,
    evidenceNone: "No month has been paid yet.",
    next: (amount: string, date: string) => `Next payment ${amount} on ${date}`,
    message: {
      none: "You haven't sent a message yet",
      pending: "Your message is under review",
      approved: "Your message reached the field organization",
      rejected: "Your message was not approved, to protect the child",
    } as Record<SponsorshipLedger["sponsorship"]["message_status"], string>,
    messageLabel: "Your message to the child",
    payFailed: "Couldn't start the payment",
    report: "Printable yearly report",
    statement: "Record of donations",
    childFile: "Child's file",
  },
});

/**
 * صفحة الطفل للكافل — البيت الواحد لرحلته: الرأس (صورةٌ مأذونة أو رسمٌ بدلها، الاسم،
 * الشارة، منذ متى)، ثم خطّ الرحلة الموحّد، ثم محطّات التأهيل، ثم الملف بأعمدته المأذونة.
 * كلّ قراءةٍ عبر منفذ البيانات، فتعمل الصفحة نفسها في التجربة ببيانات نموذجية.
 * لا يُعرض سبب مراجعةٍ ولا قيمة حقل: الشارة درجةٌ وشهر فقط (`public_verification`).
 */
export function SponsorshipChildPage({ sponsorshipId }: { sponsorshipId: string }) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const demo = useDemo();
  const statusLabel = useStatusLabel();
  const { data, isPending } = useLedger(sponsorshipId);
  const l = data?.ledger ?? null;
  const orphanId = l?.orphan.id;

  const fetchQualification = useDataFn("sponsor.qualification", getSponsorQualification);
  const { data: qRaw } = useQuery({
    queryKey: useDataKey(["sponsor-qualification", orphanId]),
    queryFn: () => fetchQualification({ data: { orphanId: orphanId! } }),
    enabled: !!orphanId,
  });
  const fetchReports = useDataFn("impact.reports", listReports);
  const { data: rep } = useQuery({
    queryKey: useDataKey(["reports", orphanId]),
    queryFn: () => fetchReports({ data: { orphanId: orphanId! } }),
    enabled: !!orphanId,
  });
  // الكفالة كما في القائمة: حاجة الطفل وتمويله لشريط العبور (أعمدةٌ عامّة)
  const fetchList = useDataFn("sponsor.manage.list", listMySponsorships);
  const { data: list } = useQuery({
    queryKey: useDataKey(["my-sponsorships"]),
    queryFn: () => fetchList(),
  });
  const s: MySponsorship | undefined = list?.sponsorships.find((x) => x.id === sponsorshipId);
  const { data: verification } = usePublicVerification(orphanId ?? "");

  const pay = useDataFn("sponsor.pay", startCheckout);
  const [paying, setPaying] = useState(false);
  async function onPay() {
    setPaying(true);
    try {
      const res = await pay({ data: { sponsorshipId } });
      if (!res.ok) return void toast.error(res.error ?? c.payFailed);
      window.location.href = res.checkoutUrl;
    } catch {
      toast.error(c.payFailed);
    } finally {
      setPaying(false);
    }
  }

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="flex items-center gap-4">
          <Skeleton className="size-20 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }
  if (!l) {
    return (
      <div role="alert" className="rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="text-sm font-normal text-muted-foreground">{c.loadFailed}</h1>
        <Button asChild variant="outline" className="mt-3">
          <Link to={demo ? trialRoute("/try/impact") : "/dashboard"}>{c.back}</Link>
        </Button>
      </div>
    );
  }

  const sp = l.sponsorship;
  const qualification = qRaw ? (JSON.parse(qRaw) as SponsorQualification) : undefined;
  const reports = (rep?.reports ?? [])
    .filter((r) => r.status === "approved")
    .map((r) => ({ id: r.id, period: r.period, published_at: r.published_at }));
  const share = deliveredShare(l.totals);
  const money = formatMoney(sp.amount, sp.currency, locale);
  const percent = s?.orphan ? fundingPercent(s.orphan.monthly_need, s.orphan.funded_monthly) : 0;
  const statementYear = new Date().getUTCFullYear();

  return (
    <div className="space-y-8">
      {/* 1. الرأس */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <figure className="shrink-0">
          <MuralImage
            photoUrl={null}
            displayName={l.orphan.display_name}
            register={registerFor("", percent)}
            className="size-20 rounded-2xl bg-secondary"
          />
          <figcaption className="mt-1 max-w-40 text-xs leading-5 text-muted-foreground sm:max-w-24">
            {c.noPhoto}
          </figcaption>
        </figure>
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl leading-tight font-bold text-balance">
            <Name>{l.orphan.display_name}</Name>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={sp.status === "active" ? "default" : "secondary"}>
              {statusLabel(sp.status)}
            </Badge>
            <VerificationBadge orphanId={l.orphan.id} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground tabular-nums">
            {sp.type === "monthly" ? c.monthly(money) : c.once(money)} ·{" "}
            <bdi>{c.file(l.orphan.code)}</bdi>
            {sp.started_at && <> · {c.since(formatDate(sp.started_at, locale))}</>}
          </p>
        </div>
        {/* the one action a sponsor comes back for sits beside the status, not after the timeline */}
        {s && (
          <div className="shrink-0 sm:self-start">
            <ManageSponsorshipLink s={s} />
          </div>
        )}
      </header>

      {verification?.level === "under_review" && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-2xl border border-border bg-card p-4 text-sm leading-7"
        >
          <Clock className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {c.underReview}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <p className="rounded-2xl bg-card p-4 text-sm leading-7 font-medium tabular-nums shadow-[0_0_0_1px_rgb(0_0_0/0.06)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)]">
          {share.paid === 0
            ? c.evidenceNone
            : share.all
              ? c.evidenceAll(share.paid)
              : c.evidence(share.delivered, share.paid)}
          {sp.next_charge_at && (
            <span className="block text-xs font-normal text-muted-foreground">
              {c.next(money, formatDate(sp.next_charge_at, locale))}
            </span>
          )}
        </p>
        <p className="rounded-2xl bg-card p-4 text-sm leading-7 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)]">
          <span className="block text-xs text-muted-foreground">{c.messageLabel}</span>
          <span
            className={cn(
              "mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
              sp.message_status === "approved" && "bg-primary/10 text-primary",
              sp.message_status === "pending" && "bg-bridge/10 text-bridge-ink",
              (sp.message_status === "rejected" || sp.message_status === "none") &&
                "bg-secondary text-foreground",
            )}
          >
            {c.message[sp.message_status]}
          </span>
        </p>
      </div>

      {/* 2. خطّ الرحلة الموحّد */}
      <SponsorshipJourney
        ledger={l}
        reports={reports}
        learned={learnedByMonth(qualification)}
        onPay={onPay}
        paying={paying}
      />

      {/* تحديثات الطفل المعتمدة: صورٌ ومقاطع وملاحظات، شهراً شهراً */}
      <ChildUpdates orphanId={l.orphan.id} />

      {/* 3. محطّات التأهيل */}
      <QualificationJourney q={qualification} name={l.orphan.display_name} />

      {/* شرح الشارة بلغةٍ واضحة */}
      <details className="group rounded-2xl bg-card p-4 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)]">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          {c.trustTitle}
        </summary>
        <ul className="mt-2 space-y-1.5 text-sm leading-7 text-muted-foreground">
          <li>{c.trust.two_sources}</li>
          <li>{c.trust.primary_source}</li>
          <li>{c.trust.under_review}</li>
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{c.trustNote}</p>
      </details>

      {/* 4. الملف بأعمدته المأذونة (في المنصّة وحدها: لا ملفّ حقيقيّ في التجربة) */}
      {!demo && <OrphanProfilePanel orphanId={l.orphan.id} orphanName={l.orphan.display_name} />}

      {/* 5. روابط */}
      <nav aria-label={c.actionsNav} className="flex flex-wrap gap-2 border-t border-border pt-6">
        {(!demo || TRIAL_ENABLED) && (
          <Button asChild variant="outline" className="min-h-11">
            <Link
              {...(demo
                ? {
                    to: trialRoute(`/try/sponsorships/${encodeURIComponent(sponsorshipId)}/report`),
                  }
                : { to: "/sponsorships/$sponsorshipId/report", params: { sponsorshipId } })}
            >
              <Printer className="size-4" aria-hidden="true" />
              {c.report}
            </Link>
          </Button>
        )}
        <Button asChild variant="outline" className="min-h-11">
          <Link
            {...(demo
              ? { to: trialRoute(`/try/statements/${statementYear}`) }
              : { to: "/statements/$year", params: { year: String(statementYear) } })}
          >
            <FileText className="size-4" aria-hidden="true" />
            {c.statement}
          </Link>
        </Button>
        <Button asChild variant="ghost" className="min-h-11">
          <Link
            {...(demo
              ? { to: trialRoute(`/try/${encodeURIComponent(l.orphan.id)}`) }
              : { to: "/orphans/$orphanId", params: { orphanId: l.orphan.id } })}
          >
            {c.childFile}
          </Link>
        </Button>
      </nav>
    </div>
  );
}
