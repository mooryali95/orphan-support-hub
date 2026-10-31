import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { FileText, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";

import { OfficeChecklist } from "@/components/offices/OfficeChecklist";
import { OfficePledges } from "@/components/offices/OfficePledges";
import { useAuth } from "@/hooks/useAuth";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
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
  saveOfficeReport,
  type OfficeReport,
  useWorkspaceLabels,
} from "@/lib/workspaces.functions";
import { pageTitle } from "@/config/brand";
import { StatTile } from "@/components/kit/StatTile";

const COPY = defineCopy("routes/office", {
  ar: {
    title: "لوحة المكتب",
    wholeCountry: "الدولة كلّها",
    noAccessA: "لا تملك الاطّلاع على هذا المكتب.",
    portals: "بواباتي",
    groups: "المجموعات",
    orphans: "المستفيدون المعتمدون",
    reports: "التقارير",
    noReports: "لا تقارير بعد.",
    status: { draft: "مسودّة", submitted: "مرفوع للمراجعة", published: "منشور" } as Record<
      OfficeReport["status"],
      string
    >,
    newReport: "تقرير جديد",
    rTitle: "العنوان",
    rBody: "التفاصيل",
    metrics: "المؤشّرات",
    metricsHint: "أسماءٌ تختارها: زيارات، حقائب موزّعة، حضور…",
    metricName: "اسم المؤشّر",
    metricValue: "القيمة",
    removeMetric: "حذف المؤشّر",
    addMetric: "مؤشّر",
    files: (n: number) => `صور ومرفقات (${n})`,
    consent: "أُقرّ أن هذه الصور لا تُظهر وجه طفلٍ إلا بموافقةٍ موثّقة على النشر.",
    saveDraft: "حفظ مسودّة",
    submit: "رفع للمراجعة",
    publish: "نشر",
    uploadFailed: "تعذّر رفع بعض الملفات (صور أو PDF حتى 10 م.ب).",
    saveFailed: "تعذّر الحفظ.",
    saved: "حُفظ التقرير.",
    photoAlt: "صورة من تقرير المكتب",
  },
  en: {
    title: "Office dashboard",
    wholeCountry: "Whole country",
    noAccessA: "You don't have access to this office.",
    portals: "My portals",
    groups: "Groups",
    orphans: "Approved beneficiaries",
    reports: "Reports",
    noReports: "No reports yet.",
    status: { draft: "Draft", submitted: "Submitted for review", published: "Published" } as Record<
      OfficeReport["status"],
      string
    >,
    newReport: "New report",
    rTitle: "Title",
    rBody: "Details",
    metrics: "Indicators",
    metricsHint: "Names you choose: visits, bags distributed, attendance…",
    metricName: "Indicator name",
    metricValue: "Value",
    removeMetric: "Remove indicator",
    addMetric: "Indicator",
    files: (n: number) => `Photos and attachments (${n})`,
    consent: "I confirm these photos show no child's face without documented consent to publish.",
    saveDraft: "Save draft",
    submit: "Submit for review",
    publish: "Publish",
    uploadFailed: "Some files could not be uploaded (images or PDF up to 10 MB).",
    saveFailed: "It could not be saved.",
    saved: "Report saved.",
    photoAlt: "Photo from the office report",
  },
});

