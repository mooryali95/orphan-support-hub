import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, FileText, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listPendingReports, reviewProgressReport } from "@/lib/impact.functions";
import { createDocumentReadUrl } from "@/lib/intake.functions";
import { formatDate } from "@/lib/format";

/**
 * طابور مراجعة التقارير.
 *
 * الاعتماد هنا هو ما يُطلق إشعار الكافل، فهو آخر بوابة قبل أن يصل الخبر.
 * ولذلك يُعرض نصّ التقرير كاملاً — لا عنوانه — قبل القرار.
 */
export function ReportQueue({ onDone }: { onDone: () => void }) {
  const fetchPending = useServerFn(listPendingReports);
  const review = useServerFn(reviewProgressReport);
  const readUrl = useServerFn(createDocumentReadUrl);

  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pending-reports"],
    queryFn: () => fetchPending(),
  });

  const reports = data?.reports ?? [];

  async function open(path: string) {
    const res = await readUrl({ data: { path } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function decide(id: string, decision: "approved" | "rejected", text?: string) {
    const res = await review({
      data: { id, decision, ...(text ? { note: text } : {}) },
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(decision === "approved" ? "نُشر التقرير وأُشعِر الكفلاء" : "أُعيد التقرير للجهة");
    setRejecting(null);
    setNote("");
    void refetch();
    onDone();
  }

  return (
    <section>
      <h2 className="text-lg font-bold">تقارير بانتظار المراجعة ({reports.length})</h2>

      {isLoading ? (
        <p className="text-muted-foreground mt-4 flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> جارٍ التحميل…
        </p>
      ) : reports.length === 0 ? (
        <p className="border-border text-muted-foreground mt-4 rounded-2xl border border-dashed p-10 text-center text-sm">
          لا تقارير معلّقة.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {reports.map((r) => {
            const orphan = r.orphans as { display_name: string; code: string } | null;
            return (
              <div key={r.id} className="border-border bg-card rounded-2xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold">{orphan?.display_name ?? "—"}</h3>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {orphan?.code} — فترة {r.period}
                  </span>
                  <span className="text-muted-foreground ms-auto text-xs">
                    رُفع {formatDate(r.created_at)}
                  </span>
                </div>

                {r.summary && <p className="mt-2 text-sm leading-7">{r.summary}</p>}
                <dl className="text-muted-foreground mt-2 space-y-1 text-xs leading-6">
                  {r.education_note && (
                    <div>
                      <dt className="inline font-medium">التعليم: </dt>
                      <dd className="inline">{r.education_note}</dd>
                    </div>
                  )}
                  {r.health_note && (
                    <div>
                      <dt className="inline font-medium">الصحة: </dt>
                      <dd className="inline">{r.health_note}</dd>
                    </div>
                  )}
                  {r.living_note && (
                    <div>
                      <dt className="inline font-medium">المعيشة: </dt>
                      <dd className="inline">{r.living_note}</dd>
                    </div>
                  )}
                </dl>

                {r.attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.attachments.map((path, i) => (
                      <Button
                        key={path}
                        size="sm"
                        variant="outline"
                        onClick={() => void open(path)}
                      >
                        <FileText className="size-3" aria-hidden="true" /> مرفق {i + 1}
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </Button>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void decide(r.id, "approved")}>
                    <CheckCircle2 className="size-4" aria-hidden="true" /> اعتماد ونشر
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-expanded={rejecting === r.id}
                    onClick={() => setRejecting(rejecting === r.id ? null : r.id)}
                  >
                    <XCircle className="size-4" aria-hidden="true" /> إعادة للتصحيح
                  </Button>
                </div>

                {rejecting === r.id && (
                  <div className="border-border mt-3 space-y-2 rounded-lg border border-dashed p-3">
                    <Label htmlFor={`note-${r.id}`} className="text-xs">
                      ما الذي يُصحَّح؟ — تقرؤه الجهة
                    </Label>
                    {/* الملاحظة إلزامية في القاعدة: إعادة بلا سبب تُعيد
                        التقرير كما هو، فتدور المراجعة بلا نهاية. */}
                    <Textarea
                      id={`note-${r.id}`}
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="التقرير لا يذكر شيئاً عن التعليم رغم أن الفترة دراسية."
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void decide(r.id, "rejected", note.trim())}
                    >
                      تأكيد الإعادة
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
