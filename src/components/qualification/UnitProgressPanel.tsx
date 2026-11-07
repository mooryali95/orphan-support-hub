import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ChevronDown, Loader2, RotateCcw, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  getEnrollmentUnits,
  recordUnitProgress,
  UNIT_STATUS_LABELS,
} from "@/lib/supervisor.functions";
import type { EnrollmentUnit } from "@/integrations/supabase/types.extra";
import { formatDate } from "@/lib/format";

/**
 * ورش الجلسات — التسليم والتقويم.
 *
 * البرنامج ليس وحدةً واحدة: ستّ ورش لكلٍّ مادةٌ ومهمّةٌ ومخرجات. وبلا
 * هذه الشاشة تبقى المرحلة دعوى يرفعها المشرف بلا أثرٍ بينها.
 *
 * والترتيب يُعرض قبل أن يُمنَع: زرّ القبول يُعطَّل بسببٍ مكتوب، فلا
 * يُفاجأ المشرف برفضٍ من القاعدة لا يفهم مصدره.
 */
export function UnitProgressPanel({
  enrollmentId,
  onDone,
}: {
  enrollmentId: string;
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchUnits = useServerFn(getEnrollmentUnits);
  const record = useServerFn(recordUnitProgress);

  const { data, isPending } = useQuery({
    queryKey: ["enrollment-units", enrollmentId],
    queryFn: () => fetchUnits({ data: { enrollmentId } }),
  });

  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [note, setNote] = useState("");

  const units = data?.units ?? [];
  const accepted = units.filter((u) => u.status === "accepted").length;
  const awaiting = units.filter((u) => u.status === "submitted").length;

  async function act(unit: EnrollmentUnit, status: "submitted" | "returned" | "accepted") {
    setBusy(true);
    try {
      const res = await record({
        data: {
          enrollmentId,
          unitId: unit.unit_id,
          status,
          ...(evidence.trim() ? { evidence: evidence.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "تعذّر التسجيل");
        return;
      }
      toast.success(
        status === "accepted"
          ? "قُبلت الجلسة"
          : status === "returned"
            ? "أُعيدت للمراجعة"
            : "سُجّل التسليم",
      );
      setEvidence("");
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["enrollment-units", enrollmentId] });
      onDone?.();
    } finally {
      setBusy(false);
    }
  }

  if (isPending) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        جارٍ تحميل الجلسات…
      </div>
    );
  }

  if (units.length === 0) return null;

  return (
    <section aria-labelledby={`units-${enrollmentId}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 id={`units-${enrollmentId}`} className="text-xs font-bold">
          ورش الجلسات
        </h4>
        <Badge variant="secondary">
          {accepted} من {units.length} مقبولة
        </Badge>
        {awaiting > 0 && <Badge>{awaiting} تنتظر تقويمك</Badge>}
      </div>

      <ul className="mt-3 space-y-1.5">
        {units.map((u, i) => {
          const blocked = units.slice(0, i).some((p) => p.status !== "accepted");
          const isOpen = open === u.unit_id;
          const hasEvidence = Boolean(u.evidence) || evidence.trim().length > 0;
          return (
            <li key={u.unit_id} className="rounded-xl border border-border">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => {
                  setOpen(isOpen ? null : u.unit_id);
                  setEvidence("");
                  setNote("");
                }}
                className="flex w-full items-center gap-2 p-3 text-start"
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    u.status === "accepted"
                      ? "bg-shore-thrive text-white"
                      : "bg-secondary text-foreground"
                  }`}
                  aria-hidden="true"
                >
                  {u.status === "accepted" ? <Check className="size-3.5" /> : u.ordinal}
                </span>
                <span className="flex-1 text-xs font-medium">{u.title}</span>
                <span className="text-xs text-muted-foreground">
                  {UNIT_STATUS_LABELS[u.status]}
                </span>
                <ChevronDown
                  className={`size-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>

              {isOpen && (
                <div className="border-t border-border p-3">
                  <dl className="space-y-2 text-xs leading-6">
                    <div>
                      <dt className="inline font-bold">المحور: </dt>
                      <dd className="inline text-muted-foreground">{u.focus}</dd>
                    </div>
                    <div>
                      <dt className="inline font-bold">المادة: </dt>
                      <dd className="inline text-muted-foreground">{u.material}</dd>
                    </div>
                    <div>
                      <dt className="inline font-bold">المهمّة: </dt>
                      <dd className="inline text-muted-foreground">{u.task}</dd>
                    </div>
                    <div>
                      <dt className="font-bold">المخرجات</dt>
                      <dd className="text-muted-foreground">
                        <ul className="mt-0.5 list-disc ps-4">
                          {u.outputs.map((o) => (
                            <li key={o}>{o}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-bold">التسليم: </dt>
                      <dd className="inline text-muted-foreground">{u.submission}</dd>
                    </div>
                  </dl>

                  {u.evidence && (
                    <p className="mt-3 rounded-lg bg-secondary/60 p-2 text-xs leading-6">
                      <span className="font-bold">المخرَج المسجَّل: </span>
                      {u.evidence}
                      {u.submitted_at && (
                        <span className="text-muted-foreground">
                          {" "}
                          — سُلّم {formatDate(u.submitted_at)}
                        </span>
                      )}
                    </p>
                  )}
                  {u.note && (
                    <p className="mt-2 text-xs leading-6 text-bridge-ink">
                      <span className="font-bold">ملاحظتك: </span>
                      {u.note}
                    </p>
                  )}

                  <div className="mt-3 space-y-2">
                    <div>
                      <Label htmlFor={`ev-${u.unit_id}`} className="text-xs">
                        المخرَج — رابطه أو وصفه
                      </Label>
                      <Input
                        id={`ev-${u.unit_id}`}
                        value={evidence}
                        onChange={(e) => setEvidence(e.target.value)}
                        placeholder={u.evidence ?? "عرض أو فيديو أو خريطة ذهنية"}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`nt-${u.unit_id}`} className="text-xs">
                        ملاحظة التقويم — تلزم عند الإعادة
                      </Label>
                      <Textarea
                        id={`nt-${u.unit_id}`}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        className="mt-1 text-xs"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !hasEvidence}
                      onClick={() => void act(u, "submitted")}
                    >
                      <Upload className="size-3.5" aria-hidden="true" />
                      تسجيل تسليم
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !note.trim()}
                      onClick={() => void act(u, "returned")}
                    >
                      <RotateCcw className="size-3.5" aria-hidden="true" />
                      إعادة للمراجعة
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy || blocked || !hasEvidence || u.status === "accepted"}
                      onClick={() => void act(u, "accepted")}
                    >
                      {busy && <Loader2 className="size-3.5 animate-spin" />}
                      <Check className="size-3.5" aria-hidden="true" />
                      قبول
                    </Button>
                  </div>

                  {/* القاعدة تُعرض قبل أن تُمنَع */}
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">
                    {blocked
                      ? "تُقبل هذه الجلسة بعد قبول ما دونها: الترتيب في المنهجية بناءٌ متراكم لا قائمة."
                      : !hasEvidence
                        ? "القبول يحتاج مخرَجاً مسجَّلاً — وقبولٌ بلا مخرَج توقيعٌ على بياض."
                        : "الإعادة تُقوّم ولا تمحو ما سُلّم."}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