export const Route = createFileRoute("/_authenticated/office/$officeId")({
  head: ({ match }) => ({
    meta: [
      { title: pageTitle(copyOf(COPY, match.context.locale ?? "ar").title, false) },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OfficePage,
});

function OfficePage() {
  const { officeId } = Route.useParams();
  const t = useCopy(COPY);
  const locale = useLocale();
  const labels = useWorkspaceLabels();
  const { isAdmin } = useAuth();
  const fetchDash = useServerFn(getOfficeDashboard);
  const { data, isPending } = useQuery({
    queryKey: ["office", officeId],
    queryFn: () => fetchDash({ data: { officeId } }),
  });

  if (isPending) {
    return (
      <DashboardShell title={t.title}>
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardShell>
    );
  }
  const d = data?.dashboard;
  if (!d) {
    return (
      <DashboardShell title={t.title}>
        <p className="text-sm text-muted-foreground">
          {t.noAccessA}{" "}
          <Link to="/workspaces" className="underline">
            {t.portals}
          </Link>
        </p>
      </DashboardShell>
    );
  }

  const stats: Array<[string, number]> = [
    [t.groups, d.groups],
    [t.orphans, d.orphans],
    [labels.kind["qualification"] ?? "", d.pledges.qualification?.amount ?? 0],
    [labels.kind["in_kind"] ?? "", d.pledges.in_kind?.amount ?? 0],
  ];

  return (
    <DashboardShell
      title={d.office.name}
      description={`${d.office.region ?? t.wholeCountry} — ${d.office.country}`}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <StatTile key={label} label={label} value={value.toLocaleString(locale)} />
        ))}
      </div>

      <OfficeChecklist d={d} isAdmin={isAdmin} />

      <OfficePledges officeId={officeId} canWrite={d.can_write} />

      {d.can_write && <ReportForm officeId={officeId} canPublish={d.can_publish} />}

      <section className="mt-10">
        <h2 className="text-lg font-bold">{t.reports}</h2>
        {(data?.reports ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t.noReports}</p>
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
                    {t.status[r.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(r.created_at, locale)}
                </p>
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
                {r.attachments.length > 0 && <Gallery paths={r.attachments} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}

function ReportForm({ officeId, canPublish }: { officeId: string; canPublish: boolean }) {
  const t = useCopy(COPY);
  const save = useServerFn(saveOfficeReport);
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [metrics, setMetrics] = useState<Array<{ key: string; value: string }>>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const draftKey = `office-draft:${officeId}`;

  // المسودّة تُحفظ في المتصفّح أثناء الكتابة: انقطاع الشبكة في الميدان لا
  // يُضيع ما كُتب. والصور تُرفع حين يعود الاتصال.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as { title?: string; body?: string; metrics?: typeof metrics };
      if (d.title) setTitle(d.title);
      if (d.body) setBody(d.body);
      if (d.metrics) setMetrics(d.metrics);
    } catch {
      /* تخزين المتصفّح غير متاح: لا مسودّة، ولا خطأ */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ title, body, metrics }));
    } catch {
      /* لا شيء */
    }
  }, [draftKey, title, body, metrics]);
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
        setMsg(t.uploadFailed);
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
      data: { officeId, title, body, metrics: m, attachments: files, status, consent },
    });
    setBusy(false);
    if (!res.ok) {
      setMsg(t.saveFailed);
      return;
    }
    setTitle("");
    setBody("");
    setMetrics([]);
    setFiles([]);
    setConsent(false);
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* لا شيء */
    }
    setMsg(t.saved);
    await qc.invalidateQueries({ queryKey: ["office", officeId] });
  }

  return (
    <section className="mt-10 rounded-xl border border-border bg-background p-5">
      <h2 className="text-lg font-bold">{t.newReport}</h2>
      <div className="mt-4 grid gap-4">
        <div>
          <Label htmlFor="r-title">{t.rTitle}</Label>
          <Input id="r-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="r-body">{t.rBody}</Label>
          <Textarea id="r-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>

        <div>
          <p className="text-sm font-medium">{t.metrics}</p>
          <p className="text-xs text-muted-foreground">{t.metricsHint}</p>
          <div className="mt-2 space-y-2">
            {metrics.map((row, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  aria-label={t.metricName}
                  value={row.key}
                  onChange={(e) =>
                    setMetrics((all) =>
                      all.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)),
                    )
                  }
                />
                <Input
                  aria-label={t.metricValue}
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
                  aria-label={t.removeMetric}
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
              {t.addMetric}
            </Button>
          </div>
        </div>

        <div>
          <Label htmlFor="r-files" className="flex items-center gap-2">
            <ImagePlus className="size-4" />
            {t.files(files.length)}
          </Label>
          <Input
            id="r-files"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            capture="environment"
            onChange={(e) => upload(e.target.files)}
          />
          {files.length > 0 && (
            <label className="mt-2 flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              {t.consent}
            </label>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || title.trim().length < 3 || (files.length > 0 && !consent)}
            variant="outline"
            onClick={() => submit("draft")}
          >
            {t.saveDraft}
          </Button>
          <Button
            disabled={busy || title.trim().length < 3 || (files.length > 0 && !consent)}
            onClick={() => submit("submitted")}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t.submit}
          </Button>
          {canPublish && (
            <Button
              disabled={busy || title.trim().length < 3 || (files.length > 0 && !consent)}
              variant="secondary"
              onClick={() => submit("published")}
            >
              {t.publish}
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

/**
 * معرض صور التقرير — لأعضاء المكتب وحدهم: روابط موقّعة قصيرة العمر من
 * الخزنة الخاصّة، لا روابط ثابتة تُتداول.
 */
function Gallery({ paths }: { paths: string[] }) {
  const t = useCopy(COPY);
  const { data: urls = [] } = useQuery({
    queryKey: ["office-gallery", ...paths],
    queryFn: async () => {
      const { data } = await supabase.storage.from("office-media").createSignedUrls(paths, 300);
      return (data ?? []).flatMap((d) =>
        d.signedUrl ? [{ path: d.path ?? "", url: d.signedUrl }] : [],
      );
    },
  });
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
      {urls.map((u) =>
        /\.pdf$/i.test(u.path ?? "") ? (
          <a
            key={u.url}
            href={u.url}
            target="_blank"
            rel="noreferrer"
            className="flex aspect-square items-center justify-center rounded-lg border border-border text-xs"
          >
            PDF
          </a>
        ) : (
          <a key={u.url} href={u.url} target="_blank" rel="noreferrer">
            <img
              src={u.url}
              alt={t.photoAlt}
              loading="lazy"
              className="aspect-square w-full rounded-lg object-cover"
            />
          </a>
        ),
      )}
    </div>
  );
}
