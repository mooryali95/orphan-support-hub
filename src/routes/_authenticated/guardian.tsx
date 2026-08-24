import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Users } from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { ImpactPanel } from "@/components/impact/ImpactPanel";
import { getGuardianWorkspace } from "@/lib/impact.functions";
import { formatMoney, fundingPercent, ORPHAN_STATUS_LABELS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/guardian")({
  /* أولياء الأمور وحدهم — راحة لا حماية: الحارس الحقيقي في القاعدة. */
  beforeLoad: ({ context }) => {
    if (!context.roles.includes("guardian")) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "مساحة ولي الأمر — IOCO — اكفل يتيماً بملف موثّق" },
      { name: "description", content: "اكفل يتيماً بملف موثّق من جهة رعاية معتمدة. منصة IOCO تربطك بيتيم حقيقي بكفالة شهرية شفافة وتقارير أثر دورية." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GuardianPage,
});

function GuardianPage() {
  const fetchWorkspace = useServerFn(getGuardianWorkspace);
  const { data, isLoading } = useQuery({
    queryKey: ["guardian-workspace"],
    queryFn: () => fetchWorkspace(),
  });

  const orphans = data?.orphans ?? [];

  return (
    <DashboardShell
      title="مساحة ولي الأمر"
      description="ملفات من تحت رعايتك وما نُشر عنهم من تقارير."
    >
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="text-muted-foreground size-6 animate-spin" aria-hidden="true" />
        </div>
      ) : orphans.length === 0 ? (
        <div className="border-border bg-card rounded-3xl border border-dashed p-12 text-center">
          <Users className="text-bridge mx-auto size-8" aria-hidden="true" />
          <p className="mt-4 font-medium">لا ملفات مرتبطة بحسابك</p>
          <p className="text-muted-foreground mt-1 text-sm leading-7">
            تربط الإدارة حسابك بملف من تحت رعايتك بعد التحقّق من الوصاية. راجع جهة الرعاية التي رفعت
            الملف.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orphans.map((o) => {
            const percent = fundingPercent(o.monthly_need, o.funded_monthly);
            return (
              <article key={o.id} className="border-border bg-card rounded-2xl border p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold">{o.display_name}</h2>
                  <Badge variant="secondary">{ORPHAN_STATUS_LABELS[o.status] ?? o.status}</Badge>
                  <span className="text-muted-foreground text-xs tabular-nums">{o.code}</span>
                </div>

                <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                  {formatMoney(o.funded_monthly, o.currency)} من{" "}
                  {formatMoney(o.monthly_need, o.currency)} شهرياً
                </p>
                <CrossingProgress
                  percent={percent}
                  className="mt-3 max-w-sm"
                  label={`تغطية احتياج ${o.display_name} الشهري`}
                />

                {/* لا شيء هنا عن الكفلاء: من يكفل وبكم علاقة بين الكافل
                    والمنصة، وكشفها لولي الأمر يُنشئ التزاماً شخصياً لم
                    يطلبه أحد الطرفين. */}
                <ImpactPanel orphanId={o.id} orphanName={o.display_name} />
              </article>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
}
