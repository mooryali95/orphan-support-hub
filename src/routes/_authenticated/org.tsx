import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, FileText, GraduationCap, Loader2, PencilLine, Plus, UserRound } from "lucide-react";
import { OrgInbox } from "@/components/org/OrgInbox";
import { OrphanProfilePanel } from "@/components/profile/OrphanProfilePanel";
import { CompletenessLine } from "@/components/orphan/TrustSignals";
import { getProfileCompleteness, SECTION_LABELS } from "@/lib/profile.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getMyOrgKyc, getMyOrgWorkspace } from "@/lib/org.functions";
import { OrgRegistration } from "@/components/org/OrgRegistration";
import { QualificationManager } from "@/components/qualification/QualificationManager";
import { OrphanIntakeForm } from "@/components/intake/OrphanIntakeForm";
import { ReportForm } from "@/components/impact/ReportForm";
import { REJECTION_LABELS } from "@/lib/intake.functions";
import { formatMoney, ORPHAN_STATUS_LABELS } from "@/lib/format";
import { BRAND, pageTitle } from "@/config/brand";

export const Route = createFileRoute("/_authenticated/org")({
  /* مفتوحةٌ لكلّ مسجَّل (UX-03): من لا جهة له يجد هنا نموذج تسجيلها، ودور
     care_org يُمنح مع الطلب في القاعدة. والحارس الحقيقي هناك: لا رفع ملفٍّ
     قبل اعتماد الإدارة. */
  head: () => ({
    meta: [
      { title: pageTitle("مساحة جهة الرعاية") },
      {
        name: "description",
        content: BRAND.description,
      },
      { property: "og:title", content: pageTitle("مساحة جهة الرعاية") },
      {
        property: "og:description",
        content: BRAND.description,
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrgPage,
});

function OrgPage() {
  // المسودّة تُحفظ لصاحبها وحده (UX-05).
  const { user } = Route.useRouteContext();
  const fetchWorkspace = useServerFn(getMyOrgWorkspace);
  const fetchKyc = useServerFn(getMyOrgKyc);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [building, setBuilding] = useState<string | null>(null);
  const [profiling, setProfiling] = useState<string | null>(null);
  // ملفٌّ قائم مفتوح من القاعدة: مسودّة تُستأنف، أو مرفوضٌ يُصحَّح، أو مُقدَّمٌ يُقرأ.
  const [openFile, setOpenFile] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["org-workspace"],
    queryFn: () => fetchWorkspace(),
  });

  const { data: kyc, isLoading: kycLoading } = useQuery({
    queryKey: ["org-kyc"],
    queryFn: () => fetchKyc(),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["org-workspace"] });
    queryClient.invalidateQueries({ queryKey: ["org-kyc"] });
  }

  if (isLoading || kycLoading) {
    return (
      <DashboardShell title="جهة الرعاية">
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardShell>
    );
  }

  if (!data?.org || data.org.status === "pending" || data.org.status === "rejected") {
    return (
      <DashboardShell
        title={data?.org ? "طلب اعتماد الجهة" : "تسجيل جهة رعاية"}
        description="سجّل بيانات الجمعية أو الدار ووثيقة تسجيلها، وتراجعها الإدارة قبل السماح برفع ملفات الأطفال."
      >
        <OrgRegistration
          key={kyc?.org_id ?? "new"}
          org={data?.org ?? null}
          kyc={kyc ?? null}
          onChanged={refresh}
        />
      </DashboardShell>
    );
  }

  const org = data.org;

  return (
    <DashboardShell title={org.name} description="ملفات الأيتام التابعة لجهتك وحالتها.">
      <OrgInbox />
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={org.status === "approved" ? "default" : "secondary"}>
          {org.status === "approved"
            ? "جهة معتمدة"
            : org.status === "pending"
              ? "بانتظار اعتماد الإدارة"
              : "غير مفعّلة"}
        </Badge>
        <Button
          size="sm"
          onClick={() => setShowForm((v) => !v)}
          disabled={org.status !== "approved"}
        >
          <Plus className="size-4" /> ملف يتيم جديد
        </Button>
      </div>

      {showForm && org.status === "approved" && (
        <div className="mt-6 max-w-3xl">
          <OrphanIntakeForm
            orgId={org.id}
            userId={user.id}
            onDone={(code) => {
              toast.success(`أُرسل الملف ${code} للمراجعة`);
              setShowForm(false);
              refresh();
            }}
            onCancel={() => {
              setShowForm(false);
              refresh();
            }}
          />
        </div>
      )}

      <div className="mt-8 space-y-3">
        {data.orphans.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            لا توجد ملفات بعد.
          </p>
        ) : (
          data.orphans.map((o) => (
            <div key={o.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold">{o.display_name}</h3>
                    <Badge variant="secondary">{ORPHAN_STATUS_LABELS[o.status] ?? o.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {o.code} — {o.city ?? "—"} — {formatMoney(o.funded_monthly, o.currency)} /{" "}
                    {formatMoney(o.monthly_need, o.currency)}
                  </p>
                  {((o.pending_fields?.length ?? 0) > 0 || (o.needs_pending_review ?? 0) > 0) && (
                    // التعديل على ملفٍّ منشور لا يُنشر قبل المراجعة، ولا يُسقط الملفّ؛
                    // فتعرف الجهة أنّ ما تراه الصفحة العامّة هو المراجَع.
                    <p className="mt-1 text-xs text-muted-foreground">
                      تعديلٌ ينتظر مراجعة الإدارة — الصفحة العامّة تعرض النسخة المراجَعة.
                    </p>
                  )}
                  {o.status === "rejected" && (
                    // الرفض بلا سبب لا يُمكّن الجهة من التصحيح، فالسبب
                    // المُهيكل يُعرض هنا لا في بريد منفصل.
                    <p className="text-bridge-ink mt-1 text-xs font-medium">
                      سبب الرفض: {REJECTION_LABELS[o.rejection_code ?? ""] ?? "—"}
                      {o.rejection_reason ? ` — ${o.rejection_reason}` : ""}
                    </p>
                  )}
                </div>

                {/* المسودّة والمرفوض يُفتحان للإكمال أو التصحيح وإعادة التقديم،
                    والمُقدَّم وقيد المراجعة للقراءة (UX-04). */}
                {(o.status === "draft" || o.status === "rejected") && org.status === "approved" && (
                  <Button
                    size="sm"
                    variant={o.status === "rejected" ? "default" : "outline"}
                    aria-expanded={openFile === o.id}
                    onClick={() => setOpenFile(openFile === o.id ? null : o.id)}
                  >
                    <PencilLine className="size-4" aria-hidden="true" />
                    {openFile === o.id
                      ? "إغلاق"
                      : o.status === "rejected"
                        ? "صحّح وأعد التقديم"
                        : "أكمل المسودّة"}
                  </Button>
                )}
                {(o.status === "submitted" || o.status === "under_review") && (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-expanded={openFile === o.id}
                    onClick={() => setOpenFile(openFile === o.id ? null : o.id)}
                  >
                    <Eye className="size-4" aria-hidden="true" />
                    {openFile === o.id ? "إغلاق" : "عرض الملف"}
                  </Button>
                )}

                {/* التقرير الدوري متاح على الملفات المنشورة وحدها: ملفّ
                  لم يُعتمد بعدُ لا كافل له ينتظر خبراً. */}
                {(o.status === "approved" || o.status === "fully_sponsored") && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-expanded={profiling === o.id}
                      onClick={() => setProfiling(profiling === o.id ? null : o.id)}
                    >
                      <UserRound className="size-4" aria-hidden="true" />
                      {profiling === o.id ? "إغلاق" : "البروفايل"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-expanded={building === o.id}
                      onClick={() => setBuilding(building === o.id ? null : o.id)}
                    >
                      <GraduationCap className="size-4" aria-hidden="true" />
                      {building === o.id ? "إغلاق" : "بناء الأهلية"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-expanded={reporting === o.id}
                      onClick={() => setReporting(reporting === o.id ? null : o.id)}
                    >
                      <FileText className="size-4" aria-hidden="true" />
                      {reporting === o.id ? "إغلاق" : "تقرير دوري"}
                    </Button>
                  </>
                )}
              </div>

              {/* تمام البروفايل في الصفّ نفسه: الجهة تعرف ما ينقص دون أن تفتح شيئاً. */}
              {(o.status === "approved" || o.status === "fully_sponsored") && (
                <OrgCompleteness orphanId={o.id} />
              )}

              {openFile === o.id && (
                <div className="mt-4">
                  <OrphanIntakeForm
                    orgId={org.id}
                    userId={user.id}
                    orphanId={o.id}
                    onDone={(code) => {
                      toast.success(`أُرسل الملف ${code} للمراجعة`);
                      setOpenFile(null);
                      refresh();
                    }}
                    onCancel={() => {
                      setOpenFile(null);
                      refresh();
                    }}
                  />
                </div>
              )}

              {profiling === o.id && (
                <OrphanProfilePanel orphanId={o.id} orphanName={o.display_name} />
              )}

              {building === o.id && <QualificationManager orphanId={o.id} />}

              {reporting === o.id && (
                <ReportForm
                  orphanId={o.id}
                  onDone={() => setReporting(null)}
                  onCancel={() => setReporting(null)}
                />
              )}
            </div>
          ))
        )}
      </div>
    </DashboardShell>
  );
}

/** النقاط الستّ وأسماء الناقص — من `orphan_profile_completeness` (للدائرة وحدها). */
function OrgCompleteness({ orphanId }: { orphanId: string }) {
  const fetchCompleteness = useServerFn(getProfileCompleteness);
  const { data } = useQuery({
    queryKey: ["profile-completeness", orphanId],
    queryFn: () => fetchCompleteness({ data: { orphanId } }),
  });
  const c = data?.completeness;
  if (!c) return null;
  return (
    <CompletenessLine
      className="mt-3"
      filled={c.filled}
      missing={c.missing}
      labels={SECTION_LABELS as Record<string, string>}
    />
  );
}
