import { createLazyFileRoute } from "@tanstack/react-router";
import { Check, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { CycleOfficeTask } from "@/components/try/TryCycleTasks";
import { TryRoleHeader } from "@/components/try/TryRoleHeader";
import { Button } from "@/components/ui/button";
import { sampleRows } from "@/lib/admin-console-sample";
import type { OrphanRecord } from "@/lib/admin-console.functions";
import { countryName } from "@/lib/countries";
import { loadPledges, targetLabel, type TryPledge } from "@/lib/try-support";
import { loadOffice, saveOffice, useTrialValue } from "@/lib/try-role-state";
import { cn } from "@/lib/utils";

export const Route = createLazyFileRoute("/try/office")({ component: TryOffice });

const STEPS = ["استُلم", "جُدول", "نُفِّذ", "أُرسل التقرير"] as const;
const KIND: Record<string, string> = { qualification: "تأهيل", in_kind: "دعم عيني" };

/** تعهّداتٌ نموذجية في المنطقة، بشكل تعهّدات الزائر نفسه */
const SAMPLE_PLEDGES: Array<{
  id: string;
  kind: string;
  label: string;
  place: string;
  amount: number;
}> = [
  { id: "s-1", kind: "qualification", label: "منطقة داكار", place: "السنغال", amount: 120 },
  { id: "s-2", kind: "in_kind", label: "مجموعة تيرانا 3", place: "ألبانيا", amount: 60 },
  { id: "s-3", kind: "qualification", label: "كينيا", place: "", amount: 200 },
];

/**
 * واجهة المكتب الميداني في العرض: ملفّات جديدة من جهات المنطقة تُراجَع، وتقرير الدورة يُرسل،
 * وتعهّدات التأهيل والدعم العيني (ومنها تعهّد الزائر) تمضي في خطوات التنفيذ. كلّه في الجلسة.
 */
function TryOffice() {
  const office = useTrialValue(loadOffice, { files: {}, deliveries: {} });
  const pledges = useTrialValue<TryPledge[]>(loadPledges, []);
  const files = (sampleRows("orphans") as OrphanRecord[])
    .filter((o) => o.status === "submitted")
    .slice(0, 5);

  const decide = (id: string, d: "approved" | "returned", name: string) => {
    saveOffice({ ...office, files: { ...office.files, [id]: d } });
    toast.success(
      d === "approved" ? `رُفع ملفّ ${name} للإدارة` : `أُعيد ملفّ ${name} إلى الجهة بملاحظة`,
      { description: "محاكاة: في الحقيقة يُسجَّل القرار ويُشعَر الطرف الآخر" },
    );
  };
  const advance = (id: string) => {
    const at = Math.min(STEPS.length - 1, (office.deliveries[id] ?? 0) + 1);
    saveOffice({ ...office, deliveries: { ...office.deliveries, [id]: at } });
  };

  const rows = [
    ...pledges.map((p) => {
      const t = targetLabel(p, "ar");
      return {
        id: p.id,
        kind: p.kind,
        label: t.label,
        place: t.place ?? "",
        amount: p.amount,
        mine: true,
      };
    }),
    ...SAMPLE_PLEDGES.map((p) => ({ ...p, mine: false })),
  ];

  return (
    <div>
      <TryRoleHeader
        role="المكتب الميداني"
        title="مكتب المنطقة"
        lead="المكتب يراجع ملفّات الجهات قبل الإدارة، ويتابع الأطفال المكفولين بتقارير شهرية، وينفّذ ما تعهّد به الداعمون من تأهيلٍ ودعمٍ عيني في منطقته."
        real="المكتب يرى منطقته وحدها، وكلّ قرارٍ باسم صاحبه في السجلّ"
      />

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        <CycleOfficeTask />

        <section
          aria-labelledby="office-files"
          className="rounded-2xl border border-border bg-card p-5 shadow-soft"
        >
          <h2 id="office-files" className="text-lg font-bold">
            ملفّات جديدة من جهات المنطقة
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            راجعها وارفعها للإدارة، أو أعدها للجهة لتستكمل.
          </p>
          <ul className="mt-4 divide-y divide-border">
            {files.map((o) => {
              const d = office.files[o.id];
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-bold">{o.name}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {o.org} · {countryName(o.country ?? "", "ar")}
                    </span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {o.code} · مستندات {o.verification.documents}
                    </span>
                  </span>
                  {d ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-bold",
                        d === "approved" ? "text-shore-thrive" : "text-bridge-ink",
                      )}
                    >
                      {d === "approved" ? (
                        <ShieldCheck className="size-3.5" aria-hidden="true" />
                      ) : (
                        <RotateCcw className="size-3.5" aria-hidden="true" />
                      )}
                      {d === "approved" ? "رُفع للإدارة" : "أُعيد للجهة"}
                    </span>
                  ) : (
                    <span className="flex gap-2">
                      <Button size="sm" onClick={() => decide(o.id, "approved", o.name)}>
                        ارفعه للإدارة
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decide(o.id, "returned", o.name)}
                      >
                        أعده للجهة
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section
        aria-labelledby="office-deliver"
        className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft"
      >
        <h2 id="office-deliver" className="text-lg font-bold">
          التأهيل والدعم العيني في المنطقة
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          كلّ تعهّدٍ يمضي في أربع خطوات، وكلّ خطوةٍ تظهر للداعم في «أثري».
          {pledges.length === 0 && " تعهّدك يظهر هنا أوّلاً حين تدعم مكاناً بدور الكافل."}
        </p>
        <ul className="mt-4 grid gap-3">
          {rows.map((p) => {
            const at = office.deliveries[p.id] ?? 0;
            return (
              <li
                key={p.id}
                className={cn(
                  "flex flex-wrap items-center gap-4 rounded-xl border px-4 py-3 text-sm",
                  p.mine ? "border-bridge/60 bg-bridge/8" : "border-border",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="font-bold">
                    {KIND[p.kind] ?? p.kind} · {p.label}
                  </span>
                  {p.place && <span className="text-muted-foreground"> · {p.place}</span>}
                  <span className="block text-xs text-muted-foreground">
                    {p.mine ? "تعهّدك أنت في هذه الجلسة · " : ""}
                    {p.amount} شهرياً
                  </span>
                </span>
                <ol className="flex items-center gap-1" aria-label="خطوات التنفيذ">
                  {STEPS.map((s, i) => (
                    <li
                      key={s}
                      aria-current={i === at ? "step" : undefined}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                        i < at
                          ? "text-primary"
                          : i === at
                            ? "bg-primary font-bold text-primary-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {i < at && <Check className="size-3" aria-hidden="true" />}
                      {s}
                    </li>
                  ))}
                </ol>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={at >= STEPS.length - 1}
                  onClick={() => advance(p.id)}
                >
                  الخطوة التالية
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
