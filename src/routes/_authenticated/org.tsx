import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, FileText, GraduationCap, PencilLine, Plus, UserRound } from "lucide-react";
import { OrgInbox } from "@/components/org/OrgInbox";
import { OrgPledges } from "@/components/org/OrgPledges";
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
import { formatMoney } from "@/lib/format";
import { brandFor, pageTitle } from "@/config/brand";
import { PanelSkeleton } from "@/components/admin/PanelState";
import { Failed, Quiet } from "@/components/admin/overview/parts";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";

export const ORG_COPY = defineCopy("routes/org", {
  ar: {
    pageTitle: "مساحة الجهة الميدانية",
    title: "الجهة الميدانية",
    failed: "تعذّرت قراءة مساحة الجهة",
    failedText: "الملفّات غائبة الآن، وليست فارغة.",
    retry: "أعد المحاولة",
    applyTitle: "طلب اعتماد الجهة",
    registerTitle: "تسجيل جهة ميدانية",
    registerLead:
      "لمكاتب الندوة وشركائها الميدانيين: سجّل بيانات الجهة ووثيقة تسجيلها، وتراجعها الإدارة قبل السماح برفع ملفات الأطفال.",
    lead: "ملفات الأيتام التابعة لجهتك وحالتها.",
    approved: "اعتمدتها الإدارة",
    pendingOrg: "بانتظار اعتماد الإدارة",
    inactive: "غير مفعّلة",
    newFile: "ملفّ يتيم جديد",
    newFileWhy: "يُفتح رفع الملفّات بعد اعتماد الإدارة للجهة.",
    sent: (code: string) => `أُرسل الملفّ ${code} للمراجعة`,
    emptyH: "لا توجد ملفات بعد",
    emptyP: "ابدأ بملفّ يتيم جديد؛ يقف قيد المراجعة حتى تعتمده الإدارة.",
    noCity: "بلا مدينة",
    pendingEdit: "تعديلٌ ينتظر مراجعة الإدارة، والصفحة العامّة تعرض النسخة المراجَعة.",
    rejectReason: "سبب الرفض:",
    noReason: "غير محدّد",
    close: "إغلاق",
    fix: "صحّح وأعد التقديم",
    resume: "أكمل المسودّة",
    view: "عرض الملفّ",
    profile: "البروفايل",
    building: "بناء الأهلية",
    report: "تقرير دوري",
    status: {
      draft: "مسودة",
      submitted: "بانتظار المراجعة",
      under_review: "قيد المراجعة",
      approved: "معتمد",
      rejected: "مرفوض",
      fully_sponsored: "مكفول بالكامل",
      archived: "مؤرشف",
    } as Record<string, string>,
  },
  en: {
    pageTitle: "Field organization space",
    title: "Field organization",
    failed: "The organization space could not be read",
    failedText: "The files are missing right now, not empty.",
    retry: "Try again",
    applyTitle: "Organization approval request",
    registerTitle: "Register a field organization",
    registerLead:
      "For the organization's offices and field partners: record the organization's details and its registration document; the admin team reviews them before child files can be uploaded.",
    lead: "Your organization's orphan files and their status.",
    approved: "Approved by the admin team",
    pendingOrg: "Awaiting admin approval",
    inactive: "Not active",
    newFile: "New orphan file",
    newFileWhy: "Uploading files opens once the admin team approves the organization.",
    sent: (code: string) => `File ${code} was sent for review`,
    emptyH: "No files yet",
    emptyP: "Start with a new orphan file; it stays under review until the admin team approves it.",
    noCity: "No city",
    pendingEdit: "An edit awaits admin review, and the public page shows the reviewed version.",
    rejectReason: "Reason for rejection:",
    noReason: "Not specified",
    close: "Close",
    fix: "Fix and resubmit",
    resume: "Continue the draft",
    view: "View the file",
    profile: "Profile",
    building: "Capability building",
    report: "Periodic report",
    status: {
      draft: "Draft",
      submitted: "Awaiting review",
      under_review: "Under review",
      approved: "Approved",
      rejected: "Rejected",
      fully_sponsored: "Fully sponsored",
      archived: "Archived",
    } as Record<string, string>,
  },
});

export const Route = createFileRoute("/_authenticated/org")({
  /* مفتوحةٌ لكلّ مسجَّل (UX-03): من لا جهة له يجد هنا نموذج تسجيلها، ودور
     care_org يُمنح مع الطلب في القاعدة. والحارس الحقيقي هناك: لا رفع ملفٍّ
     قبل اعتماد الإدارة. */
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const title = pageTitle(copyOf(ORG_COPY, l).pageTitle, true, l);
    const description = brandFor(l).description;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: OrgPage,
});

