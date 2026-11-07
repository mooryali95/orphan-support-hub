import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2, Lock, Paperclip, Trash2 } from "lucide-react";

import { FilePicker } from "@/components/kit/FilePicker";
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
  REJECTION_LABELS,
  startOrphanDraft,
  submitOrphanIntake,
  saveOrphanDraft,
  getOrphanIntake,
  getIntakeOptions,
  createDocumentUploadUrl,
  type OrphanIntakeRecord,
} from "@/lib/intake.functions";
import { formatDate, formatMoney, NEED_CATEGORY_LABELS, ORPHAN_STATUS_LABELS } from "@/lib/format";
import { fetchRegions, regionOptions, resolveRegion } from "@/lib/regions";
import { cn } from "@/lib/utils";
import { clearDraft } from "./intake-draft";

/**
 * نموذج إدخال ملف اليتيم — سبع خطوات.
 *
 * التقسيم ليس تجميلاً: الملف الكامل يطلب نحو عشرين حقلاً ووثيقتين على
 * الأقلّ، وعرضها دفعةً واحدة يجعل المُدخِل يهجر النموذج أو يملأه على
 * عجل — وكلاهما يُنتج ملفّاً ناقصاً يُردّ من المراجعة.
 *
 * والمسودّة تُحفظ في القاعدة بمعرّف ملفّها عند كلّ انتقال (UX-04): تُستأنف
 * من أيّ جهاز، ويُفتح بها الملفّ المرفوض للتصحيح وإعادة التقديم. لا شيء
 * منها في المتصفّح بعد اليوم — وما بقي من المفتاح القديم يُمحى.
 *
 * والدولة من الدول العاملة، والمنطقة من مناطق الخارطة نفسها (UX-10)،
 * والعملة عملة الدولة لا «$» ثابتة (A11Y-06).
 */

type Need = { category: string; title: string; monthlyAmount: number; notes?: string };
type Doc = {
  kind: string;
  storagePath: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  /** وثيقةٌ في القاعدة وثّقتها الإدارة: باقية، لا تُحذف ولا تُستبدل. */
  verified?: boolean;
  /** ملاحظة الإدارة على الوثيقة (سبب عدم توثيقها مثلاً). */
  note?: string | null;
};

