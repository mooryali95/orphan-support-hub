import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { MyPledges } from "@/components/support/MyPledges";
import { TrialProposalCard } from "@/components/try/TrialProposal";
import { MyJourney } from "@/components/support/MyJourney";
import { FollowedChildren } from "@/components/support/FollowedChildren";
import { DashboardShell } from "@/components/DashboardShell";
import { ImpactPanel } from "@/components/impact/ImpactPanel";
import { SuggestionsPanel } from "@/components/matching/SuggestionsPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { MuralImage, registerFor } from "@/components/brand/MuralImage";
import { listMySponsorships, type MySponsorship } from "@/lib/sponsorships.functions";
import { SponsorshipControls } from "@/components/sponsorship/SponsorshipControls";
import { startCheckout, getPaymentMode } from "@/lib/payments.functions";
import {
  formatDate,
  formatMoney,
  formatMoneyTotals,
  fundingPercent,
  SPONSORSHIP_STATUS_LABELS,
  totalsByCurrency,
} from "@/lib/format";
import { BRAND, pageTitle } from "@/config/brand";
import { StatTile } from "@/components/kit/StatTile";
import { EmptyState } from "@/components/kit/EmptyState";
import { CelebrateOverlay } from "@/components/kit/Celebrate";
import { PaymentLookup } from "@/components/sponsorship/PaymentLookup";
import { Skeleton } from "@/components/ui/skeleton";
import { Name } from "@/components/kit/Name";
import { MilestonesCard } from "@/components/impact/MilestonesCard";
import { MyEvidence } from "@/components/impact/MyEvidence";
import { MyImpactHero } from "@/components/impact/MyImpactHero";
import { myImpact } from "@/lib/my-impact";

