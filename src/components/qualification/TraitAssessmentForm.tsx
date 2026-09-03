import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Ruler } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { recordTraitAssessment } from "@/lib/qualification-ops.functions";
import type { AssessmentRow } from "@/integrations/supabase/types.extra";
import { formatDate } from "@/lib/format";
import { TraitComparison } from "./TraitComparison";
import { cn } from "@/lib/utils";

/**
 * السمات الست بأسمائها. تُكرَّر هنا لأن النموذج يحتاجها قبل أي طلب،
 * والقاعدة تبقى الحكم: مفتاحٌ لا تعرفه تُرفَض به الخريطة كلها.
 */
const TRAITS: Array<{ slug: string; name: string }> = [
  { slug: "dirayah", name: "الدراية" },
  { slug: "himmah", name: "الحمية" },
  { slug: "azm", name: "العزم" },
  { slug: "rushd", name: "الرشد" },
  { slug: "maalat", name: "المآلات" },
  { slug: "tadbir", name: "التدبير" },
];

const PHASES = [
  { value: "baseline", label: "قياس أوّلي" },
  { value: "progress", label: "قياس مرحلي" },
  { value: "final", label: "قياس ختامي" },
] as const;

/**
 * مقياس السمات — للمشرف المعتمَد.
 *
 * المجموع مئةٌ، والقاعدة هي من تفرضه. والمجموع الحيّ هنا ليس حارساً بل
 * عوناً: يمنع المشرف من إرسال خريطةٍ يعرف سلفاً أنها سترفض.
 *
 * والسمة الجوهرية لا تُدخَل ولا تُختار: تُحسب من الأرقام في القاعدة.
 */
export function TraitAssessmentForm({
  enrollmentId,
  assessments,
  onDone,
}: {
  enrollmentId: string;
  assessments: AssessmentRow[];
  onDone: () => void;
}) {
  const record = useServerFn(recordTraitAssessment);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<(typeof PHASES)[number]["value"]>("baseline");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const total = TRAITS.reduce((sum, t) => sum + (Number(scores[t.slug]) || 0), 0);
  const balanced = total === 100;

  async function submit() {
    setBusy(true);
    try {
      const payload: Record<string, number> = {};
      for (const t of TRAITS) {
        const n = Number(scores[t.slug]) || 0;
        if (n > 0) payload[t.slug] = n;
      }
      const res = await record({ data: { enrollmentId, scores: payload, phase } });
      if (!res.ok) {
        toast.error(res.error ?? "تعذّر تسجيل القياس");
        return;
      }
      const r = res.result;
      toast.success(
        r?.below_threshold
          ? "سُجّل القياس — لم تستقرّ سمةٌ قائدة بعد"
          : `سُجّل القياس — السمة الجوهرية: ${r?.core_trait ?? "—"}`,
      );
      setScores({});
      setOpen(false);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold tracking-widest text-muted-foreground">مقياس السمات</p>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          <Ruler className="size-3.5" aria-hidden="true" />
          {open ? "إغلاق" : "قياس جديد"}
        </Button>
      </div>

      {assessments.length > 0 && (
        <ul className="mt-3 space-y-2">
          {assessments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">
                {PHASES.find((p) => p.value === a.phase)?.label ?? a.phase}
              </Badge>
              <span className="text-muted-foreground">{formatDate(a.assessed_at)}</span>
              {a.below_threshold ? (
                <span className="text-bridge-ink">لم تستقرّ سمةٌ قائدة بعد — والبناء متّصل</span>
              ) : (
                <span>
                  الجوهرية: <strong className="text-shore-thrive">{a.core_trait}</strong>
                  {a.relational_trait && <> · الاتصالية: {a.relational_trait}</>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* المقارنة قبل النموذج: القياس الجديد يُكتب على ضوء ما قبله. */}
      {assessments.length > 0 && <TraitComparison assessments={assessments} />}

      {open && (
        <form
          className="mt-4 rounded-xl border border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset>
            <legend className="text-xs font-medium">مرحلة القياس</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PHASES.map((p) => (
                <label key={p.value} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="radio"
                    name="phase"
                    value={p.value}
                    checked={phase === p.value}
                    onChange={() => setPhase(p.value)}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {TRAITS.map((t) => (
              <div key={t.slug}>
                <Label htmlFor={`t-${t.slug}`} className="text-xs">
                  {t.name}
                </Label>
                <Input
                  id={`t-${t.slug}`}
                  type="number"
                  min={0}
                  max={100}
                  inputMode="numeric"
                  value={scores[t.slug] ?? ""}
                  onChange={(e) => setScores((s) => ({ ...s, [t.slug]: e.target.value }))}
                  className="mt-1 h-8"
                />
              </div>
            ))}
          </div>

          {/* المجموع الحيّ: عونٌ لا حارس — القاعدة هي من ترفض. */}
          <p
            role="status"
            className={cn(
              "mt-4 text-sm font-medium",
              balanced ? "text-shore-thrive" : "text-bridge-ink",
            )}
          >
            المجموع: {total} / 100
            {!balanced && " — الخريطة نسبية، فمجموعها مئةٌ دائماً"}
          </p>

          <Button type="submit" size="sm" className="mt-4" disabled={busy || !balanced}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            تسجيل القياس
          </Button>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            السمة الجوهرية والاتصالية تُحسبان من هذه الأرقام في الخادم — لا تُدخَلان.
          </p>
        </form>
      )}
    </div>
  );
}
