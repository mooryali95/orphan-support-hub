import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2, Paperclip, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DOC_LABELS,
  DOC_KINDS,
  REQUIRED_DOCS,
  NEED_CATEGORIES,
  startOrphanDraft,
  submitOrphanIntake,
  createDocumentUploadUrl,
} from "@/lib/intake.functions";
import { formatMoney, NEED_CATEGORY_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * نموذج إدخال ملف اليتيم — سبع خطوات.
 *
 * التقسيم ليس تجميلاً: الملف الكامل يطلب نحو عشرين حقلاً ووثيقتين على
 * الأقلّ، وعرضها دفعةً واحدة يجعل المُدخِل يهجر النموذج أو يملأه على
 * عجل — وكلاهما يُنتج ملفّاً ناقصاً يُردّ من المراجعة.
 *
 * والمسودّة تُحفظ في المتصفّح بين الخطوات، فانقطاع الجلسة لا يُضيّع عملاً.
 */

type Need = { category: string; title: string; monthlyAmount: number; notes?: string };
type Doc = {
  kind: string;
  storagePath: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
};

type Draft = {
  orphanId?: string;
  code?: string;
  displayName: string;
  gender: "male" | "female";
  birthDate: string;
  city: string;
  region: string;
  fullName: string;
  nationalId: string;
  guardianName: string;
  guardianRelation: string;
  guardianPhone: string;
  address: string;
  familySize: string;
  familyIncome: string;
  educationStage: string;
  schoolName: string;
  healthNotes: string;
  needs: Need[];
  story: string;
  privateNotes: string;
  documents: Doc[];
};

const EMPTY: Draft = {
  displayName: "",
  gender: "male",
  birthDate: "",
  city: "",
  region: "",
  fullName: "",
  nationalId: "",
  guardianName: "",
  guardianRelation: "",
  guardianPhone: "",
  address: "",
  familySize: "",
  familyIncome: "",
  educationStage: "",
  schoolName: "",
  healthNotes: "",
  needs: [],
  story: "",
  privateNotes: "",
  documents: [],
};

const STEPS = [
  "بيانات أساسية",
  "الوصاية",
  "الوضع الأسري",
  "التعليم",
  "الصحة",
  "بنود الاحتياج",
  "المستندات والإقرار",
] as const;

const STORAGE_KEY = "ioco:orphan-intake-draft";

function loadDraft(): Draft {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) } : EMPTY;
  } catch {
    // تخزين محجوب أو مسودّة تالفة: نبدأ نظيفاً بدل أن ينكسر النموذج.
    return EMPTY;
  }
}

