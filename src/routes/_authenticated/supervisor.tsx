import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Ruler, ShieldCheck, TriangleAlert, ArrowLeft } from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TraitAssessmentForm } from "@/components/qualification/TraitAssessmentForm";
import { UnitProgressPanel } from "@/components/qualification/UnitProgressPanel";
import { QUALIFICATION_JOURNEY } from "@/lib/qualification.functions";
import { getEnrollmentDetail } from "@/lib/qualification-ops.functions";
import {
  getMySupervisedEnrollments,
  getMySupervisorProfile,
  LEVEL_LABELS,
} from "@/lib/supervisor.functions";
import type { SupervisedEnrollment } from "@/integrations/supabase/types.extra";
import { formatDate } from "@/lib/format";

const TITLE = "لوحة المشرف — IOSO";

export const Route = createFileRoute("/_authenticated/supervisor")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "المستفيدون المُسنَدون إليك ومراحلهم." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SupervisorPage,
});

function SupervisorPage() {
  const fetchProfile = useServerFn(getMySupervisorProfile);
  const fetchList = useServerFn(getMySupervisedEnrollments);

  const { data: profileRes, isPending: profileLoading } = useQuery({
    queryKey: ["supervisor-profile"],
    queryFn: () => fetchProfile(),
  });
  const { data: listRes, isPending: listLoading } = useQuery({
    queryKey: ["supervised"],
    queryFn: () => fetchList(),
  });

  if (profileLoading || listLoading) {
    return (
      <DashboardShell title="لوحة المشرف">
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardShell>
    );
  }

  const profile = profileRes?.profile ?? null;
  const list = listRes?.enrollments ?? [];

  // من ليس مشرفاً لا يُترك أمام شاشةٍ فارغة بلا تفسير.
  if (!profile) {
    return (
      <DashboardShell title="لوحة المشرف">
        <div className="max-w-xl rounded-2xl border border-border bg-card p-8 text-center">
          <ShieldCheck className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold">لستَ مشرفاً معتمَداً بعد</h2>
          <p className="mt-3 text-sm leading-8 text-muted-foreground">
            الإشراف على بناء الأهلية يحتاج اعتماداً من الإدارة — لا من جهة الرعاية. وبعد الاعتماد
            تُسنِد إليك الجهةُ مستفيديها، فيظهرون هنا.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/dashboard">العودة إلى لوحتي</Link>
          </Button>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title="لوحة المشرف"
      description="المستفيدون المُسنَدون إليك، ومرحلة كلٍّ منهم في بناء الأهلية."
    >
      {/* أهليّته هو — والرقم هنا يراه صاحبه، فهو أهليّته لا حكمٌ عليه */}
      <section
        className="max-w-2xl rounded-2xl border border-border bg-card p-5"
        aria-labelledby="my-standing"
      >
        <h2 id="my-standing" className="text-sm font-bold">
          أهليّتي
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">المستوى: {LEVEL_LABELS[profile.level]}</Badge>
          <Badge variant={profile.independent ? "default" : "secondary"}>
            مؤشّر الاستقلال: {profile.independence_index}٪
          </Badge>
          {profile.certified_at && (
            <span className="text-xs text-muted-foreground">
              اعتُمد في {formatDate(profile.certified_at)}
            </span>
          )}
        </div>
        {!profile.independent && (
          <p
            role="status"
            className="mt-3 flex items-start gap-2 rounded-xl bg-bridge-bright/12 p-3 text-xs leading-6 text-bridge-ink"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              الاستقلالية تُعقد عند {profile.threshold}٪. وحتى تبلغها يبقى إشرافك مقروناً بمتابعةٍ
              من الإدارة — وهذا طورٌ في التأهيل لا حكمٌ على الكفاءة.
            </span>
          </p>
        )}
      </section>

      <section className="mt-8" aria-labelledby="beneficiaries">
        <h2 id="beneficiaries" className="text-sm font-bold">
          المستفيدون ({list.length})
        </h2>

        {list.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            لم تُسنَد إليك ملفات بعد. تُسنِدها جهةُ الرعاية من لوحتها.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {list.map((e) => (
              <BeneficiaryCard key={e.enrollment_id} row={e} />
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}

function BeneficiaryCard({ row }: { row: SupervisedEnrollment }) {
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getEnrollmentDetail);

  const { data } = useQuery({
    queryKey: ["enrollment", row.enrollment_id],
    queryFn: () => fetchDetail({ data: { enrollmentId: row.enrollment_id } }),
  });

  const idx = QUALIFICATION_JOURNEY.findIndex((s) => s.stage === row.stage);
  const stage = QUALIFICATION_JOURNEY[idx];

  // ما ينتظر فعلاً منه — لا قائمة أعمال عامّة بل ما يلزم هذا الملف الآن.
  const pending: string[] = [];
  if (!row.has_consent) pending.push("بانتظار توثيق إذن الولي من الجهة");
  if (!row.has_baseline) pending.push("لم يُسجَّل قياس أوّلي بعد");
  if (row.units_awaiting > 0) pending.push(`${row.units_awaiting} جلسة سُلّمت وتنتظر تقويمك`);
  if (row.stage === "measurement" && !row.has_final) pending.push("القياس الختامي مستحقّ");
  if (row.stage === "measurement" && row.units_accepted < row.units_total)
    pending.push(
      `${row.units_total - row.units_accepted} جلسة لم تُقبل بعد — ولا تُعلَن الأهلية دونها`,
    );

  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">{row.orphan_name}</h3>
            <Badge variant="secondary">{row.orphan_code}</Badge>
            <Badge>{stage?.label ?? row.stage}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.program} — أُسند إليك في {formatDate(row.since)}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/orphans/$orphanId" params={{ orphanId: row.orphan_id }}>
            الملف العام
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {/* شريط الرحلة — ست نقاط لا نصّ طويل */}
      <ol className="mt-4 flex items-center gap-1" aria-label={`مرحلة ${row.orphan_name}`}>
        {QUALIFICATION_JOURNEY.map((s, i) => (
          <li key={s.stage} className="flex-1">
            <span
              className={`block h-1.5 rounded-full ${i <= idx ? "bg-shore-thrive" : "bg-border"}`}
              title={s.label}
            />
            <span className="mt-1 block text-[10px] text-muted-foreground">{s.label}</span>
          </li>
        ))}
      </ol>

      {pending.length > 0 && (
        <ul className="mt-4 space-y-1">
          {pending.map((p) => (
            <li key={p} className="flex items-start gap-2 text-xs leading-6 text-bridge-ink">
              <TriangleAlert className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
              {p}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-border pt-4">
        <UnitProgressPanel
          enrollmentId={row.enrollment_id}
          onDone={() => {
            void queryClient.invalidateQueries({ queryKey: ["supervised"] });
          }}
        />
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <TraitAssessmentForm
          enrollmentId={row.enrollment_id}
          assessments={data?.detail?.assessments ?? []}
          onDone={() => {
            void queryClient.invalidateQueries({ queryKey: ["supervised"] });
            void queryClient.invalidateQueries({
              queryKey: ["enrollment", row.enrollment_id],
            });
          }}
        />
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Ruler className="size-3" aria-hidden="true" />
        القياس حكمٌ على طفل: يُكتب من هنا وحده، ولا يُعرض على الكافل.
      </p>
    </li>
  );
}
