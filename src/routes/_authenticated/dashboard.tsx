import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText } from "lucide-react";

import { MyPledges } from "@/components/support/MyPledges";
import { MyPledgeImpact } from "@/components/support/MyPledgeImpact";
import { getMyPledges } from "@/lib/support.functions";
import { trialSlots } from "@/lib/trial-slots";
import { MyJourney } from "@/components/support/MyJourney";
import { FollowedChildren } from "@/components/support/FollowedChildren";
import { DashboardShell } from "@/components/DashboardShell";
import { SuggestionsPanel } from "@/components/matching/SuggestionsPanel";
import { Button } from "@/components/ui/button";
import { listMySponsorships } from "@/lib/sponsorships.functions";
import { ActionStrip } from "@/components/sponsorship/ActionStrip";
import { ChildCards, NoSponsorships } from "@/components/sponsorship/ChildCard";
import { startCheckout, getPaymentMode } from "@/lib/payments.functions";
import { formatMoneyTotals, totalsByCurrency } from "@/lib/format";
import { brandFor, pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
import { useDataFn } from "@/lib/data-port";
import { CelebrateOverlay } from "@/components/kit/Celebrate";
import { PaymentLookup } from "@/components/sponsorship/PaymentLookup";
import { Skeleton } from "@/components/ui/skeleton";
import { MilestonesCard } from "@/components/impact/MilestonesCard";
import { MyEvidence } from "@/components/impact/MyEvidence";
import { MyImpactHero } from "@/components/impact/MyImpactHero";
import { myImpact } from "@/lib/my-impact";

const COPY = defineCopy("routes/_authenticated/dashboard", {
  ar: {
    pageTitle: "كفالاتي",
    title: "أثري",
    description: "كيف حال من تكفلهم، وهل وصل عطاؤك — ثم أثرك كلّه.",
    payFailed: "تعذّر بدء الدفع",
    unexpected: "حدث خطأ غير متوقع",
    celebrateTitle: "بدأت كفالتك",
    celebrateText:
      "وصل دفعك، ويتأكّد خلال دقائق. ثم ترى كل شهرٍ في «كفالاتي»: متى حُوِّل المبلغ للجهة، ومتى وصل الطفلَ بمستند، وما تغيّر في رحلته.",
    celebrateAction: "إلى كفالاتي",
    cancelledLead: "لم يكتمل الدفع، ولم يُخصم شيء.",
    cancelledText: "كفالتك محفوظة تنتظر الدفع في «يحتاج إجراءك» أدناه، وتكملها متى شئت.",
    gotIt: "فهمت",
    needsOnline: "أكمل الدفع لتبدأ الكفالة؛ لا يُعلَن الطفل مكفولاً قبل تأكيده.",
    needsTransfer: "تُستكمل الكفالة بتحويلٍ بنكي تؤكّده الإدارة، وتُفعّل فور تأكيد الاستلام.",
    onHold: "التحصيل الإلكتروني موقوف مؤقتاً.",
    onHoldUntil:
      "وحتى ذلك الحين تُستكمل الكفالة بتحويل بنكي تؤكّده الإدارة، وتُفعّل فور تأكيد الاستلام.",
    completePayment: "أكمل الدفع",
    transferSteps: "تعليمات التحويل",
    myChildren: "أطفالي",
    commitment: (amounts: string) => `التزامك الشهري: ${amounts}`,
    loadFailed: "تعذّر تحميل كفالاتك. هذا خللٌ في التحميل، لا قائمةٌ فارغة.",
    retry: "إعادة المحاولة",
    more: "المزيد",
    statement: "سجلّ التبرّعات",
    statementHint: "كلّ ما دفعته في السنة، بكلّ عملةٍ وحدها، للطباعة أو الحفظ.",
  },
  en: {
    pageTitle: "My sponsorships",
    title: "My impact",
    description:
      "How the children you sponsor are doing, and whether your giving arrived — then your whole impact.",
    payFailed: "Couldn't start the payment",
    unexpected: "Something went wrong",
    celebrateTitle: "Your sponsorship has begun",
    celebrateText:
      'Your payment arrived and will be confirmed within minutes. Then each month you\'ll see in "My sponsorships" when the amount was sent to the field organization, when it reached the child with a document, and what changed in their journey.',
    celebrateAction: "Go to my sponsorships",
    cancelledLead: "The payment wasn't completed, and nothing was charged.",
    cancelledText:
      'Your sponsorship is saved and waits for payment under "Needs your action" below. Complete it whenever you like.',
    gotIt: "Got it",
    needsOnline:
      "Complete the payment to start the sponsorship; the child isn't shown as sponsored until it's confirmed.",
    needsTransfer:
      "The sponsorship is completed by a bank transfer that the administration confirms, and starts as soon as receipt is confirmed.",
    onHold: "Online payment is paused for now.",
    onHoldUntil:
      "Until then, sponsorships are completed by a bank transfer that the administration confirms, and start as soon as receipt is confirmed.",
    completePayment: "Complete payment",
    transferSteps: "Transfer instructions",
    myChildren: "My children",
    commitment: (amounts: string) => `Your monthly commitment: ${amounts}`,
    loadFailed: "Your sponsorships couldn't load. This is a loading problem, not an empty list.",
    retry: "Try again",
    more: "More",
    statement: "Record of donations",
    statementHint: "Everything you paid in the year, each currency on its own, to print or save.",
  },
});

/** من التجربة إن وُجدت (`@/lib/trial-slots`) */
const ProposalCard = trialSlots?.ProposalCard;

export const Route = createFileRoute("/_authenticated/dashboard")({
  // العودة من الدفع: ?payment=done — تُحتفى مرّةً ثم تُزال من الرابط.
  // والعودة بلا دفع: ?payment=cancelled — يُقال إن الكفالة ما زالت تنتظر، ثم تُزال كذلك.
  validateSearch: (raw: Record<string, unknown>): { payment?: "done" | "cancelled" } => {
    const p = raw["payment"];
    return p === "done" || p === "cancelled" ? { payment: p } : {};
  },
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const title = pageTitle(copyOf(COPY, l).pageTitle, true, l);
    const description = brandFor(l).description;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { property: "og:description", content: description },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: DashboardPage,
});

/**
 * «أثري» — الشاشة الأولى تجيب سؤالي الكافل قبل أيّ مجموع: كيف حال من أكفله، وهل وصل
 * عطائي. فالترتيب: ما يحتاج إجراءك (إن وُجد)، ثم أطفالي ببطاقاتهم وخطّ طرد الشهر، ثم الأثر
 * في بطاقةٍ واحدة، ثم التعهّدات، ثم «المزيد».
 */
function DashboardPage() {
  const { payment } = Route.useSearch();
  const navigate = Route.useNavigate();
  const c = useCopy(COPY);
  const locale = useLocale();
  // the hall reads the very same list with the same key (hall/source.test.ts): one source
  const fetchList = useServerFn(listMySponsorships);
  const pay = useDataFn("sponsor.pay", startCheckout);
  const fetchMode = useServerFn(getPaymentMode);
  const [paying, setPaying] = useState<string | null>(null);

  const { data: mode } = useQuery({ queryKey: ["payment-mode"], queryFn: () => fetchMode() });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["my-sponsorships"],
    queryFn: () => fetchList(),
  });

  const sponsorships = data?.sponsorships ?? [];
  const listFailed = isError || Boolean(data?.error);
  // بعملة كل كفالة: €40 + €60 لا تُكتب «$ 100»، ولا يُجمع يورو مع دولار.
  const activeTotals = totalsByCurrency(
    sponsorships.filter((s) => s.status === "active" && !s.cancel_effective_at),
  );
  const fallbackCurrency = sponsorships[0]?.currency ?? "EUR";

  async function onPay(id: string) {
    setPaying(id);
    try {
      const res = await pay({ data: { sponsorshipId: id } });
      if (!res.ok) {
        toast.error(res.error ?? c.payFailed);
        return;
      }
      // التحويل اليدوي صفحة داخلية، وبوابة الدفع عنوان خارجي.
      window.location.href = res.checkoutUrl;
    } catch {
      toast.error(c.unexpected);
    } finally {
      setPaying(null);
    }
  }

  const fetchPledges = useServerFn(getMyPledges);
  const { data: pledgeRes } = useQuery({
    queryKey: ["my-pledges"],
    queryFn: () => fetchPledges(),
  });
  const pledgeCount = (pledgeRes?.pledges ?? []).filter((p) => p.status !== "cancelled").length;

  const pending = sponsorships.filter((s) => s.status === "pending_payment");
  const others = sponsorships.filter((s) => s.status !== "pending_payment");
  const ready = !isLoading && !listFailed;
  const impact = myImpact(sponsorships);
  const year = new Date().getUTCFullYear();

  return (
    <DashboardShell title={c.title} description={c.description}>
      {payment === "done" && (
        <CelebrateOverlay
          title={c.celebrateTitle}
          text={c.celebrateText}
          action={c.celebrateAction}
          onClose={() => void navigate({ search: {}, replace: true, resetScroll: false })}
        />
      )}

      {payment === "cancelled" && (
        // عاد من بوابة الدفع بلا إتمام: لا يُترك أمام لوحةٍ صامتة يتساءل هل خُصم شيء.
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-bridge/40 bg-bridge/8 p-4 text-sm leading-7"
        >
          <p className="min-w-0 flex-1">
            <strong>{c.cancelledLead}</strong> {c.cancelledText}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void navigate({ search: {}, replace: true, resetScroll: false })}
          >
            {c.gotIt}
          </Button>
        </div>
      )}

      {/* ما اختاره في الوضع التجريبي: مقترحٌ من متصفّحه، يؤكّده هو في موضعه الحقيقي. لا يُنشأ عنه شيء. */}
      {ProposalCard && <ProposalCard className="mb-6" />}

      {/* 1. ما يحتاج إجراءك — يغيب كلّه إن لم يكن شيء */}
      {ready && (
        <div className="mb-6 empty:hidden">
          <ActionStrip
            list={sponsorships}
            onPay={onPay}
            paying={paying}
            payLabel={mode?.online ? c.completePayment : c.transferSteps}
          >
            {pending.length > 0 && (
              <p className="mt-1 text-sm leading-7 text-muted-foreground">
                {mode?.online ? c.needsOnline : c.needsTransfer}
              </p>
            )}
            {mode?.onHold && (
              <p className="mt-2 text-sm leading-7">
                <strong>{c.onHold}</strong> {mode.holdReason}
              </p>
            )}
          </ActionStrip>
        </div>
      )}

      {ready && mode?.onHold && pending.length === 0 && (
        <p className="mb-6 rounded-2xl border border-bridge/30 bg-bridge/8 p-4 text-sm leading-7 text-foreground">
          <strong>{c.onHold}</strong> {mode.holdReason} {c.onHoldUntil}
        </p>
      )}

      {/* 2. أطفالي — الكتلة الأولى */}
      <section aria-labelledby="my-children">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="my-children" className="text-xl font-bold">
            {c.myChildren}
          </h2>
          {ready && activeTotals.length > 0 && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {c.commitment(formatMoneyTotals(activeTotals, fallbackCurrency, locale))}
            </p>
          )}
        </div>
        <div className="mt-4">
          {isLoading ? (
            // هيكلٌ بأبعاد البطاقة (UI-17): لا دوّارة وسط فراغ.
            <div className="grid gap-4 lg:grid-cols-2" aria-hidden="true">
              {Array.from({ length: 2 }, (_, i) => (
                <div key={i} className="flex gap-4 rounded-2xl border border-border bg-card p-5">
                  <Skeleton className="size-16 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-2 w-full max-w-sm" />
                  </div>
                </div>
              ))}
            </div>
          ) : listFailed ? (
            // تعذّر التحميل لا يشبه القائمة الفارغة أبداً: تنبيهٌ وزرّ إعادة.
            <div
              role="alert"
              className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-center"
            >
              <p className="text-destructive">{c.loadFailed}</p>
              <Button variant="outline" className="min-h-11" onClick={() => void refetch()}>
                {c.retry}
              </Button>
            </div>
          ) : others.length === 0 ? (
            <NoSponsorships pendingOnly={pending.length > 0} />
          ) : (
            <ChildCards list={others} />
          )}
        </div>
      </section>

      {/* 3. الأثر في بطاقةٍ واحدة: الأرقام الثلاثة، ومحطّاتك مطويّةً فيها */}
      {!listFailed && (
        <MyImpactHero
          impact={impact}
          loading={isLoading}
          hallSearch={{ me: 1, from: "/dashboard" }}
          {...(ready && sponsorships.length > 0
            ? { milestones: <MilestonesCard impact={impact} className="border-0 p-0 sm:p-0" /> }
            : {})}
        />
      )}
      {ready && others.length > 0 && (
        <MyEvidence
          impact={impact}
          sponsorshipIds={others.filter((s) => s.orphan).map((s) => s.id)}
        />
      )}

      {/* 4. التعهّدات — لمن له تعهّد */}
      {ready && pledgeCount > 0 && (
        <div className="mt-10">
          <MyPledges />
          <MyPledgeImpact />
        </div>
      )}

      {/* 5. المزيد */}
      <section aria-labelledby="more" className="mt-12 border-t border-border pt-8">
        <h2 id="more" className="text-xl font-bold">
          {c.more}
        </h2>
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-card p-4 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)]">
          <p className="min-w-0 flex-1 basis-56 text-sm leading-7">
            <strong className="block">{c.statement}</strong>
            <span className="text-muted-foreground">{c.statementHint}</span>
          </p>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/statements/$year" params={{ year: String(year) }}>
              <FileText className="size-4" aria-hidden="true" />
              {c.statement}
            </Link>
          </Button>
        </div>
        <MyJourney limit={5} className="mt-8" />
        <div className="mt-8">
          <FollowedChildren />
        </div>
        {ready && (
          <div className="mt-10">
            <SuggestionsPanel />
          </div>
        )}
        <div className="mt-8">
          <PaymentLookup />
        </div>
      </section>
    </DashboardShell>
  );
}
