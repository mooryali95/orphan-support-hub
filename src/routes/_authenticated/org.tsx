import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { FileText, GraduationCap, Loader2, Plus } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getMyOrgWorkspace, registerOrganization } from "@/lib/org.functions";
import { QualificationManager } from "@/components/qualification/QualificationManager";
import { OrphanIntakeForm } from "@/components/intake/OrphanIntakeForm";
import { ReportForm } from "@/components/impact/ReportForm";
import { REJECTION_LABELS } from "@/lib/intake.functions";
import { formatMoney, ORPHAN_STATUS_LABELS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/org")({
  /* جهات الرعاية وحدها — راحة لا حماية: الحارس الحقيقي في القاعدة. */
  beforeLoad: ({ context }) => {
    if (!context.roles.includes("care_org")) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "مساحة جهة الرعاية — كهاتين — اكفل يتيماً بملف موثّق" },
      {
        name: "description",
        content:
          "اكفل يتيماً بملف موثّق من جهة رعاية معتمدة. منصة كهاتين تربطك بيتيم حقيقي بكفالة شهرية شفافة وتقارير أثر دورية.",
      },
      { property: "og:title", content: "مساحة جهة الرعاية — كهاتين — اكفل يتيماً بملف موثّق" },
      {
        property: "og:description",
        content:
          "اكفل يتيماً بملف موثّق من جهة رعاية معتمدة. منصة كهاتين تربطك بيتيم حقيقي بكفالة شهرية شفافة وتقارير أثر دورية.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrgPage,
});

function OrgPage() {
  const fetchWorkspace = useServerFn(getMyOrgWorkspace);
  const register = useServerFn(registerOrganization);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [building, setBuilding] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["org-workspace"],
    queryFn: () => fetchWorkspace(),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["org-workspace"] });
  }

  if (isLoading) {
    return (
      <DashboardShell title="جهة الرعاية">
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardShell>
    );
  }

  if (!data?.org) {
    return (
      <DashboardShell
        title="تسجيل جهة رعاية"
        description="سجّل بيانات الجمعية أو الدار، وستراجعها الإدارة قبل السماح برفع الملفات."
      >
        <form
          className="max-w-xl space-y-4 rounded-3xl border border-border bg-card p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const res = await register({
              data: {
                name: String(form.get("name") ?? ""),
                licenseNumber: String(form.get("license") ?? "") || undefined,
                city: String(form.get("city") ?? "") || undefined,
                region: String(form.get("region") ?? "") || undefined,
                contactEmail: String(form.get("email") ?? "") || undefined,
                about: String(form.get("about") ?? "") || undefined,
              },
            });
            if (!res.ok) {
              toast.error(res.error ?? "تعذّر إرسال الطلب");
              return;
            }
            toast.success("تم إرسال الطلب للمراجعة");
            refresh();
          }}
        >
          <Field name="name" label="اسم الجهة" required />
          <Field name="license" label="رقم الترخيص" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="city" label="المدينة" />
            <Field name="region" label="المنطقة" />
          </div>
          <Field name="email" label="بريد التواصل" type="email" />
          <div>
            <Label htmlFor="about">نبذة عن الجهة</Label>
            <Textarea id="about" name="about" rows={4} className="mt-2" />
          </div>
          <Button type="submit">إرسال طلب الاعتماد</Button>
        </form>
      </DashboardShell>
    );
  }

  const org = data.org;

  return (
    <DashboardShell title={org.name} description="ملفات الأيتام التابعة لجهتك وحالتها.">
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
            onDone={(code) => {
              toast.success(`أُرسل الملف ${code} للمراجعة`);
              setShowForm(false);
              refresh();
            }}
            onCancel={() => setShowForm(false)}
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
                  {o.status === "rejected" && (
                    // الرفض بلا سبب لا يُمكّن الجهة من التصحيح، فالسبب
                    // المُهيكل يُعرض هنا لا في بريد منفصل.
                    <p className="text-bridge-ink mt-1 text-xs font-medium">
                      سبب الرفض: {REJECTION_LABELS[o.rejection_code ?? ""] ?? "—"}
                      {o.rejection_reason ? ` — ${o.rejection_reason}` : ""}
                    </p>
                  )}
                </div>

                {/* التقرير الدوري متاح على الملفات المنشورة وحدها: ملفّ
                  لم يُعتمد بعدُ لا كافل له ينتظر خبراً. */}
                {(o.status === "approved" || o.status === "fully_sponsored") && (
                  <>
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

function Field({
  name,
  label,
  type = "text",
  required,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} className="mt-2" />
    </div>
  );
}
