import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Paperclip, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDataFn } from "@/lib/data-port";
import { submitProgressReport } from "@/lib/impact.functions";
import { createDocumentUploadUrl } from "@/lib/intake.functions";
import { defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("components/impact/ReportForm", {
  ar: {
    uploadFailed: "تعذّر رفع المرفق",
    empty: "اكتب سطراً واحداً على الأقل — تقرير فارغ لا يُفيد الكافل",
    sent: "أُرسل التقرير للمراجعة",
    period: "الفترة",
    periodHint: "تقرير واحد لكل فترة. وإعادة الإرسال قبل الاعتماد تستبدل السابق.",
    summary: "خلاصة الفترة",
    education: "التعليم",
    health: "الصحة",
    living: "المعيشة",
    visibility:
      "يرى الكافل بعد الاعتماد الخلاصةَ والتعليم والمعيشة. أمّا الصحة والمرفقات فتبقى لدائرة الطفل (الجهة والوليّ والإدارة) ولا تصل الكافل.",
    attachments: "المرفقات",
    attachmentsHint: "تُحفظ في الخزنة الخاصة، ولا يفتحها إلا من حول الطفل برابطٍ موقّع.",
    remove: (name: string) => `إزالة ${name}`,
    add: "أضف مرفقاً",
    submit: "إرسال للمراجعة",
    cancel: "إلغاء",
  },
  en: {
    uploadFailed: "The attachment could not be uploaded",
    empty: "Write at least one line — an empty report doesn't help the sponsor",
    sent: "Report sent for review",
    period: "Period",
    periodHint: "One report per period. Sending again before approval replaces the previous one.",
    summary: "Summary of the period",
    education: "Education",
    health: "Health",
    living: "Living conditions",
    visibility:
      "After approval the sponsor sees the summary, education and living conditions. Health notes and attachments stay within the child's circle (the organization, the guardian and the administration) and never reach the sponsor.",
    attachments: "Attachments",
    attachmentsHint:
      "Kept in the private vault, and opened only by the people around the child through a signed link.",
    remove: (name: string) => `Remove ${name}`,
    add: "Add an attachment",
    submit: "Send for review",
    cancel: "Cancel",
  },
});

/** الفترة الافتراضية هي الشهر الماضي: التقرير يُكتب عن شهر انقضى. */
function lastMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ReportForm({
  orphanId,
  onDone,
  onCancel,
}: {
  orphanId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  // منفذ البيانات: الخادم دائماً في المنصّة، ونسخةٌ تجريبية في جلسة التجربة وحدها.
  const submit = useDataFn("impact.submitReport", submitProgressReport);
  const signUpload = useDataFn("intake.uploadUrl", createDocumentUploadUrl);
  const t = useCopy(COPY);

  const [period, setPeriod] = useState(lastMonth());
  const [summary, setSummary] = useState("");
  const [education, setEducation] = useState("");
  const [health, setHealth] = useState("");
  const [living, setLiving] = useState("");
  const [files, setFiles] = useState<Array<{ path: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const signed = await signUpload({
        data: { orphanId, kind: "other", fileName: `report-${period}-${file.name}` },
      });
      if (!signed.ok) {
        toast.error(signed.error);
        return;
      }
      const put = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) {
        toast.error(t.uploadFailed);
        return;
      }
      setFiles((f) => [...f, { path: signed.path, name: file.name }]);
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    if (!summary.trim() && !education.trim() && !health.trim() && !living.trim()) {
      toast.error(t.empty);
      return;
    }
    setBusy(true);
    try {
      const res = await submit({
        data: {
          orphanId,
          period,
          summary: summary.trim() || undefined,
          educationNote: education.trim() || undefined,
          healthNote: health.trim() || undefined,
          livingNote: living.trim() || undefined,
          attachments: files.map((f) => f.path),
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t.sent);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-border bg-secondary/30 mt-3 space-y-4 rounded-xl border p-4">
      <div className="space-y-1.5">
        <Label htmlFor={`period-${orphanId}`} className="text-xs">
          {t.period}
        </Label>
        <Input
          id={`period-${orphanId}`}
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="w-44"
        />
        <p className="text-muted-foreground text-xs">{t.periodHint}</p>
      </div>

      <Row id={`sum-${orphanId}`} label={t.summary} value={summary} onChange={setSummary} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Row
          id={`edu-${orphanId}`}
          label={t.education}
          value={education}
          onChange={setEducation}
          rows={3}
        />
        <Row id={`hea-${orphanId}`} label={t.health} value={health} onChange={setHealth} rows={3} />
        <Row id={`liv-${orphanId}`} label={t.living} value={living} onChange={setLiving} rows={3} />
      </div>
      {/* ما يراه الكافل يُقال لكاتب التقرير قبل أن يكتب، لا بعد أن يُنشر. */}
      <p className="text-muted-foreground text-xs leading-6">{t.visibility}</p>

      <div>
        <p className="text-xs font-medium">{t.attachments}</p>
        <p className="text-muted-foreground mt-1 text-xs leading-6">{t.attachmentsHint}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {files.map((f, i) => (
            <span
              key={f.path}
              className="border-border inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
            >
              <Paperclip className="size-3" aria-hidden="true" />
              {f.name}
              <button
                type="button"
                onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}
                aria-label={t.remove(f.name)}
              >
                <Trash2 className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          <label className="border-input hover:bg-secondary inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium">
            {uploading ? (
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="size-3" aria-hidden="true" />
            )}
            {t.add}
            <input
              type="file"
              className="sr-only"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={() => void send()} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {t.submit}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t.cancel}
        </Button>
      </div>
    </div>
  );
}

function Row({
  id,
  label,
  value,
  onChange,
  rows = 2,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
