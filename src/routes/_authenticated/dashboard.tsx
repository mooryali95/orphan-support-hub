import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, HeartHandshake } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "كفالاتي — IOCO — اكفل يتيماً بملف موثّق" },
      {
        name: "description",
        content:
          "اكفل يتيماً بملف موثّق من جهة رعاية معتمدة. منصة IOCO تربطك بيتيم حقيقي بكفالة شهرية شفافة وتقارير أثر دورية.",
      },
      { property: "og:title", content: "كفالاتي — IOCO — اكفل يتيماً بملف موثّق" },
      {
        property: "og:description",
        content:
          "اكفل يتيماً بملف موثّق من جهة رعاية معتمدة. منصة IOCO تربطك بيتيم حقيقي بكفالة شهرية شفافة وتقارير أثر دورية.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetchList = useServerFn(listMySponsorships);
  const cancel = useServerFn(cancelSponsorship);
  const pay = useServerFn(startCheckout);
  const fetchMode = useServerFn(getPaymentMode);
  const [paying, setPaying] = useState<string | null>(null);

  const { data: mode } = useQuery({ queryKey: ["payment-mode"], queryFn: () => fetchMode() });
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["my-sponsorships"],
    queryFn: () => fetchList(),
  });

  const sponsorships = data?.sponsorships ?? [];
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

  return (
    <DashboardShell title="كفالاتي" description="متابعة كفالاتك الشهرية وحالة كل ملف.">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatBox label="عدد الكفالات" value={String(sponsorships.length)} />
        <StatBox
          label="الكفالات النشطة"
          value={String(sponsorships.filter((s) => s.status === "active").length)}
        />
        <StatBox label="التزامك الشهري" value={formatMoney(activeTotal)} />
      </div>

      {mode?.onHold && (
        // التعليق يُشرَح لا يُخفى: زرّ لا يعمل بلا سبب معلن يُفسَّر عطلاً،
        // والكافل الذي يظنّ المنصة معطوبة لا يعود.
        <p className="border-bridge/30 bg-bridge/8 text-foreground mt-6 rounded-2xl border p-4 text-sm leading-7">
          <strong>التحصيل الإلكتروني موقوف مؤقتاً.</strong> {mode.holdReason} وحتى ذلك الحين تُستكمل
          الكفالة بتحويل بنكي تؤكّده الإدارة، وتُفعّل فور تأكيد الاستلام.
        </p>
      )}

      {mode &&
        !mode.online &&
        !mode.onHold &&
        sponsorships.some((s) => s.status === "pending_payment") && (
          <p className="border-bridge/30 bg-bridge/8 text-foreground mt-6 rounded-2xl border p-4 text-sm leading-7">
            الدفع الإلكتروني قيد التفعيل. حتى ذلك الحين تُستكمل الكفالة بتحويل بنكي تؤكّده الإدارة،
            وتُفعّل كفالتك فور تأكيد الاستلام.
          </p>
        )}

      <div className="mt-8 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : sponsorships.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
            <HeartHandshake className="mx-auto size-8 text-bridge" />
            <p className="mt-4 font-medium">لم تبدأ أي كفالة بعد</p>
            <p className="mt-1 text-sm text-muted-foreground">
              اختر ملفاً معتمداً من الدليل وابدأ كفالتك الأولى.
            </p>
            <Button asChild className="mt-6">
              <Link to="/orphans">تصفّح الملفات</Link>
            </Button>
          </div>
        ) : (
          sponsorships.map((s) => {
            const orphan = s.orphan as {
              id: string;
              display_name: string;
              code: string;
              city: string | null;
              photo_url: string | null;
              monthly_need: number | string;
              funded_monthly: number | string;
            } | null;
            const percent = orphan ? fundingPercent(orphan.monthly_need, orphan.funded_monthly) : 0;

            return (
              <article key={s.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <MuralImage
                    photoUrl={orphan?.photo_url ?? null}
                    displayName={orphan?.display_name ?? "ملف محذوف"}
                    register={registerFor(orphan ? "" : "", percent)}
                    className="size-16 shrink-0 rounded-xl bg-secondary"
                  />

                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold">{orphan?.display_name ?? "ملف محذوف"}</h2>
                      <Badge variant={s.status === "active" ? "default" : "secondary"}>
                        {SPONSORSHIP_STATUS_LABELS[s.status] ?? s.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatMoney(s.amount, s.currency)}{" "}
                      {s.type === "monthly" ? "شهرياً" : "لمرة واحدة"} — بدأت{" "}
                      {formatDate(s.created_at)}
                    </p>
                    {orphan && <CrossingProgress percent={percent} className="mt-3 max-w-sm" />}
                  </div>

                  <div className="flex gap-2">
                    {orphan && (
                      <Button asChild variant="outline" size="sm">
                        <Link to="/orphans/$orphanId" params={{ orphanId: orphan.id }}>
                          الملف
                        </Link>
                      </Button>
                    )}
                    {s.status === "pending_payment" && (
                      <Button size="sm" onClick={() => onPay(s.id)} disabled={paying === s.id}>
                        {paying === s.id && <Loader2 className="size-4 animate-spin" />}
                        {mode?.online ? "أكمل الدفع" : "تعليمات التحويل"}
                      </Button>
                    )}
                    {(s.status === "active" || s.status === "pending_payment") && (
                      <Button variant="ghost" size="sm" onClick={() => onCancel(s.id)}>
                        إلغاء
                      </Button>
                    )}
                  </div>
                </div>

                {/* الأثر تحت كل كفالة لا في صفحة منفصلة: الكافل يفتح
                    لوحته ليطمئنّ، فإن لزمته نقرة أخرى لم يطمئنّ. */}
                {orphan && s.status !== "pending_payment" && (
                  <details className="group mt-4">
                    <summary className="text-primary cursor-pointer list-none text-sm font-medium">
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

      {/* الترشيح بعد الكفالات لا قبلها: اللوحة تُفتح للاطمئنان على من
          تكفلهم، ثم يُعرض من يليهم. */}
      <div className="mt-12 border-t border-border pt-8">
        <SuggestionsPanel />
      </div>
    </DashboardShell>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-2xl font-extrabold text-shore-need">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