type Draft = {
  orphanId?: string;
  code?: string;
  displayName: string;
  gender: "male" | "female";
  birthDate: string;
  country: string;
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
  country: "",
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

/** الملفّ كما في القاعدة ← حالة النموذج. */
function fromRecord(rec: OrphanIntakeRecord): Draft {
  const p = rec.private;
  const s = (v: string | number | null | undefined) => (v == null ? "" : String(v));
  return {
    orphanId: rec.id,
    code: rec.code,
    // «مسودّة» اسمٌ مؤقّت تضعه القاعدة لملفٍّ بلا اسم بعد.
    displayName: rec.display_name === "مسودّة" ? "" : rec.display_name,
    gender: rec.gender === "female" ? "female" : "male",
    birthDate: s(rec.birth_date),
    country: s(rec.country_code),
    city: s(rec.city),
    region: s(rec.region),
    fullName: s(p?.full_name),
    nationalId: s(p?.national_id),
    guardianName: s(p?.guardian_name),
    guardianRelation: s(p?.guardian_relation),
    guardianPhone: s(p?.guardian_phone),
    address: s(p?.address),
    familySize: s(p?.family_size),
    familyIncome: s(p?.family_income),
    educationStage: s(rec.education_stage),
    schoolName: s(p?.school_name),
    healthNotes: s(p?.health_notes),
    needs: rec.needs.map((n) => ({
      category: n.category,
      title: n.title,
      monthlyAmount: Number(n.monthly_amount) || 0,
      ...(n.note ? { notes: n.note } : {}),
    })),
    story: s(rec.story),
    privateNotes: s(p?.private_notes),
    documents: rec.documents.map((d) => ({
      kind: d.kind,
      storagePath: d.storage_path,
      fileName: d.file_name ?? "ملف",
      ...(d.mime_type ? { mimeType: d.mime_type } : {}),
      ...(d.size_bytes ? { sizeBytes: d.size_bytes } : {}),
      verified: d.verified,
      note: d.note,
    })),
  };
}

/** حالة النموذج ← مدخلات الخادم (للتقديم والمسودّة). */
function toInput(orgId: string, draft: Draft, total: number) {
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  return {
    orgId,
    ...(draft.orphanId ? { orphanId: draft.orphanId } : {}),
    displayName: draft.displayName.trim(),
    gender: draft.gender,
    birthDate: opt(draft.birthDate),
    country: opt(draft.country),
    city: opt(draft.city),
    region: opt(draft.region),
    fullName: opt(draft.fullName),
    nationalId: opt(draft.nationalId),
    guardianName: opt(draft.guardianName),
    guardianRelation: opt(draft.guardianRelation),
    guardianPhone: opt(draft.guardianPhone),
    address: opt(draft.address),
    familySize: draft.familySize ? Number(draft.familySize) : undefined,
    familyIncome: draft.familyIncome ? Number(draft.familyIncome) : undefined,
    educationStage: opt(draft.educationStage),
    schoolName: opt(draft.schoolName),
    healthNotes: opt(draft.healthNotes),
    needs: draft.needs.map((n) => ({
      category: n.category as (typeof NEED_CATEGORIES)[number],
      title: n.title,
      monthlyAmount: Number(n.monthlyAmount) || 0,
      ...(n.notes ? { notes: n.notes } : {}),
    })),
    monthlyNeed: total,
    story: opt(draft.story),
    privateNotes: opt(draft.privateNotes),
    documents: draft.documents.map((d) => ({
      kind: d.kind as (typeof DOC_KINDS)[number],
      storagePath: d.storagePath,
      fileName: d.fileName,
      ...(d.mimeType ? { mimeType: d.mimeType } : {}),
      ...(d.sizeBytes ? { sizeBytes: d.sizeBytes } : {}),
    })),
  };
}

export function OrphanIntakeForm({
  orgId,
  userId,
  orphanId,
  onDone,
  onCancel,
}: {
  orgId: string;
  /** يمحو مسودّة المتصفّح القديمة لهذا المستخدم: المسودّة صارت في القاعدة. */
  userId: string;
  /** ملفٌّ قائم يُستأنف أو يُصحَّح أو يُعرض — من القاعدة لا من المتصفّح. */
  orphanId?: string;
  onDone: (code: string) => void;
  onCancel: () => void;
}) {
  const beginDraft = useServerFn(startOrphanDraft);
  const submit = useServerFn(submitOrphanIntake);
  const save = useServerFn(saveOrphanDraft);
  const signUpload = useServerFn(createDocumentUploadUrl);
  const fetchRecord = useServerFn(getOrphanIntake);
  const fetchOptions = useServerFn(getIntakeOptions);

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const loaded = useRef(false);
  // صفّ المسودّة يُنشأ مرّةً واحدة وإن تزامن حفظٌ ورفع.
  const creating = useRef<Promise<string | null> | null>(null);

  const { data: options } = useQuery({
    queryKey: ["intake-options"],
    queryFn: () => fetchOptions(),
    staleTime: 10 * 60_000,
  });
  const { data: record, isPending: recordLoading } = useQuery({
    queryKey: ["orphan-intake", orphanId],
    queryFn: () => fetchRecord({ data: { orphanId: orphanId! } }),
    enabled: Boolean(orphanId),
  });
  const { data: regions = [] } = useQuery({
    queryKey: ["geo", "admin1-names", draft.country],
    queryFn: () => fetchRegions(draft.country),
    enabled: Boolean(draft.country),
    staleTime: Infinity,
  });
  const regionOpts = useMemo(() => regionOptions(regions), [regions]);

  // المسودّة القديمة في المتصفّح (قبل الدفعة ٢) لا تُقرأ — تُمحى.
  useEffect(() => {
    try {
      clearDraft(window.localStorage, userId, orgId);
    } catch {
      /* التخزين محجوب: لا شيء يُمحى */
    }
  }, [userId, orgId]);

  // الملفّ القائم يُملأ من القاعدة مرّةً واحدة؛ والمنطقة المكتوبة بتهجئةٍ
  // تعرفها الخارطة تُردّ إلى اسمها في القائمة.
  useEffect(() => {
    if (!record || loaded.current) return;
    loaded.current = true;
    setDraft(fromRecord(record));
  }, [record]);
  useEffect(() => {
    if (!draft.region || regions.length === 0) return;
    const canonical = resolveRegion(draft.region, regions);
    if (canonical && canonical !== draft.region) setDraft((d) => ({ ...d, region: canonical }));
  }, [regions, draft.region]);
  // دولةٌ واحدة عاملة: تُختار سلفاً.
  useEffect(() => {
    if (!draft.country && options?.countries.length === 1) {
      setDraft((d) => ({ ...d, country: options.countries[0]!.code }));
    }
  }, [options, draft.country]);

  // كل انتقال يُنقل التركيز إلى عنوان الخطوة، وإلا بقي قارئ الشاشة
  // على الزرّ ولم يُعلن أن الصفحة تغيّرت.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const currency =
    options?.countries.find((c) => c.code === draft.country)?.currency ??
    options?.currency ??
    "EUR";

  const needsTotal = useMemo(
    () => draft.needs.reduce((sum, n) => sum + (Number(n.monthlyAmount) || 0), 0),
    [draft.needs],
  );

  const missingDocs = REQUIRED_DOCS.filter((k) => !draft.documents.some((d) => d.kind === k));

  if (orphanId && recordLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="text-muted-foreground size-5 animate-spin" aria-label="يُحمَّل الملف" />
      </div>
    );
  }
  if (orphanId && !record) {
    return (
      <p role="alert" className="text-destructive text-sm">
        تعذّر فتح الملف.
      </p>
    );
  }
  if (record && !record.editable) {
    return <IntakeReadOnly record={record} onClose={onCancel} />;
  }

  function canLeave(i: number): string | null {
    if (i === 0 && draft.displayName.trim().length < 2) return "اسم العرض مطلوب";
    if (i === 0 && !draft.country) return "اختر الدولة";
    if (i === 0 && regionOpts.length > 0 && !regionOpts.some((r) => r.value === draft.region))
      return "اختر المنطقة من القائمة";
    if (i === 5 && draft.needs.length === 0) return "أضف بنداً واحداً على الأقل";
    return null;
  }

  /** المسودّة تُنشأ عند أوّل حفظٍ أو رفع: قبله لا حاجة لصفٍّ في القاعدة. */
  async function ensureDraft(): Promise<string | null> {
    if (draft.orphanId) return draft.orphanId;
    creating.current ??= (async () => {
      const res = await beginDraft({ data: { orgId } });
      if (!res.ok) {
        toast.error(res.error);
        creating.current = null;
        return null;
      }
      setDraft((d) => ({ ...d, orphanId: res.id, code: res.code }));
      return res.id;
    })();
    return creating.current;
  }

  /** حفظ المسودّة في القاعدة — عند كلّ انتقالٍ وبالزرّ. */
  async function persist(current: Draft = draft): Promise<boolean> {
    if (current.displayName.trim().length < 2 && !current.orphanId) return false;
    const id = current.orphanId ?? (await ensureDraft());
    if (!id) return false;
    const res = await save({ data: { ...toInput(orgId, current, needsTotal), orphanId: id } });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    setSavedAt(res.savedAt);
    return true;
  }

  async function upload(kind: string, file: File | null) {
    if (!file) return;
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
        orphanId,
        documents: [
          // نوع واحد لكل ملف: إعادة الرفع تستبدل ولا تُراكم — والقديم غير
          // الموثَّق يُحذف من القاعدة عند الحفظ.
          ...d.documents.filter((x) => x.kind !== kind || x.verified),
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
      const res = await submit({ data: toInput(orgId, draft, needsTotal) });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onDone(res.code);
    } finally {
      setBusy(false);
    }
  }

  function go(to: number) {
    setStep(to);
    void persist();
  }

  return (
    <section className="border-border bg-card rounded-2xl border p-5">
      {record?.status === "rejected" && (
        <div role="note" className="bg-secondary/60 mb-5 rounded-xl p-4 text-sm leading-7">
          <p className="font-bold">
            أعادته الإدارة: {REJECTION_LABELS[record.rejection_code ?? ""] ?? "سبب آخر"}
          </p>
          {record.rejection_reason && <p>{record.rejection_reason}</p>}
          <p className="text-muted-foreground text-xs">
            صحّح ما طُلب، واستبدل الوثيقة غير المقروءة من الخطوة الأخيرة، ثم أعد الإرسال. الوثائق
            الموثَّقة باقية.
          </p>
        </div>
      )}

      <ol className="mb-6 flex flex-wrap gap-1.5" aria-label="خطوات النموذج">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => i <= step && go(i)}
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
              <Field label="الدولة" hint="من الدول التي تعمل فيها المنصّة">
                <select
                  value={draft.country}
                  required
                  onChange={(e) => setDraft((d) => ({ ...d, country: e.target.value, region: "" }))}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="">اختر الدولة</option>
                  {(options?.countries ?? []).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="المنطقة" hint="من مناطق الخارطة، فيظهر الطفل في تفصيلها">
                <select
                  value={draft.region}
                  disabled={!draft.country}
                  onChange={(e) => set("region", e.target.value)}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="">{draft.country ? "اختر المنطقة" : "اختر الدولة أوّلاً"}</option>
                  {/* نصٌّ قديم لا تعرفه الخارطة يُعرض كما هو حتى يُستبدل. */}
                  {draft.region && !regionOpts.some((r) => r.value === draft.region) && (
                    <option value={draft.region}>{draft.region} — غير موجودة في الخارطة</option>
                  )}
                  {regionOpts.map((r) => (
                    <option key={r.id} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="المدينة">
                <Input value={draft.city} onChange={(e) => set("city", e.target.value)} />
              </Field>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-muted-foreground bg-secondary/50 rounded-lg p-3 text-xs leading-6">
              بيانات هذه الخطوة <strong>سرّية</strong>: لا تظهر للكافل ولا للزائر، وتُقرأ من الإدارة
              والجهة وولي الأمر فقط. وتُحفظ في الخزنة مع الملف عند كلّ انتقال — لا في المتصفّح.
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
            <Field
              label="دخل الأسرة الشهري"
              hint={`بعملة الدولة (${currency}) — يُستخدم لترتيب الأولوية`}
            >
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
          <NeedsEditor
            needs={draft.needs}
            total={needsTotal}
            currency={currency}
            onChange={(n) => set("needs", n)}
          />
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
              <ul className="mt-3 space-y-2">
                {DOC_KINDS.filter((k) => k !== "photo_consent").map((kind) => {
                  const has = draft.documents.filter((d) => d.kind === kind);
                  const verified = has.some((d) => d.verified);
                  const required = (REQUIRED_DOCS as readonly string[]).includes(kind);
                  return (
                    <li
                      key={kind}
                      className="border-border flex flex-wrap items-center gap-2 rounded-lg border p-2"
                    >
                      <span className="flex-1 text-sm">
                        {DOC_LABELS[kind]}
                        {required && (
                          <Badge className="bg-shore-need ms-2 text-white">إلزامي</Badge>
                        )}
                      </span>
                      {has.map((doc) => (
                        <span
                          key={doc.storagePath}
                          className="inline-flex flex-wrap items-center gap-1 text-xs"
                        >
                          {doc.verified ? (
                            <Lock className="text-shore-thrive size-3" aria-hidden="true" />
                          ) : (
                            <Paperclip className="text-shore-thrive size-3" aria-hidden="true" />
                          )}
                          <span dir="auto">{doc.fileName}</span>
                          {doc.verified ? (
                            <Badge variant="secondary">موثَّقة</Badge>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                set(
                                  "documents",
                                  draft.documents.filter((d) => d.storagePath !== doc.storagePath),
                                )
                              }
                              aria-label={`إزالة ${DOC_LABELS[kind]}`}
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </Button>
                          )}
                          {doc.note && (
                            <span className="text-bridge-ink w-full">
                              ملاحظة الإدارة: {doc.note}
                            </span>
                          )}
                        </span>
                      ))}
                      {!verified && (
                        <FilePicker
                          label={has.length > 0 ? "استبدال الملف" : "اختر ملفاً"}
                          accessibleLabel={`رفع ${DOC_LABELS[kind]}`}
                          busy={uploading === kind}
                          disabled={uploading !== null}
                          showName={false}
                          onPick={(f) => void upload(kind, f)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
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
          <Button type="button" variant="outline" onClick={() => go(step - 1)}>
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
              go(step + 1);
            }}
          >
            التالي
          </Button>
        ) : (
          <Button type="button" onClick={() => void finish()} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {record?.status === "rejected" ? "إعادة الإرسال للمراجعة" : "إرسال للمراجعة"}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={async () => {
            if (draft.displayName.trim().length >= 2 && (await persist())) {
              toast.success("حُفظت المسودّة — تجدها في قائمة ملفاتك");
            }
            onCancel();
          }}
        >
          {draft.displayName.trim().length >= 2 ? "حفظ والخروج" : "إلغاء"}
        </Button>
        <span className="text-muted-foreground ms-auto text-xs tabular-nums" aria-live="polite">
          {draft.code && <>مسودّة {draft.code}</>}
          {savedAt && <> · حُفظت {new Date(savedAt).toLocaleTimeString("ar")}</>}
        </span>
      </div>
    </section>
  );
}

/**
 * يربط التسمية بحقلها برمجياً (A11Y-06 / UX-17): معرّفٌ من `useId` يُمرَّر
 * إلى الحقل الابن وإلى `htmlFor`، والتلميح يُربط بـ`aria-describedby`.
 */
function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string }>;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const control = isValidElement(children)
    ? cloneElement(children, { id, ...(hint ? { "aria-describedby": hintId } : {}) })
    : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      {control}
      {hint && (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
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
  currency,
  onChange,
}: {
  needs: Need[];
  total: number;
  currency: string;
  onChange: (n: Need[]) => void;
}) {
  const uid = useId();
  return (
    <div className="space-y-3">
      {needs.map((need, i) => (
        <fieldset
          key={i}
          className="border-border grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <legend className="sr-only">البند {i + 1}</legend>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-cat-${i}`} className="text-xs">
              الفئة
            </Label>
            <select
              id={`${uid}-cat-${i}`}
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
            <Label htmlFor={`${uid}-title-${i}`} className="text-xs">
              الوصف
            </Label>
            <Input
              id={`${uid}-title-${i}`}
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
            <Label htmlFor={`${uid}-amount-${i}`} className="text-xs">
              شهرياً ({currency})
            </Label>
            <div className="flex gap-1">
              <Input
                id={`${uid}-amount-${i}`}
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
        </fieldset>
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
          <span className="text-bridge-ink font-bold tabular-nums">
            {formatMoney(total, currency)}
          </span>
        </p>
      </div>
      <p className="text-muted-foreground text-xs leading-6">
        هذا المبلغ يُحسب من البنود ولا يُكتب يدوياً، فلا يختلف ما يراه الكافل في التفصيل عمّا يراه
        في الإجمالي.
      </p>
    </div>
  );
}

/** ملفٌّ قيد المراجعة: يُقرأ ولا يُعدَّل حتى يصدر القرار (UX-04). */
function IntakeReadOnly({ record, onClose }: { record: OrphanIntakeRecord; onClose: () => void }) {
  const p = record.private;
  const rows: Array<[string, string | number | null | undefined]> = [
    ["اسم العرض", record.display_name],
    ["الجنس", record.gender === "female" ? "أنثى" : "ذكر"],
    ["تاريخ الميلاد", record.birth_date ? formatDate(record.birth_date) : null],
    ["الدولة", record.country_code],
    ["المنطقة", record.region],
    ["المدينة", record.city],
    ["الاسم الكامل", p?.full_name],
    ["ولي الأمر", p?.guardian_name],
    ["صلة القرابة", p?.guardian_relation],
    ["المرحلة الدراسية", record.education_stage],
    ["الاحتياج الشهري", formatMoney(record.monthly_need, record.currency)],
    ["القصّة", record.story],
  ];
  return (
    <section
      className="border-border bg-card rounded-2xl border p-5"
      aria-label={`ملف ${record.code}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-bold">{record.display_name}</h3>
        <Badge variant="secondary">{ORPHAN_STATUS_LABELS[record.status] ?? record.status}</Badge>
        <span className="text-muted-foreground text-xs tabular-nums">{record.code}</span>
      </div>
      <p className="text-muted-foreground mt-2 text-xs leading-6">
        الملف عند الإدارة: يُقرأ هنا ولا يُعدَّل حتى يصدر القرار. إن أُعيد إليكم فُتح للتصحيح.
      </p>
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => (
            <div key={k} className="grid grid-cols-[8rem_1fr] gap-2">
              <dt className="text-muted-foreground text-xs">{k}</dt>
              <dd className="break-words whitespace-pre-line">{String(v)}</dd>
            </div>
          ))}
      </dl>
      {record.needs.length > 0 && (
        <>
          <h4 className="mt-5 text-sm font-bold">بنود الاحتياج</h4>
          <ul className="mt-2 space-y-1 text-sm">
            {record.needs.map((n, i) => (
              <li key={i}>
                {NEED_CATEGORY_LABELS[n.category] ?? n.category} — {n.title} —{" "}
                {formatMoney(n.monthly_amount, record.currency)}
              </li>
            ))}
          </ul>
        </>
      )}
      <h4 className="mt-5 text-sm font-bold">المستندات</h4>
      <ul className="mt-2 space-y-1 text-sm">
        {record.documents.length === 0 && <li className="text-muted-foreground">لا مستندات.</li>}
        {record.documents.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2">
            {DOC_LABELS[d.kind] ?? d.kind}
            <span className="text-muted-foreground text-xs" dir="auto">
              {d.file_name}
            </span>
            {d.verified && <Badge variant="secondary">موثَّقة</Badge>}
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" className="mt-5" onClick={onClose}>
        إغلاق
      </Button>
    </section>
  );
}