export const Route = createFileRoute("/_authenticated/dashboard")({
  // العودة من الدفع: ?payment=done — تُحتفى مرّةً ثم تُزال من الرابط.
  // والعودة بلا دفع: ?payment=cancelled — يُقال إن الكفالة ما زالت تنتظر، ثم تُزال كذلك.
  validateSearch: (raw: Record<string, unknown>): { payment?: "done" | "cancelled" } => {
    const p = raw["payment"];
    return p === "done" || p === "cancelled" ? { payment: p } : {};
  },
  head: () => ({
    meta: [
      { title: pageTitle("كفالاتي") },
      {
        name: "description",
        content: BRAND.description,
      },
      { property: "og:title", content: pageTitle("كفالاتي") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        property: "og:description",
        content: BRAND.description,
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { payment } = Route.useSearch();
  const navigate = Route.useNavigate();
  const fetchList = useServerFn(listMySponsorships);
  const pay = useServerFn(startCheckout);
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
        toast.error(res.error ?? "تعذّر بدء الدفع");
        return;
      }
      // التحويل اليدوي صفحة داخلية، وبوابة الدفع عنوان خارجي.
      window.location.href = res.checkoutUrl;
    } catch {
      toast.error("حدث خطأ غير متوقع");
    } finally {
      setPaying(null);
    }
  }

  const pending = sponsorships.filter((s) => s.status === "pending_payment");
  const others = sponsorships.filter((s) => s.status !== "pending_payment");
  const ready = !isLoading && !listFailed;

  return (
    <DashboardShell title="أثري" description="أثر كفالاتك، ومتابعة كلّ كفالة وحالة كلّ ملف.">
      {payment === "done" && (
        <CelebrateOverlay
          title="بدأت كفالتك"
          text="وصل دفعك، ويتأكّد خلال دقائق. ثم ترى كل شهرٍ في «كفالاتي»: متى حُوِّل المبلغ للجهة، ومتى وصل الطفلَ بمستند، وما تغيّر في رحلته."
          action="إلى كفالاتي"
          onClose={() => void navigate({ search: {}, replace: true, resetScroll: false })}
        />
      )}

      {payment === "cancelled" && (
        // عاد من بوابة الدفع بلا إتمام: لا يُترك أمام لوحةٍ صامتة يتساءل هل خُصم شيء.
        <div
          role="status"
          className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-bridge/40 bg-bridge/8 p-4 text-sm leading-7"
        >
          <p className="min-w-0 flex-1">
            <strong>لم يكتمل الدفع، ولم يُخصم شيء.</strong> كفالتك محفوظة تنتظر الدفع في «يحتاج
            إجراءك» أدناه، وتكملها متى شئت.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void navigate({ search: {}, replace: true, resetScroll: false })}
          >
            فهمت
          </Button>
        </div>
      )}

      {/* ما اختاره في الرحلة الافتراضية: مقترحٌ من متصفّحه، يؤكّده هو في موضعه الحقيقي. لا يُنشأ عنه شيء. */}
      <TrialProposalCard className="mb-8" />

      {/* 0. «أثري»: الصورة الشخصية من كفالاتك أنت، والباب إلى الوضع الغامر. */}
      {!listFailed && <MyImpactHero impact={myImpact(sponsorships)} loading={isLoading} />}
      {/* المحطّات: لمن له كفالةٌ واحدة على الأقل، بما تحقّق فعلاً. */}
      {!listFailed && !isLoading && sponsorships.length > 0 && (
        <>
          {/* الأثر الموثّق: ما اكتمل، وحصّتك من حاجة كلّ طفل، وسجلّ الأشهر بمستنداتها. */}
          <MyEvidence
            impact={myImpact(sponsorships)}
            sponsorshipIds={sponsorships
              .filter((s) => s.orphan && s.status !== "pending_payment")
              .map((s) => s.id)}
          />
          <MilestonesCard impact={myImpact(sponsorships)} className="mt-6" />
        </>
      )}

      {/* 1. الخلاصة أوّلاً (UI-05): ثلاثة أرقام، بهيكلٍ بارتفاعها أثناء التحميل فلا يقفز ما تحتها. */}
      {!listFailed && (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatTile label="عدد الكفالات" value={String(sponsorships.length)} loading={isLoading} />
          <StatTile
            label="الكفالات النشطة"
            value={String(sponsorships.filter((s) => s.status === "active").length)}
            loading={isLoading}
          />
          <StatTile
            label="التزامك الشهري"
            value={formatMoneyTotals(activeTotals, fallbackCurrency)}
            loading={isLoading}
            className="col-span-2 sm:col-span-1"
          />
        </div>
      )}

      {/* 2. ما يحتاج إجراءك (UX-12): الكفالة التي تنتظر الدفع لا تُدفن تحت الخطّ الزمني. */}
      {ready && pending.length > 0 && (
        <section
          aria-labelledby="needs-action"
          className="mt-8 rounded-2xl border border-bridge/40 bg-bridge/8 p-5"
        >
          <h2 id="needs-action" className="text-xl font-bold">
            يحتاج إجراءك
          </h2>
          <p className="mt-1 text-sm leading-7 text-muted-foreground">
            {mode?.online
              ? "أكمل الدفع لتبدأ الكفالة؛ لا يُعلَن الطفل مكفولاً قبل تأكيده."
              : "تُستكمل الكفالة بتحويلٍ بنكي تؤكّده الإدارة، وتُفعّل فور تأكيد الاستلام."}
          </p>
          {mode?.onHold && (
            // التعليق يُشرَح لا يُخفى: زرّ لا يعمل بلا سبب معلن يُفسَّر عطلاً،
            // والكافل الذي يظنّ المنصة معطوبة لا يعود.
            <p className="mt-3 text-sm leading-7">
              <strong>التحصيل الإلكتروني موقوف مؤقتاً.</strong> {mode.holdReason}
            </p>
          )}
          <ul className="mt-4 space-y-3">
            {pending.map((s) => {
              const orphan = orphanOf(s);
              return (
                <li
                  key={s.id}
                  className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] sm:flex-row sm:items-center"
                >
                  <div className="flex-1">
                    <p className="font-bold">
                      <Name>{orphan?.display_name ?? "ملف محذوف"}</Name>
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {formatMoney(s.amount, s.currency)}{" "}
                      {s.type === "monthly" ? "شهرياً" : "لمرة واحدة"} — طُلبت{" "}
                      {formatDate(s.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => onPay(s.id)} disabled={paying === s.id}>
                      {paying === s.id && <Loader2 className="size-4 animate-spin" />}
                      {mode?.online ? "أكمل الدفع" : "تعليمات التحويل"}
                    </Button>
                    {orphan && (
                      <Button asChild variant="outline">
                        <Link to="/orphans/$orphanId" params={{ orphanId: orphan.id }}>
                          الملف
                        </Link>
                      </Button>
                    )}
                    <SponsorshipControls s={s} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {ready && mode?.onHold && pending.length === 0 && (
        <p className="mt-6 rounded-2xl border border-bridge/30 bg-bridge/8 p-4 text-sm leading-7 text-foreground">
          <strong>التحصيل الإلكتروني موقوف مؤقتاً.</strong> {mode.holdReason} وحتى ذلك الحين تُستكمل
          الكفالة بتحويل بنكي تؤكّده الإدارة، وتُفعّل فور تأكيد الاستلام.
        </p>
      )}

      {/* من يليهم: الترشيح قريبٌ من الأعلى بعد ما يحتاج إجراءك، فيُرى دون تمرير
          طويل؛ ويبقى بعد الخلاصة فلا يسبق الاطمئنان على من تكفلهم. */}
      {ready && (
        <div className="mt-10">
          <SuggestionsPanel />
        </div>
      )}

      {/* 3. الكفالات، و«رحلتي» بجوارها مختصرةً بالأحدث. */}
      <div className="reveal-scroll mt-10 grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="my-sponsorships">
          <h2 id="my-sponsorships" className="text-xl font-bold">
            كفالاتك
          </h2>
          <div className="mt-4 space-y-4">
            {isLoading ? (
              // هيكلٌ بأبعاد البطاقة (UI-17): لا دوّارة وسط فراغ.
              Array.from({ length: 2 }, (_, i) => (
                <div
                  key={i}
                  className="flex gap-4 rounded-2xl border border-border bg-card p-5"
                  aria-hidden="true"
                >
                  <Skeleton className="size-16 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-2 w-full max-w-sm" />
                  </div>
                </div>
              ))
            ) : listFailed ? (
              <div
                role="alert"
                className="space-y-3 rounded-2xl border border-border bg-card p-8 text-center"
              >
                <p className="text-destructive">تعذّر تحميل كفالاتك. يرجى إعادة المحاولة.</p>
                <Button variant="outline" onClick={() => void refetch()}>
                  إعادة المحاولة
                </Button>
              </div>
            ) : others.length === 0 ? (
              <EmptyState
                title={pending.length > 0 ? "لا كفالة جارية بعد" : "لم تبدأ أي كفالة بعد"}
                text={
                  pending.length > 0
                    ? "حين يُؤكَّد دفع الكفالة أعلاه تظهر هنا بجدولها وأثرها."
                    : "اختر ملفاً معتمداً من الدليل وابدأ كفالتك الأولى، أو ادعم مجموعةً أو منطقة."
                }
                action={
                  <Button asChild>
                    <Link to="/orphans">تصفّح الملفات</Link>
                  </Button>
                }
              />
            ) : (
              others.map((s) => {
                const orphan = orphanOf(s);
                const percent = orphan
                  ? fundingPercent(orphan.monthly_need, orphan.funded_monthly)
                  : 0;

                return (
                  <article key={s.id} className="rounded-2xl border border-border bg-card p-5 lift">
                    {/* الصورة والنصّ مجموعةٌ واحدة، والأزرار بعدها: إن لم تتّسع لها السطر (موقوفة: أربعة
                        أزرار، أو اسمٌ طويل) نزلت سطراً بدل أن تعصر الاسم كلمةً كلمة */}
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex min-w-0 flex-1 basis-full items-center gap-4 sm:basis-auto">
                        <MuralImage
                          photoUrl={null}
                          displayName={orphan?.display_name ?? "ملف محذوف"}
                          register={registerFor("", percent)}
                          className="size-16 shrink-0 rounded-xl bg-secondary"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-bold">
                              <Name>{orphan?.display_name ?? "ملف محذوف"}</Name>
                            </h3>
                            <Badge variant={s.status === "active" ? "default" : "secondary"}>
                              {SPONSORSHIP_STATUS_LABELS[s.status] ?? s.status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatMoney(s.amount, s.currency)}{" "}
                            {s.type === "monthly" ? "شهرياً" : "لمرة واحدة"} — بدأت{" "}
                            {formatDate(s.started_at ?? s.created_at)}
                          </p>
                          <LifecycleNote s={s} />
                          {orphan && (
                            <CrossingProgress percent={percent} className="mt-3 max-w-sm" />
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button asChild size="sm">
                          <Link to="/sponsorships/$sponsorshipId" params={{ sponsorshipId: s.id }}>
                            الجدول والتفاصيل
                          </Link>
                        </Button>
                        {orphan && (
                          <Button asChild variant="outline" size="sm">
                            <Link to="/orphans/$orphanId" params={{ orphanId: orphan.id }}>
                              الملف
                            </Link>
                          </Button>
                        )}
                        <SponsorshipControls s={s} />
                      </div>
                    </div>

                    {/* الأثر تحت كل كفالة لا في صفحة منفصلة: الكافل يفتح
                        لوحته ليطمئنّ، فإن لزمته نقرة أخرى لم يطمئنّ. */}
                    {orphan && (
                      <details className="group mt-4">
                        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-bold text-primary">
                          <span className="group-open:hidden">عرض الأثر والتقارير</span>
                          <span className="hidden group-open:inline">إخفاء الأثر</span>
                        </summary>
                        <ImpactPanel orphanId={orphan.id} orphanName={orphan.display_name} />
                      </details>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </section>

        <MyJourney limit={5} className="mt-0" />
      </div>

      {/* 4. ما يُرجع إليه أحياناً: من تتابعهم، والدعم العيني، والبحث عن دفعة، ثم الترشيح. */}
      <div className="mt-12">
        <FollowedChildren />
        <MyPledges />
        <PaymentLookup />
      </div>
    </DashboardShell>
  );
}

/** ما سيحدث للكفالة، بتاريخه — لا حالةٌ مبهمة. */
function LifecycleNote({ s }: { s: MySponsorship }) {
  const text =
    s.cancel_effective_at && (s.status === "active" || s.status === "paused")
      ? `تنتهي في ${formatDate(s.cancel_effective_at)} بعد آخر شهرٍ مدفوع، ولا يُحصَّل منك شيءٌ بعدها.`
      : s.status === "paused" && s.paused_until
        ? `موقوفة مؤقّتاً بطلبك — تُستأنف تلقائياً في ${formatDate(s.paused_until)}.`
        : s.status === "paused"
          ? "أوقف مزوّد الدفع التحصيل مؤقّتاً."
          : s.status === "completed" && s.end_reason === "child_exit"
            ? `انتهت في ${formatDate(s.ended_at)} لأن الطفل غادر البرنامج — راجع إشعاراتك للتفاصيل.`
            : s.status === "cancelled" && s.ended_at
              ? `انتهت في ${formatDate(s.ended_at)}.`
              : null;
  return text ? <p className="mt-1 text-sm leading-7 text-bridge-ink">{text}</p> : null;
}

type SponsorshipOrphan = {
  id: string;
  display_name: string;
  code: string;
  monthly_need: number | string;
  funded_monthly: number | string;
} | null;

function orphanOf(s: { orphan: unknown }): SponsorshipOrphan {
  return s.orphan as SponsorshipOrphan;
}
