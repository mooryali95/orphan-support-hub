import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, HeartHandshake } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { listMySponsorships, cancelSponsorship } from "@/lib/sponsorships.functions";
import { formatDate, formatMoney, fundingPercent, SPONSORSHIP_STATUS_LABELS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "كفالاتي — كافل" },
      { name: "description", content: "تابع كفالاتك النشطة ومدفوعاتها وحالة الأيتام المكفولين." },
      { property: "og:title", content: "كفالاتي — كافل" },
      { property: "og:description", content: "لوحة الكافل لمتابعة الكفالات والمدفوعات." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetchList = useServerFn(listMySponsorships);
  const cancel = useServerFn(cancelSponsorship);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["my-sponsorships"],
    queryFn: () => fetchList(),
  });

  const sponsorships = data?.sponsorships ?? [];
  const activeTotal = sponsorships
    .filter((s) => s.status === "active")
    .reduce((acc, s) => acc + Number(s.amount), 0);

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
              <article
                key={s.id}
                className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center"
              >
                <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-secondary">
                  {orphan?.photo_url ? (
                    <img
                      src={orphan.photo_url}
                      alt={`صورة ${orphan.display_name}`}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="surface-warm flex size-full items-center justify-center font-bold text-primary/50">
                      {orphan?.display_name.slice(0, 1) ?? "؟"}
                    </div>
                  )}
                </div>

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
                  {(s.status === "active" || s.status === "pending_payment") && (
                    <Button variant="ghost" size="sm" onClick={() => onCancel(s.id)}>
                      إلغاء
                    </Button>
                  )}
                </div>
              </article>
            );
          })
        )}
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
