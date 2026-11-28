import { createLazyFileRoute } from "@tanstack/react-router";
import { Check, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { CycleOfficeTask } from "@/components/try/TryCycleTasks";
import { TryRoleHeader } from "@/components/try/TryRoleHeader";
import { Button } from "@/components/ui/button";
import { sampleRows } from "@/lib/admin-console-sample";
import type { OrphanRecord } from "@/lib/admin-console.functions";
import { countryName } from "@/lib/countries";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { loadPledges, targetLabel, type TryPledge } from "@/lib/try-support";
import { loadOffice, saveOffice, useTrialValue } from "@/lib/try-role-state";
import { cn } from "@/lib/utils";
import { useState } from "react";

export const Route = createLazyFileRoute("/try/office")({ component: TryOffice });

const COPY = defineCopy("routes/try.office", {
  ar: {
    steps: ["استُلم", "جُدول", "نُفِّذ", "أُرسل التقرير"],
    kind: { qualification: "تأهيل", in_kind: "دعم عيني" } as Record<string, string>,
    samples: { "s-1": "منطقة داكار", "s-2": "مجموعة تيرانا 3", "s-3": "كينيا" } as Record<
      string,
      string
    >,
    approvedToast: (n: string) => `رُفع ملفّ ${n} للإدارة`,
    returnedToast: (n: string) => `أُعيد ملفّ ${n} إلى الجهة بملاحظة`,
    toastNote: "محاكاة: في الحقيقة يُسجَّل القرار ويُشعَر الطرف الآخر",
    role: "المكتب الميداني",
    title: "مكتب المنطقة",
    lead: "المكتب يراجع ملفّات الجهات قبل الإدارة، ويتابع الأطفال المكفولين بتقارير شهرية، وينفّذ ما تعهّد به الداعمون من تأهيلٍ ودعمٍ عيني في منطقته.",
    real: "المكتب يرى منطقته وحدها، وكلّ قرارٍ باسم صاحبه في السجلّ",
    files: "ملفّات جديدة من جهات المنطقة",
    filesLead: "راجعها وارفعها للإدارة، أو أعدها للجهة لتستكمل.",
    docs: (n: number) => `مستندات ${n}`,
    approved: "رُفع للإدارة",
    returned: "أُعيد للجهة",
    approve: "ارفعه للإدارة",
    return: "أعده للجهة",
    deliver: "التأهيل والدعم العيني في المنطقة",
    deliverLead: "كلّ تعهّدٍ يمضي في أربع خطوات، وكلّ خطوةٍ تظهر للداعم في «أثري».",
    deliverEmpty: " تعهّدك يظهر هنا أوّلاً حين تدعم مكاناً بدور الكافل.",
    mine: "تعهّدك أنت في هذه الجلسة · ",
    monthly: (n: number) => `${n} شهرياً`,
    stepsLabel: "خطوات التنفيذ",
    next: "الخطوة التالية",
    reasonsLabel: "سبب الإعادة",
    reasons: ["مستند ناقص", "بيانات غير متطابقة", "صورة غير واضحة"],
    confirmReturn: "أعده بهذا السبب",
    pickReason: "اختر سبباً أوّلاً",
    approveNamed: (n: string) => `ارفع ملفّ ${n} للإدارة`,
    returnNamed: (n: string) => `أعد ملفّ ${n} للجهة`,
    nextNamed: (n: string) => `الخطوة التالية: ${n}`,
  },
  en: {
    steps: ["Received", "Scheduled", "Delivered", "Report sent"],
    kind: { qualification: "Training", in_kind: "In-kind support" } as Record<string, string>,
    samples: { "s-1": "Dakar region", "s-2": "Tirana group 3", "s-3": "Kenya" } as Record<
      string,
      string
    >,
    approvedToast: (n: string) => `${n}'s file was passed to administration`,
    returnedToast: (n: string) => `${n}'s file was returned to the organization with a note`,
    toastNote:
      "Simulated: on the live platform the decision is logged and the other side is notified",
    role: "Field office",
    title: "The area office",
    lead: "The office reviews organizations' files before administration, follows sponsored children with monthly reports, and delivers the training and in-kind support that supporters pledged in its area.",
    real: "an office sees only its own area, and every decision is logged under its author's name",
    files: "New files from the area's organizations",
    filesLead:
      "Review them and pass them to administration, or return them to the organization to complete.",
    docs: (n: number) => `${n} documents`,
    approved: "Passed to administration",
    returned: "Returned to the organization",
    approve: "Pass to admin",
    return: "Return",
    deliver: "Training and in-kind support in the area",
    deliverLead:
      "Each pledge moves through four steps, and each step shows to the supporter in My impact.",
    deliverEmpty: " Your own pledge appears here first when you support a place as the supporter.",
    mine: "Your pledge in this session · ",
    monthly: (n: number) => `${n} a month`,
    stepsLabel: "Delivery steps",
    next: "Next step",
    reasonsLabel: "Reason for return",
    reasons: ["Missing document", "Details do not match", "Unclear photo"],
    confirmReturn: "Return with this reason",
    pickReason: "Pick a reason first",
    approveNamed: (n: string) => `Pass ${n}'s file to admin`,
    returnNamed: (n: string) => `Return ${n}'s file to the organization`,
    nextNamed: (n: string) => `Next step: ${n}`,
  },
});

/** تعهّداتٌ نموذجية في المنطقة، بشكل تعهّدات الزائر نفسه */
const SAMPLE_PLEDGES = [
  { id: "s-1", kind: "qualification", co: "SN", amount: 120 },
  { id: "s-2", kind: "in_kind", co: "AL", amount: 60 },
  { id: "s-3", kind: "qualification", co: "", amount: 200 },
];

/**
 * واجهة المكتب الميداني في العرض: ملفّات جديدة من جهات المنطقة تُراجَع، وتقرير الدورة يُرسل،
 * وتعهّدات التأهيل والدعم العيني (ومنها تعهّد الزائر) تمضي في خطوات التنفيذ. كلّه في الجلسة.
 */
function TryOffice() {
  const t = useCopy(COPY);
  const locale = useLocale();
  const office = useTrialValue(loadOffice, { files: {}, deliveries: {} });
  const pledges = useTrialValue<TryPledge[]>(loadPledges, []);
  const files = (sampleRows("orphans") as OrphanRecord[])
    .filter((o) => o.status === "submitted")
    .slice(0, 5);

  const [returning, setReturning] = useState<string | null>(null);
  const [reason, setReason] = useState<number | null>(null);
  const decide = (id: string, d: "approved" | "returned", name: string) => {
    saveOffice({ ...office, files: { ...office.files, [id]: d } });
    toast.success(d === "approved" ? t.approvedToast(name) : t.returnedToast(name), {
      description: t.toastNote,
    });
  };
  const advance = (id: string) => {
    const at = Math.min(t.steps.length - 1, (office.deliveries[id] ?? 0) + 1);
    saveOffice({ ...office, deliveries: { ...office.deliveries, [id]: at } });
  };

  const rows = [
    ...pledges.map((p) => {
      const tl = targetLabel(p, locale);
      return {
        id: p.id,
        kind: p.kind,
        label: tl.label,
        place: tl.place ?? "",
        amount: p.amount,
        mine: true,
      };
    }),
    ...SAMPLE_PLEDGES.map((p) => ({
      ...p,
      label: t.samples[p.id] ?? "",
      place: p.co && p.id !== "s-3" ? countryName(p.co, locale) : "",
      mine: false,
    })),
  ];

  return (
    <div>
      <TryRoleHeader role={t.role} title={t.title} lead={t.lead} real={t.real} />

      <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="office-files"
          className="rounded-2xl border border-border bg-card p-5 shadow-soft"
        >
          <h2 id="office-files" className="text-lg font-bold">
            {t.files}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.filesLead}</p>
          <ul className="mt-4 divide-y divide-border">
            {files.map((o) => {
              const d = office.files[o.id];
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm">
                  <span className="min-w-0 basis-full">
                    <span className="font-bold">{o.name}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {o.org} · {countryName(o.country ?? "", locale)}
                    </span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {o.code} · {t.docs(o.verification.documents)}
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
                      {d === "approved" ? t.approved : t.returned}
                    </span>
                  ) : (
                    <span className="flex flex-wrap gap-2">
                      <Button
                        className="min-h-11"
                        aria-label={t.approveNamed(o.name)}
                        onClick={() => decide(o.id, "approved", o.name)}
                      >
                        {t.approve}
                      </Button>
                      {returning === o.id ? (
                        <span className="flex basis-full flex-wrap items-center gap-2">
                          <span
                            role="radiogroup"
                            aria-label={t.reasonsLabel}
                            className="flex flex-wrap gap-2"
                          >
                            {t.reasons.map((r, i) => (
                              <button
                                key={r}
                                type="button"
                                role="radio"
                                aria-checked={reason === i}
                                onClick={() => setReason(i)}
                                className={cn(
                                  "min-h-11 rounded-full border px-3 text-xs",
                                  reason === i
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border",
                                )}
                              >
                                {r}
                              </button>
                            ))}
                          </span>
                          <Button
                            variant="outline"
                            className="min-h-11"
                            aria-disabled={reason === null}
                            aria-label={`${t.returnNamed(o.name)}${reason === null ? ` (${t.pickReason})` : ""}`}
                            onClick={() => {
                              if (reason === null) return;
                              decide(o.id, "returned", `${o.name} (${t.reasons[reason]})`);
                              setReturning(null);
                              setReason(null);
                            }}
                          >
                            {reason === null ? t.pickReason : t.confirmReturn}
                          </Button>
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          className="min-h-11"
                          aria-label={t.returnNamed(o.name)}
                          onClick={() => {
                            setReturning(o.id);
                            setReason(null);
                          }}
                        >
                          {t.return}
                        </Button>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <CycleOfficeTask />
      </div>

      <section
        aria-labelledby="office-deliver"
        className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft"
      >
        <h2 id="office-deliver" className="text-lg font-bold">
          {t.deliver}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.deliverLead}
          {pledges.length === 0 && t.deliverEmpty}
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
                    {t.kind[p.kind] ?? p.kind} · {p.label}
                  </span>
                  {p.place && <span className="text-muted-foreground"> · {p.place}</span>}
                  <span className="block text-xs text-muted-foreground">
                    {p.mine ? t.mine : ""}
                    {t.monthly(p.amount)}
                  </span>
                </span>
                <ol className="flex flex-wrap items-center gap-1" aria-label={t.stepsLabel}>
                  {t.steps.map((s, i) => (
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
                  variant="outline"
                  className="min-h-11"
                  aria-label={t.nextNamed(p.label)}
                  disabled={at >= t.steps.length - 1}
                  onClick={() => advance(p.id)}
                >
                  {t.next}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
