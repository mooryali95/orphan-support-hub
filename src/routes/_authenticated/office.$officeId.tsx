import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { FileText, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import {
  getOfficeDashboard,
  KIND_LABELS,
  saveOfficeReport,
  type OfficeReport,
} from "@/lib/workspaces.functions";

export const Route = createFileRoute("/_authenticated/office/$officeId")({
  head: () => ({
    meta: [{ title: "لوحة المكتب — كهاتين" }, { name: "robots", content: "noindex" }],
  }),
  component: OfficePage,
});

const STATUS_LABELS: Record<OfficeReport["status"], string> = {
  draft: "مسودّة",
  submitted: "مرفوع للمراجعة",
  published: "منشور",
};

function OfficePage() {
  const { officeId } = Route.useParams();
  const fetchDash = useServerFn(getOfficeDashboard);
  const { data, isPending } = useQuery({
    queryKey: ["office", officeId],
    queryFn: () => fetchDash({ data: { officeId } }),
  });

  if (isPending) {
    return (
      <DashboardShell title="لوحة المكتب">
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardShell>
    );
  }
  const d = data?.dashboard;
  if (!d) {
    return (
      <DashboardShell title="لوحة المكتب">
        <p className="text-sm text-muted-foreground">
          لا تملك الاطّلاع على هذا المكتب.{" "}
          <Link to="/workspaces" className="underline">
            بواباتي
          </Link>
        </p>
      </DashboardShell>
    );
  }

  const stats: Array<[string, number]> = [
    ["المجموعات", d.groups],
    ["المستفيدون المعتمدون", d.orphans],
    [KIND_LABELS["qualification"] ?? "", d.pledges.qualification?.amount ?? 0],
    [KIND_LABELS["in_kind"] ?? "", d.pledges.in_kind?.amount ?? 0],
  ];

  return (
    <DashboardShell
      title={d.office.name}
      description={`${d.office.region ?? "الدولة كلّها"} — ${d.office.country}`}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-background p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-extrabold tabular-nums">
              {value.toLocaleString("ar")}
            </p>
          </div>
        ))}
      </div>

      {d.can_write && <ReportForm officeId={officeId} canPublish={d.can_publish} />}

      <section className="mt-10">
        <h2 className="text-lg font-bold">التقارير</h2>
        {(data?.reports ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">لا تقارير بعد.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data!.reports.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-background p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold">
                    <FileText className="size-4" />
                    {r.title}
                  </span>
                  <Badge variant={r.status === "published" ? "default" : "secondary"}>
                    {STATUS_LABELS[r.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
                {r.body && <p className="mt-2 whitespace-pre-line text-sm">{r.body}</p>}
                {Object.keys(r.metrics).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(r.metrics).map(([k, v]) => (
                      <Badge key={k} variant="outline">
                        {k}: {String(v)}
                      </Badge>
                    ))}
                  </div>
                )}
                {r.attachments.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">{r.attachments.length} مرفق</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}

function ReportForm({ officeId, canPublish }: { officeId: string; canPublish: boolean }) {
  const save = useServerFn(saveOfficeReport);
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [metrics, setMetrics] = useState<Array<{ key: string; value: string }>>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // الرفع من المتصفّح بجلسة المستخدم: سياسة الخزنة تقبل مجلّد مكتبه وحده.
  async function upload(list: FileList | null) {
    if (!list) return;
    setBusy(true);
    setMsg(null);
    const added: string[] = [];
    for (const file of Array.from(list).slice(0, 30 - files.length)) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const path = `${officeId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("office-media").upload(path, file);
      if (error) {
        setMsg("تعذّر رفع بعض الملفات (صور أو PDF حتى 10 م.ب).");
        continue;
      }
      added.push(path);
    }
    setFiles((f) => [...f, ...added]);
    setBusy(false);
  }

  async function submit(status: "draft" | "submitted" | "published") {
    setBusy(true);
    setMsg(null);
    const m: Record<string, number | string> = {};
    for (const { key, value } of metrics) {
      if (!key.trim()) continue;
      const n = Number(value);
      m[key.trim()] = value.trim() !== "" && Number.isFinite(n) ? n : value.trim();
    }
    const res = await save({
      data: { officeId, title, body, metrics: m, attachments: files, status },
    });
    setBusy(false);
    if (!res.ok) {
      setMsg("تعذّر الحفظ.");
      return;
    }
    setTitle("");
    setBody("");
    setMetrics([]);
    setFiles([]);
    setMsg("حُفظ التقرير.");
    await qc.invalidateQueries({ queryKey: ["office", officeId] });
  }

  return (
    <section className="mt-10 rounded-xl border border-border bg-background p-5">
      <h2 className="text-lg font-bold">تقرير جديد</h2>
      <div className="mt-4 grid gap-4">
        <div>
          <Label htmlFor="r-title">العنوان</Label>
          <Input id="r-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="r-body">التفاصيل</Label>
          <Textarea id="r-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>

        <div>
          <p className="text-sm font-medium">المؤشّرات</p>
          <p className="text-xs text-muted-foreground">
            أسماءٌ تختارها: زيارات، حقائب موزّعة، حضور…
          </p>
          <div className="mt-2 space-y-2">
            {metrics.map((row, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  aria-label="اسم المؤشّر"
                  value={row.key}
                  onChange={(e) =>
                    setMetrics((all) =>
                      all.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)),
                    )
                  }
                />
                <Input
                  aria-label="القيمة"
                  value={row.value}
                  onChange={(e) =>
                    setMetrics((all) =>
                      all.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="حذف المؤشّر"
                  onClick={() => setMetrics((all) => all.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMetrics((all) => [...all, { key: "", value: "" }])}
            >
              <Plus className="size-4" />
              مؤشّر
            </Button>
          </div>
        </div>

        <div>
          <Label htmlFor="r-files" className="flex items-center gap-2">
            <ImagePlus className="size-4" />
            صور ومرفقات ({files.length})
          </Label>
          <Input
            id="r-files"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => upload(e.target.files)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            لا تُنشر صورٌ تُظهر وجه طفلٍ دون موافقةٍ موثّقة.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || title.trim().length < 3}
            variant="outline"
            onClick={() => submit("draft")}
          >
            حفظ مسودّة
          </Button>
          <Button disabled={busy || title.trim().length < 3} onClick={() => submit("submitted")}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            رفع للمراجعة
          </Button>
          {canPublish && (
            <Button
              disabled={busy || title.trim().length < 3}
              variant="secondary"
              onClick={() => submit("published")}
            >
              نشر
            </Button>
          )}
        </div>
        {msg && (
          <p role="status" className="text-sm text-muted-foreground">
            {msg}
          </p>
        )}
      </div>
    </section>
  );
}