export function OrphanIntakeForm({
  orgId,
  onDone,
  onCancel,
}: {
  orgId: string;
  onDone: (code: string) => void;
  onCancel: () => void;
}) {
  const beginDraft = useServerFn(startOrphanDraft);
  const submit = useServerFn(submitOrphanIntake);
  const signUpload = useServerFn(createDocumentUploadUrl);

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const restored = useRef(false);

  // المسودّة تُقرأ بعد التركيب لا أثناء التوليد: الخادم لا يملك
  // localStorage، فقراءتها في التهيئة تجعل HTML الخادم مخالفاً لأول رسم.
  useEffect(() => {
    const saved = loadDraft();
    setDraft(saved);
    restored.current = true;
    if (saved.displayName || saved.documents.length > 0) {
      toast.info("استُعيدت مسودّة محفوظة");
    }
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      /* التخزين محجوب: المسودّة تعيش في الذاكرة وحدها */
    }
  }, [draft]);

  // كل انتقال يُنقل التركيز إلى عنوان الخطوة، وإلا بقي قارئ الشاشة
  // على الزرّ ولم يُعلن أن الصفحة تغيّرت.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const needsTotal = useMemo(
    () => draft.needs.reduce((sum, n) => sum + (Number(n.monthlyAmount) || 0), 0),
    [draft.needs],
  );

  const missingDocs = REQUIRED_DOCS.filter((k) => !draft.documents.some((d) => d.kind === k));

  function canLeave(i: number): string | null {
    if (i === 0 && draft.displayName.trim().length < 2) return "اسم العرض مطلوب";
    if (i === 5 && draft.needs.length === 0) return "أضف بنداً واحداً على الأقل";
    return null;
  }

  /** المسودّة تُنشأ عند أول رفع: قبله لا حاجة لصفّ في القاعدة. */
  async function ensureDraft(): Promise<string | null> {
    if (draft.orphanId) return draft.orphanId;
    const res = await beginDraft({ data: { orgId } });
    if (!res.ok) {
      toast.error(res.error);
      return null;
    }
    setDraft((d) => ({ ...d, orphanId: res.id, code: res.code }));
    return res.id;
  }

  async function upload(kind: string, file: File) {
    setUploading(kind);
    try {
      const orphanId = await ensureDraft();
      if (!orphanId) return;

      const signed = await signUpload({ data: { orphanId, kind, fileName: file.name } });
      if (!signed.ok) {
        toast.error(signed.error);
        return;
      }

      // الملف يذهب إلى التخزين مباشرةً لا عبر خادمنا.
      const put = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) {
        toast.error("تعذّر رفع الملف");
        return;
      }

      setDraft((d) => ({
        ...d,
        documents: [
          // نوع واحد لكل ملف: إعادة الرفع تستبدل ولا تُراكم.
          ...d.documents.filter((x) => x.kind !== kind),
          {
            kind,
            storagePath: signed.path,
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          },
        ],
      }));
      toast.success(`رُفع ${DOC_LABELS[kind]}`);
    } finally {
      setUploading(null);
    }
  }

  async function finish() {
    if (missingDocs.length > 0) {
      toast.error(`مستندات إلزامية ناقصة: ${missingDocs.map((k) => DOC_LABELS[k]).join("، ")}`);
      return;
    }
    setBusy(true);
    try {
      const res = await submit({
        data: {
          orgId,
          ...(draft.orphanId ? { orphanId: draft.orphanId } : {}),
          displayName: draft.displayName.trim(),
          gender: draft.gender,
          birthDate: draft.birthDate || undefined,
          city: draft.city || undefined,
          region: draft.region || undefined,
          fullName: draft.fullName || undefined,
          nationalId: draft.nationalId || undefined,
          guardianName: draft.guardianName || undefined,
          guardianRelation: draft.guardianRelation || undefined,
          guardianPhone: draft.guardianPhone || undefined,
          address: draft.address || undefined,
          familySize: draft.familySize ? Number(draft.familySize) : undefined,
          familyIncome: draft.familyIncome ? Number(draft.familyIncome) : undefined,
          educationStage: draft.educationStage || undefined,
          schoolName: draft.schoolName || undefined,
          healthNotes: draft.healthNotes || undefined,
          needs: draft.needs.map((n) => ({
            category: n.category as (typeof NEED_CATEGORIES)[number],
            title: n.title,
            monthlyAmount: Number(n.monthlyAmount) || 0,
            ...(n.notes ? { notes: n.notes } : {}),
          })),
          monthlyNeed: needsTotal,
          story: draft.story || undefined,
          privateNotes: draft.privateNotes || undefined,
          documents: draft.documents.map((d) => ({
            kind: d.kind as (typeof DOC_KINDS)[number],
            storagePath: d.storagePath,
            fileName: d.fileName,
            ...(d.mimeType ? { mimeType: d.mimeType } : {}),
            ...(d.sizeBytes ? { sizeBytes: d.sizeBytes } : {}),
          })),
        },
      });

      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* لا شيء يُفعل */
      }
      onDone(res.code);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-border bg-card rounded-2xl border p-5">
      <ol className="mb-6 flex flex-wrap gap-1.5" aria-label="خطوات النموذج">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => i <= step && setStep(i)}
              disabled={i > step}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                i === step && "bg-primary text-primary-foreground",
                i < step && "bg-shore-thrive/12 text-shore-thrive",
                i > step && "text-muted-foreground border-border border border-dashed",
              )}
            >
              {i < step && <Check className="me-1 inline size-3" aria-hidden="true" />}
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      <h3
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-bold outline-none"
        // يُعلن التغيّر لقارئ الشاشة عند كل انتقال.
        aria-live="polite"
      >
        {STEPS[step]}
        <span className="text-muted-foreground ms-2 text-xs font-normal">
          الخطوة {step + 1} من {STEPS.length}
        </span>
      </h3>

      <div className="mt-5 space-y-4">
        {step === 0 && (
          <>
            <Field label="اسم العرض" hint="اسم مختصر يظهر للكافل — لا الاسم الكامل">
              <Input
                value={draft.displayName}
                onChange={(e) => set("displayName", e.target.value)}
                placeholder="محمد . أ"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="الجنس">
                <select
                  value={draft.gender}
                  onChange={(e) => set("gender", e.target.value as "male" | "female")}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="male">ذكر</option>
                  <option value="female">أنثى</option>
                </select>
              </Field>
              <Field label="تاريخ الميلاد">
                <Input
                  type="date"
                  value={draft.birthDate}
                  onChange={(e) => set("birthDate", e.target.value)}
                />
              </Field>
              <Field label="المدينة">
                <Input value={draft.city} onChange={(e) => set("city", e.target.value)} />
              </Field>
              <Field label="المنطقة">
                <Input value={draft.region} onChange={(e) => set("region", e.target.value)} />
              </Field>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-muted-foreground bg-secondary/50 rounded-lg p-3 text-xs leading-6">
              بيانات هذه الخطوة <strong>سرّية</strong>: لا تظهر للكافل ولا للزائر، وتُقرأ من الإدارة
              والجهة وولي الأمر فقط.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="الاسم الكامل">
                <Input value={draft.fullName} onChange={(e) => set("fullName", e.target.value)} />
              </Field>
              <Field label="رقم الهوية">
                <Input
                  value={draft.nationalId}
                  onChange={(e) => set("nationalId", e.target.value)}
                />
              </Field>
              <Field label="اسم ولي الأمر">
                <Input
                  value={draft.guardianName}
                  onChange={(e) => set("guardianName", e.target.value)}
                />
              </Field>
              <Field label="صلة القرابة">
                <Input
                  value={draft.guardianRelation}
                  onChange={(e) => set("guardianRelation", e.target.value)}
                  placeholder="الأم، الجدّ…"
                />
              </Field>
              <Field label="جوال ولي الأمر">
                <Input
                  value={draft.guardianPhone}
                  onChange={(e) => set("guardianPhone", e.target.value)}
                  inputMode="tel"
                  dir="ltr"
                />
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="العنوان" className="sm:col-span-2">
              <Input value={draft.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <Field label="عدد أفراد الأسرة">
              <Input
                type="number"
                min={0}
                value={draft.familySize}
                onChange={(e) => set("familySize", e.target.value)}
              />
            </Field>
            <Field label="دخل الأسرة الشهري" hint="بالدولار — يُستخدم لترتيب الأولوية">
              <Input
                type="number"
                min={0}
                value={draft.familyIncome}
                onChange={(e) => set("familyIncome", e.target.value)}
              />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="المرحلة الدراسية">
              <Input
                value={draft.educationStage}
                onChange={(e) => set("educationStage", e.target.value)}
                placeholder="ابتدائي — الصف الرابع"
              />
            </Field>
            <Field label="اسم المدرسة">
              <Input value={draft.schoolName} onChange={(e) => set("schoolName", e.target.value)} />
            </Field>
          </div>
        )}

        {step === 4 && (
          <Field label="ملاحظات صحّية" hint="سرّية — تُقرأ من الإدارة والجهة فقط">
            <Textarea
              rows={5}
              value={draft.healthNotes}
              onChange={(e) => set("healthNotes", e.target.value)}
            />
          </Field>
        )}

        {step === 5 && (
          <NeedsEditor needs={draft.needs} total={needsTotal} onChange={(n) => set("needs", n)} />
        )}

        {step === 6 && (
          <>
            <Field label="قصّة اليتيم" hint="تظهر للكافل — بلا أسماء ولا تفاصيل تُعرّفه">
              <Textarea
                rows={4}
                value={draft.story}
                onChange={(e) => set("story", e.target.value)}
              />
            </Field>

            <div className="border-border rounded-xl border p-4">
              <h4 className="text-sm font-bold">المستندات</h4>
              <p className="text-muted-foreground mt-1 text-xs leading-6">
                تُحفظ في خزنة خاصة ولا تظهر لكافل ولا لزائر. الإدارة وحدها توثّقها.
              </p>
              <div className="mt-3 space-y-2">
                {DOC_KINDS.filter((k) => k !== "photo_consent").map((kind) => {
                  const has = draft.documents.find((d) => d.kind === kind);
                  const required = (REQUIRED_DOCS as readonly string[]).includes(kind);
                  return (
                    <div
                      key={kind}
                      className="border-border flex flex-wrap items-center gap-2 rounded-lg border p-2"
                    >
                      <span className="flex-1 text-sm">
                        {DOC_LABELS[kind]}
                        {required && (
                          <Badge className="bg-shore-need ms-2 text-white">إلزامي</Badge>
                        )}
                      </span>
                      {has ? (
                        <>
                          <span className="text-shore-thrive inline-flex items-center gap-1 text-xs">
                            <Paperclip className="size-3" aria-hidden="true" />
                            {has.fileName}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              set(
                                "documents",
                                draft.documents.filter((d) => d.kind !== kind),
                              )
                            }
                            aria-label={`إزالة ${DOC_LABELS[kind]}`}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </>
                      ) : (
                        <label className="border-input hover:bg-secondary inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium">
                          {uploading === kind ? (
                            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                          ) : (
                            <Upload className="size-3" aria-hidden="true" />
                          )}
                          اختر ملفاً
                          <input
                            type="file"
                            className="sr-only"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            disabled={uploading !== null}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void upload(kind, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
              {missingDocs.length > 0 && (
                <p className="text-bridge-ink mt-3 text-xs font-medium">
                  ينقصك: {missingDocs.map((k) => DOC_LABELS[k]).join("، ")}
                </p>
              )}
            </div>

            <p className="text-muted-foreground bg-secondary/50 rounded-lg p-3 text-xs leading-6">
              بالتقديم تُقرّ بأن البيانات صحيحة وأن جهتك تملك ما يُثبتها، وأن نشر صورة اليتيم لن
              يتمّ إلا بموافقة موثّقة من وليّه — وهي خطوة منفصلة بعد الاعتماد.
            </p>
          </>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {step > 0 && (
          <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
            السابق
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            onClick={() => {
              const err = canLeave(step);
              if (err) {
                toast.error(err);
                return;
              }
              setStep(step + 1);
            }}
          >
            التالي
          </Button>
        ) : (
          <Button type="button" onClick={() => void finish()} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            إرسال للمراجعة
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancel}>
          إلغاء
        </Button>
        {draft.code && (
          <span className="text-muted-foreground ms-auto text-xs tabular-nums">
            مسودّة {draft.code}
          </span>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

/**
 * محرّر بنود الاحتياج.
 *
 * المجموع يُعرض حيّاً وهو **المبلغ الشهري نفسه** لا رقماً موازياً: القاعدة
 * تشتقّه من البنود، فلا يمكن أن يقول التفصيل شيئاً والإجمالي شيئاً آخر —
 * وهو تناقض كان الكافل يراه ويقرؤه تلاعباً.
 */
function NeedsEditor({
  needs,
  total,
  onChange,
}: {
  needs: Need[];
  total: number;
  onChange: (n: Need[]) => void;
}) {
  return (
    <div className="space-y-3">
      {needs.map((need, i) => (
        <div
          key={i}
          className="border-border grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <div className="space-y-1.5">
            <Label className="text-xs">الفئة</Label>
            <select
              value={need.category}
              onChange={(e) => {
                const next = [...needs];
                next[i] = { ...need, category: e.target.value };
                onChange(next);
              }}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              {NEED_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {NEED_CATEGORY_LABELS[c] ?? c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">الوصف</Label>
            <Input
              value={need.title}
              onChange={(e) => {
                const next = [...needs];
                next[i] = { ...need, title: e.target.value };
                onChange(next);
              }}
              placeholder="رسوم دراسية"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">شهرياً ($)</Label>
            <div className="flex gap-1">
              <Input
                type="number"
                min={0}
                className="w-24"
                value={need.monthlyAmount}
                onChange={(e) => {
                  const next = [...needs];
                  next[i] = { ...need, monthlyAmount: Number(e.target.value) };
                  onChange(next);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`حذف بند ${need.title || i + 1}`}
                onClick={() => onChange(needs.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange([...needs, { category: "education", title: "", monthlyAmount: 0 }])
          }
        >
          إضافة بند
        </Button>
        <p className="ms-auto text-sm">
          <span className="text-muted-foreground">الاحتياج الشهري: </span>
          <span className="text-bridge-ink font-bold tabular-nums">{formatMoney(total)}</span>
        </p>
      </div>
      <p className="text-muted-foreground text-xs leading-6">
        هذا المبلغ يُحسب من البنود ولا يُكتب يدوياً، فلا يختلف ما يراه الكافل في التفصيل عمّا يراه
        في الإجمالي.
      </p>
    </div>
  );
}
