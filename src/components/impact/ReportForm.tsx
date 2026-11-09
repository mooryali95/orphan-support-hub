import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Paperclip, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitProgressReport } from "@/lib/impact.functions";
import { createDocumentUploadUrl } from "@/lib/intake.functions";

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
  const submit = useServerFn(submitProgressReport);
  const signUpload = useServerFn(createDocumentUploadUrl);

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
        toast.error("تعذّر رفع المرفق");
        return;
      }
      setFiles((f) => [...f, { path: signed.path, name: file.name }]);
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    if (!summary.trim() && !education.trim() && !health.trim() && !living.trim()) {
      toast.error("اكتب سطراً واحداً على الأقل — تقرير فارغ لا يُفيد الكافل");
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
      toast.success("أُرسل التقرير للمراجعة");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-border bg-secondary/30 mt-3 space-y-4 rounded-xl border p-4">
      <div className="space-y-1.5">
        <Label htmlFor={`period-${orphanId}`} className="text-xs">
          الفترة
        </Label>
        <Input
          id={`period-${orphanId}`}
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="w-44"
        />
        <p className="text-muted-foreground text-xs">
          تقرير واحد لكل فترة. وإعادة الإرسال قبل الاعتماد تستبدل السابق.
        </p>
      </div>

      <Row id={`sum-${orphanId}`} label="خلاصة الفترة" value={summary} onChange={setSummary} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Row
          id={`edu-${orphanId}`}
          label="التعليم"
          value={education}
          onChange={setEducation}
          rows={3}
        />
        <Row id={`hea-${orphanId}`} label="الصحة" value={health} onChange={setHealth} rows={3} />
        <Row id={`liv-${orphanId}`} label="المعيشة" value={living} onChange={setLiving} rows={3} />
      </div>

      <div>
        <p className="text-xs font-medium">المرفقات</p>
        <p className="text-muted-foreground mt-1 text-xs leading-6">
          تُحفظ في الخزنة الخاصة، ولا يفتحها الكافل إلا برابط موقّع بعد اعتماد التقرير.
        </p>
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
                aria-label={`إزالة ${f.name}`}
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
            أضف مرفقاً
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
          إرسال للمراجعة
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          إلغاء
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
