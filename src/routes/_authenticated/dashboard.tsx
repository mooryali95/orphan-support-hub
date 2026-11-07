import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { MyPledges } from "@/components/support/MyPledges";
import { MyJourney } from "@/components/support/MyJourney";
import { FollowedChildren } from "@/components/support/FollowedChildren";
import { DashboardShell } from "@/components/DashboardShell";
import { ImpactPanel } from "@/components/impact/ImpactPanel";
import { SuggestionsPanel } from "@/components/matching/SuggestionsPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { MuralImage, registerFor } from "@/components/brand/MuralImage";
import { listMySponsorships, cancelSponsorship } from "@/lib/sponsorships.functions";
import { startCheckout, getPaymentMode } from "@/lib/payments.functions";
import { formatDate, formatMoney, fundingPercent, SPONSORSHIP_STATUS_LABELS } from "@/lib/format";
import { BRAND, pageTitle } from "@/config/brand";
import { StatTile } from "@/components/kit/StatTile";
import { EmptyState } from "@/components/kit/EmptyState";
import { CelebrateOverlay } from "@/components/kit/Celebrate";
import { PaymentLookup } from "@/components/sponsorship/PaymentLookup";
import { Skeleton } from "@/components/ui/skeleton";
import { Name } from "@/components/kit/Name";

export const Route = createFileRoute("/_authenticated/dashboard")({
  // العودة من الدفع: ?payment=done — تُحتفى مرّةً ثم تُزال من الرابط.
  validateSearch: (raw: Record<string, unknown>): { payment?: "done" } =>
    raw["payment"] === "done" ? { payment: "done" } : {},
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
  const cancel = useServerFn(cancelSponsorship);
  const pay = useServerFn(startCheckout);
  const fetchMode = useServerFn(getPaymentMode);
  const [paying, setPaying] = useState<string | null>(null);

  const { data: mode } = useQuery({ queryKey: ["payment-mode"], queryFn: () => fetchMode() });
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["my-sponsorships"],
    queryFn: () => fetchList(),
  });

  const sponsorships = data?.sponsorships ?? [];
  const listFailed = isError || Boolean(data?.error);
  const activeTotal = sponsorships
    .filter((s) => s.status === "active")
    .reduce((acc, s) => acc + Number(s.amount), 0);

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

  async function onCancel(id: string) {
    const res = await cancel({ data: { id } });
    if (!res.ok) {
      toast.error(res.error ?? "تعذّر إلغاء الكفالة");
      return;
    }
    toast.success("تم إلغاء الكفالة");
    queryClient.invalidateQueries({ queryKey: ["my-sponsorships"] });
  }

  const pending = sponsorships.filter((s) => s.status === "pending_payment");
  const others = sponsorships.filter((s) => s.status !== "pending_payment");
  const ready = !isLoading && !listFailed;

  return (
    <DashboardShell title="كفالاتي" description="متابعة كفالاتك الشهرية وحالة كل ملف.">
      {payment === "done" && (
        <CelebrateOverlay
          title="بدأت كفالتك"
          text="وصل دفعك، ويتأكّد خلال دقائق. ثم ترى كل شهرٍ في «كفالاتي»: متى حُوِّل المبلغ للجهة، ومتى وصل الطفلَ بمستند، وما تغيّر في رحلته."
          action="إلى كفالاتي"
          onClose={() => void navigate({ search: {}, replace: true, resetScroll: false })}
        />
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
            value={formatMoney(activeTotal)}
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
                    <Button variant="ghost" onClick={() => onCancel(s.id)}>
                      إلغاء
                    </Button>
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

      {/* 3. الكفالات، و«رحلتي» بجوارها مختصرةً بالأحدث. */}
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
                  <article key={s.id} className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
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
                          {formatDate(s.created_at)}
                        </p>
                        {orphan && <CrossingProgress percent={percent} className="mt-3 max-w-sm" />}
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
                        {s.status === "active" && (
                          <Button variant="ghost" size="sm" onClick={() => onCancel(s.id)}>
                            إلغاء
                          </Button>
                        )}
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

      {/* الترشيح بعد الكفالات لا قبلها: اللوحة تُفتح للاطمئنان على من
          تكفلهم، ثم يُعرض من يليهم. */}
      <div className="mt-12 border-t border-border pt-8">
        <SuggestionsPanel />
      </div>
    </DashboardShell>
  );
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
