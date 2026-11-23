import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, FileText, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { openPrivateFile } from "@/hooks/usePrivateFile";
import {
  DOC_LABELS,
  REJECTION_CODES,
  REJECTION_LABELS,
  REQUIRED_DOCS,
  listOrphanDocuments,
  unverifiedRequiredDocs,
  verifyDocument,
} from "@/lib/intake.functions";

/**
 * لوحة مراجعة ملف يتيم.
 *
 * قبلها كان القرار زرَّي «اعتماد» و«رفض» وسبب الرفض يُكتب في
 * `window.prompt` — أي اعتماد بلا نظر في وثيقة، ورفض بنصّ حرّ لا تفهم
 * منه الجهة ما تُصحّح.
 *
 * وهنا: الوثائق تُفتح وتُوثَّق واحدةً واحدة، والرفض يلزمه سبب مُهيكل.
 * و«اعتماد» لا يُضغط قبل توثيق شهادة الوفاة وإثبات الوصاية — الشرط نفسه
 * الذي ترفض به القاعدة (`review_orphan`)، فلا يَعِد الزرّ بما لا يقع.
 */
export function OrphanReviewPanel({
  orphanId,
  onDecided,
}: {
  orphanId: string;
  onDecided: (decision: "approved" | "rejected", code?: string, reason?: string) => void;
}) {
  const fetchDocs = useServerFn(listOrphanDocuments);
  const verify = useServerFn(verifyDocument);

  const [code, setCode] = useState<string>("documents_missing");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"idle" | "rejecting">("idle");
  const [busy, setBusy] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["orphan-docs", orphanId],
    queryFn: () => fetchDocs({ data: { orphanId } }),
  });

  const docs = data?.documents ?? [];
  const unverified = unverifiedRequiredDocs(docs);
  const canApprove = !isLoading && unverified.length === 0;

  async function open(path: string) {
    // يُنزَّل بجلسة القارئ لحظة الفتح؛ لا رابط موقَّعاً يبقى بعد سحب الإذن.
    if (!(await openPrivateFile("orphan-documents", path))) toast.error("تعذّر فتح الوثيقة");
  }

  return (
    <div className="border-border bg-secondary/30 mt-3 rounded-xl border p-4">
      <h4 className="text-sm font-bold">المستندات</h4>

      {isLoading ? (
        <p className="text-muted-foreground mt-2 flex items-center gap-2 text-xs">
          <Loader2 className="size-3 animate-spin" aria-hidden="true" /> جارٍ التحميل…
        </p>
      ) : docs.length === 0 ? (
        <p className="text-bridge-ink mt-2 text-xs font-medium">
          لا مستندات مرفوعة — لا يُعتمد ملف بلا وثيقة تُثبته.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="border-border bg-card flex flex-wrap items-center gap-2 rounded-lg border p-2"
            >
              <FileText className="text-muted-foreground size-4" aria-hidden="true" />
              <span className="flex-1 text-sm">
                {DOC_LABELS[d.kind] ?? d.kind}
                <span className="text-muted-foreground ms-2 text-xs">{d.file_name}</span>
              </span>
              {d.verified ? (
                <Badge className="bg-shore-thrive text-white">موثَّق</Badge>
              ) : (
                <Badge variant="secondary">بانتظار التوثيق</Badge>
              )}
              <Button size="sm" variant="ghost" onClick={() => void open(d.storage_path)}>
                <ExternalLink className="size-4" aria-hidden="true" />
                <span className="sr-only">فتح {DOC_LABELS[d.kind] ?? d.kind}</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const res = await verify({ data: { id: d.id, verified: !d.verified } });
                  if (!res.ok) toast.error(res.error);
                  else void refetch();
                }}
              >
                {d.verified ? "إلغاء التوثيق" : "توثيق"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* شرط النشر: كلّ إلزاميةٍ موثَّقة — المرفوع وحده لا يكفي. */}
      <ul className="mt-4 space-y-1 text-xs" aria-label="شرط الاعتماد">
        {REQUIRED_DOCS.map((k) => {
          const ok = !unverified.includes(k);
          return (
            <li key={k} className="flex items-center gap-1.5">
              {ok ? (
                <CheckCircle2 className="text-shore-thrive size-3.5" aria-hidden="true" />
              ) : (
                <XCircle className="text-muted-foreground size-3.5" aria-hidden="true" />
              )}
              <span className={ok ? "" : "text-muted-foreground"}>
                {DOC_LABELS[k] ?? k} — {ok ? "موثَّقة" : "لم تُوثَّق بعد"}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy || !canApprove}
          title={canApprove ? undefined : "وثّق شهادة الوفاة وإثبات الوصاية أولاً"}
          onClick={() => {
            setBusy(true);
            onDecided("approved");
            setBusy(false);
          }}
        >
          <CheckCircle2 className="size-4" aria-hidden="true" /> اعتماد
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMode(mode === "rejecting" ? "idle" : "rejecting")}
          aria-expanded={mode === "rejecting"}
        >
          <XCircle className="size-4" aria-hidden="true" /> رفض
        </Button>
      </div>

      {mode === "rejecting" && (
        <div className="border-border mt-3 space-y-3 rounded-lg border border-dashed p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`code-${orphanId}`} className="text-xs">
              سبب الرفض
            </Label>
            {/* السبب المُهيكل إلزامي في القاعدة: «مرفوض» وحدها لا تُمكّن
                الجهة من التصحيح، فيعود الملف مرفوضاً مرّة بعد مرّة. */}
            <select
              id={`code-${orphanId}`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              {REJECTION_CODES.map((c) => (
                <option key={c} value={c}>
                  {REJECTION_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`reason-${orphanId}`} className="text-xs">
              تفصيل (اختياري) — يقرؤه من رفع الملف
            </Label>
            <Textarea
              id={`reason-${orphanId}`}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="شهادة الوفاة غير واضحة، يُرجى رفع نسخة أوضح."
            />
          </div>
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onDecided("rejected", code, reason.trim() || undefined);
              setBusy(false);
            }}
          >
            تأكيد الرفض
          </Button>
        </div>
      )}
    </div>
  );
}