function OrgPage() {
  // المسودّة تُحفظ لصاحبها وحده (UX-05).
  const { user } = Route.useRouteContext();
  const c = useCopy(ORG_COPY);
  const fetchWorkspace = useServerFn(getMyOrgWorkspace);
  const fetchKyc = useServerFn(getMyOrgKyc);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [building, setBuilding] = useState<string | null>(null);
  const [profiling, setProfiling] = useState<string | null>(null);
  // ملفٌّ قائم مفتوح من القاعدة: مسودّة تُستأنف، أو مرفوضٌ يُصحَّح، أو مُقدَّمٌ يُقرأ.
  const [openFile, setOpenFile] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["org-workspace"],
    queryFn: () => fetchWorkspace(),
  });

  const {
    data: kyc,
    isLoading: kycLoading,
    isError: kycError,
    refetch: refetchKyc,
  } = useQuery({
    queryKey: ["org-kyc"],
    queryFn: () => fetchKyc(),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["org-workspace"] });
    queryClient.invalidateQueries({ queryKey: ["org-kyc"] });
  }

  if (isLoading || kycLoading) {
    return (
      <DashboardShell title={c.title}>
        <PanelSkeleton shape="rows" count={3} />
      </DashboardShell>
    );
  }

  if (isError || kycError) {
    return (
      <DashboardShell title={c.title}>
        <Failed
          title={c.failed}
          text={c.failedText}
          retry={c.retry}
          onRetry={() => {
            void refetch();
            void refetchKyc();
          }}
        />
      </DashboardShell>
    );
  }

  if (!data?.org || data.org.status === "pending" || data.org.status === "rejected") {
    return (
      <DashboardShell
        title={data?.org ? c.applyTitle : c.registerTitle}
        description={c.registerLead}
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
    <DashboardShell title={org.name} description={c.lead}>
      <OrgInbox />
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={org.status === "approved" ? "default" : "secondary"}>
          {org.status === "approved"
            ? c.approved
            : org.status === "pending"
              ? c.pendingOrg
              : c.inactive}
        </Badge>
        <Button
          className="min-h-11"
          aria-expanded={showForm}
          aria-disabled={org.status !== "approved"}
          aria-describedby={org.status !== "approved" ? "org-newfile-why" : undefined}
          onClick={() => org.status === "approved" && setShowForm((v) => !v)}
        >
          <Plus className="size-4" aria-hidden="true" /> {c.newFile}
        </Button>
        {org.status !== "approved" && (
          <p id="org-newfile-why" className="text-xs text-muted-foreground">
            {c.newFileWhy}
          </p>
        )}
      </div>

      {showForm && org.status === "approved" && (
        <div className="mt-6 max-w-3xl">
          <OrphanIntakeForm
            orgId={org.id}
            userId={user.id}
            onDone={(code) => {
              toast.success(c.sent(code));
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
          <Quiet title={c.emptyH} text={c.emptyP} />
        ) : (
          data.orphans.map((o) => (
            <div key={o.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold">{o.display_name}</h3>
                    <Badge variant="secondary">{c.status[o.status] ?? o.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <bdi dir="ltr">{o.code}</bdi> · {o.city ?? c.noCity} ·{" "}
                    {formatMoney(o.funded_monthly, o.currency)} /{" "}
                    {formatMoney(o.monthly_need, o.currency)}
                  </p>
                  {((o.pending_fields?.length ?? 0) > 0 || (o.needs_pending_review ?? 0) > 0) && (
                    // التعديل على ملفٍّ منشور لا يُنشر قبل المراجعة، ولا يُسقط الملفّ؛
                    // فتعرف الجهة أنّ ما تراه الصفحة العامّة هو المراجَع.
                    <p className="mt-1 text-xs text-muted-foreground">{c.pendingEdit}</p>
                  )}
                  {o.status === "rejected" && (
                    // الرفض بلا سبب لا يُمكّن الجهة من التصحيح، فالسبب
                    // المُهيكل يُعرض هنا لا في بريد منفصل.
                    <p className="text-bridge-ink mt-1 text-xs font-medium">
                      {c.rejectReason} {REJECTION_LABELS[o.rejection_code ?? ""] ?? c.noReason}
                      {o.rejection_reason ? `: ${o.rejection_reason}` : ""}
                    </p>
                  )}
                </div>

                {/* المسودّة والمرفوض يُفتحان للإكمال أو التصحيح وإعادة التقديم،
                    والمُقدَّم وقيد المراجعة للقراءة (UX-04). */}
                {(o.status === "draft" || o.status === "rejected") && org.status === "approved" && (
                  <Button
                    className="min-h-11"
                    variant={o.status === "rejected" ? "default" : "outline"}
                    aria-expanded={openFile === o.id}
                    onClick={() => setOpenFile(openFile === o.id ? null : o.id)}
                  >
                    <PencilLine className="size-4" aria-hidden="true" />
                    {openFile === o.id ? c.close : o.status === "rejected" ? c.fix : c.resume}
                  </Button>
                )}
                {(o.status === "submitted" || o.status === "under_review") && (
                  <Button
                    className="min-h-11"
                    variant="outline"
                    aria-expanded={openFile === o.id}
                    onClick={() => setOpenFile(openFile === o.id ? null : o.id)}
                  >
                    <Eye className="size-4" aria-hidden="true" />
                    {openFile === o.id ? c.close : c.view}
                  </Button>
                )}

                {/* التقرير الدوري متاح على الملفات المنشورة وحدها: ملفّ
                  لم يُعتمد بعدُ لا كافل له ينتظر خبراً. */}
                {(o.status === "approved" || o.status === "fully_sponsored") && (
                  <>
                    <Button
                      className="min-h-11"
                      variant="outline"
                      aria-expanded={profiling === o.id}
                      onClick={() => setProfiling(profiling === o.id ? null : o.id)}
                    >
                      <UserRound className="size-4" aria-hidden="true" />
                      {profiling === o.id ? c.close : c.profile}
                    </Button>
                    <Button
                      className="min-h-11"
                      variant="outline"
                      aria-expanded={building === o.id}
                      onClick={() => setBuilding(building === o.id ? null : o.id)}
                    >
                      <GraduationCap className="size-4" aria-hidden="true" />
                      {building === o.id ? c.close : c.building}
                    </Button>
                    <Button
                      className="min-h-11"
                      variant="outline"
                      aria-expanded={reporting === o.id}
                      onClick={() => setReporting(reporting === o.id ? null : o.id)}
                    >
                      <FileText className="size-4" aria-hidden="true" />
                      {reporting === o.id ? c.close : c.report}
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
                      toast.success(c.sent(code));
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
      <OrgPledges orgId={org.id} />
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
