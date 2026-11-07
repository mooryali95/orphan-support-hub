import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withPhase2 } from "@/integrations/supabase/types.extra";

/**
 * إدخال ملف اليتيم ووثائقه — المرحلة 2.
 *
 * كل الكتابة تمرّ عبر `create_orphan_intake` في القاعدة لا عبر نداءات
 * متتابعة من هنا. السبب أن النداءات المتتابعة ليست معاملة: كان الملف
 * يُدرج ثم تُدرج بياناته السرّية بنداء ثانٍ بلا فحص خطأ، فإن فشل الثاني
 * بقي ملف بلا اسم كامل ولا جوال ولي أمر — ولا أحد يعلم (M3).
 */

export const NEED_CATEGORIES = [
  "education",
  "health",
  "food",
  "housing",
  "clothing",
  "other",
] as const;

export const DOC_KINDS = [
  "death_certificate",
  "birth_certificate",
  "guardianship_proof",
  "orphan_id",
  "guardian_id",
  "income_proof",
  "school_record",
  "medical_report",
  "photo_consent",
  "other",
] as const;

/** الوثائق التي لا يُقبل ملفّ بدونها. */
export const REQUIRED_DOCS = ["death_certificate", "guardianship_proof"] as const;

export const DOC_LABELS: Record<string, string> = {
  death_certificate: "شهادة وفاة الوالد",
  birth_certificate: "شهادة ميلاد اليتيم",
  guardianship_proof: "إثبات الوصاية",
  orphan_id: "هوية اليتيم",
  guardian_id: "هوية ولي الأمر",
  income_proof: "إثبات الدخل",
  school_record: "سجلّ دراسي",
  medical_report: "تقرير طبّي",
  photo_consent: "إقرار الموافقة على الصورة",
  other: "أخرى",
};

/** الوثائق الإلزامية الناقصة. يُفحص في الخادم لا في الواجهة وحدها. */
export function missingRequiredDocs(kinds: readonly string[]): string[] {
  return REQUIRED_DOCS.filter((k) => !kinds.includes(k));
}

/**
 * الإلزاميات التي لم تُوثَّق بعد — شرط النشر نفسه الذي تفرضه القاعدة في
 * `review_orphan` (`orphan_missing_publication_docs`). المرفوع وحده لا
 * يكفي: الإدارة تفتح الوثيقة وتوثّقها قبل النشر، كما تَعِد الأسئلة
 * الشائعة. ولوحة المراجعة تبني زرّ الاعتماد عليها.
 */
export function unverifiedRequiredDocs(
  docs: readonly { kind: string; verified: boolean }[],
): string[] {
  return REQUIRED_DOCS.filter((k) => !docs.some((d) => d.kind === k && d.verified));
}

export const REJECTION_CODES = [
  "documents_missing",
  "documents_unclear",
  "documents_inconsistent",
  "identity_unverified",
  "guardianship_unproven",
  "needs_unjustified",
  "duplicate_profile",
  "photo_consent_missing",
  "other",
] as const;

export const REJECTION_LABELS: Record<string, string> = {
  documents_missing: "مستندات ناقصة",
  documents_unclear: "مستندات غير واضحة",
  documents_inconsistent: "تعارض بين المستندات",
  identity_unverified: "الهوية غير مُتحقَّق منها",
  guardianship_unproven: "الوصاية غير مُثبَتة",
  needs_unjustified: "بنود الاحتياج غير مبرَّرة",
  duplicate_profile: "ملف مكرّر",
  photo_consent_missing: "لا إقرار بالموافقة على الصورة",
  other: "سبب آخر",
};

const needSchema = z.object({
  category: z.enum(NEED_CATEGORIES),
  title: z.string().trim().min(1).max(120),
  monthlyAmount: z.number().min(0).max(100000),
  notes: z.string().trim().max(400).optional(),
});

const docSchema = z.object({
  kind: z.enum(DOC_KINDS),
  storagePath: z.string().trim().min(3).max(500),
  fileName: z.string().trim().max(255).optional(),
  mimeType: z.string().trim().max(120).optional(),
  sizeBytes: z.number().int().min(0).max(20_000_000).optional(),
});

const intakeSchema = z.object({
  orgId: z.string().uuid(),
  /** مسودّة قائمة تُملأ وتُقدَّم؛ غيابها يعني إنشاءً من الصفر. */
  orphanId: z.string().uuid().optional(),
  // 1 — أساسي
  displayName: z.string().trim().min(2).max(80),
  gender: z.enum(["male", "female"]),
  birthDate: z.string().trim().max(20).optional(),
  city: z.string().trim().max(80).optional(),
  region: z.string().trim().max(80).optional(),
  /** رمز الدولة من الدول العاملة؛ غيابه يعني دولة الجهة (UX-10). */
  country: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  // 2 — وصاية
  fullName: z.string().trim().max(140).optional(),
  nationalId: z.string().trim().max(40).optional(),
  guardianName: z.string().trim().max(140).optional(),
  guardianRelation: z.string().trim().max(60).optional(),
  guardianPhone: z.string().trim().max(40).optional(),
  // 3 — وضع أسري
  address: z.string().trim().max(300).optional(),
  familySize: z.number().int().min(0).max(60).optional(),
  familyIncome: z.number().min(0).max(1_000_000).optional(),
  // 4 — تعليم
  educationStage: z.string().trim().max(80).optional(),
  schoolName: z.string().trim().max(140).optional(),
  // 5 — صحة
  healthNotes: z.string().trim().max(1000).optional(),
  // 6 — بنود الاحتياج
  needs: z.array(needSchema).max(20).default([]),
  monthlyNeed: z.number().min(0).max(100000).default(0),
  story: z.string().trim().max(2000).optional(),
  privateNotes: z.string().trim().max(1000).optional(),
  // 7 — مستندات وإقرار
  documents: z.array(docSchema).max(20).default([]),
});

export type IntakeInput = z.infer<typeof intakeSchema>;

/** حمولة القاعدة من مدخلات النموذج — واحدةٌ للتقديم والمسودّة. */
function intakePayload(data: Omit<IntakeInput, "displayName"> & { displayName: string }) {
  return {
    org_id: data.orgId,
    orphan_id: data.orphanId ?? "",
    display_name: data.displayName,
    gender: data.gender,
    birth_date: data.birthDate ?? "",
    city: data.city ?? "",
    region: data.region ?? "",
    country: data.country ?? "",
    education_stage: data.educationStage ?? "",
    story: data.story ?? "",
    monthly_need: data.monthlyNeed,
    full_name: data.fullName ?? "",
    national_id: data.nationalId ?? "",
    guardian_name: data.guardianName ?? "",
    guardian_relation: data.guardianRelation ?? "",
    guardian_phone: data.guardianPhone ?? "",
    address: data.address ?? "",
    family_size: data.familySize?.toString() ?? "",
    family_income: data.familyIncome?.toString() ?? "",
    health_notes: data.healthNotes ?? "",
    school_name: data.schoolName ?? "",
    private_notes: data.privateNotes ?? "",
    needs: data.needs.map((n) => ({
      category: n.category,
      title: n.title,
      monthly_amount: n.monthlyAmount,
      note: n.notes ?? "",
    })),
    documents: data.documents.map((d) => ({
      kind: d.kind,
      storage_path: d.storagePath,
      file_name: d.fileName ?? "",
      mime_type: d.mimeType ?? "",
      size_bytes: d.sizeBytes?.toString() ?? "",
    })),
  };
}

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};
const rpc = (client: unknown) => client as RpcClient;

/** المسودّة: الحقول نفسها، والاسم قد يكون ناقصاً بعد، والملفّ موجود. */
const draftSchema = intakeSchema.extend({
  orphanId: z.string().uuid(),
  displayName: z.string().trim().max(80),
  needs: z
    .array(needSchema.extend({ title: z.string().trim().max(120) }))
    .max(20)
    .default([]),
});

/**
 * حفظ المسودّة في القاعدة بمعرّف ملفّها (UX-04).
 *
 * كانت تُحفظ في المتصفّح بلا حقولها السرّية، فلا تُستأنف من جهازٍ آخر ولا
 * يُفتح بها ملفٌّ مرفوض. الآن تُكتب حيث يُكتب الملفّ المُقدَّم — والسرّي في
 * `orphan_private` كما عند التقديم — وتبقى حالها حتى يُقدَّم.
 */
export const saveOrphanDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => draftSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await rpc(context.supabase).rpc("save_orphan_draft", {
      _payload: intakePayload(data),
    });
    if (error) {
      return {
        ok: false as const,
        error: error.code === "42501" ? "الملفّ لم يعد قابلاً للتعديل" : "تعذّر حفظ المسودّة",
      };
    }
    return { ok: true as const, savedAt: (res as { saved_at: string }).saved_at };
  });

export type OrphanIntakeRecord = {
  id: string;
  code: string;
  org_id: string;
  status: string;
  editable: boolean;
  rejection_code: string | null;
  rejection_reason: string | null;
  display_name: string;
  gender: "male" | "female";
  birth_date: string | null;
  city: string | null;
  region: string | null;
  country_code: string | null;
  education_stage: string | null;
  story: string | null;
  monthly_need: number;
  currency: string;
  updated_at: string;
  private: {
    full_name: string | null;
    national_id: string | null;
    guardian_name: string | null;
    guardian_relation: string | null;
    guardian_phone: string | null;
    address: string | null;
    family_size: number | null;
    family_income: number | null;
    health_notes: string | null;
    school_name: string | null;
    private_notes: string | null;
  } | null;
  needs: Array<{ category: string; title: string; monthly_amount: number; note: string | null }>;
  documents: Array<{
    id: string;
    kind: string;
    storage_path: string;
    file_name: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    verified: boolean;
    note: string | null;
  }>;
};

/** الملفّ كما في القاعدة لجهته: يملأ النموذج للتصحيح أو يُعرض للقراءة. */
export const getOrphanIntake = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orphanId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rec, error } = await rpc(context.supabase).rpc("get_orphan_intake", {
      _orphan: data.orphanId,
    });
    if (error || !rec) return null;
    return rec as OrphanIntakeRecord;
  });

/** خيارات الإدخال: الدول العاملة وعملاتها، وعملة المنصّة احتياطاً (A11Y-06). */
export const getIntakeOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    type Q = {
      from: (t: string) => {
        select: (c: string) => {
          in: (k: string, v: string[]) => { order: (k: string) => PromiseLike<{ data: unknown }> };
          maybeSingle: () => PromiseLike<{ data: unknown }>;
        };
      };
    };
    const db = context.supabase as unknown as Q;
    const [{ data: countries }, { data: settings }] = await Promise.all([
      db.from("countries").select("*").in("status", ["active", "emergency"]).order("sort_order"),
      db.from("platform_settings").select("currency").maybeSingle(),
    ]);
    type Row = { code: string; name_ar: string; currency?: string | null };
    const platform = (settings as { currency?: string } | null)?.currency ?? "USD";
    return {
      currency: platform,
      countries: ((countries ?? []) as Row[]).map((r) => ({
        code: r.code,
        name: r.name_ar,
        currency: r.currency ?? platform,
      })),
    };
  });

export const submitOrphanIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => intakeSchema.parse(input))
  .handler(async ({ data, context }) => {
    // جهة واحدة لا تُقدّم عشرين ملفاً في الساعة بشراً؛ والحدّ يمنع
    // استهلاك أرقام التسلسل ومساحة التخزين بمسودّات آلية.
    const { hitRateLimit } = await import("@/lib/rate-limit");
    const verdict = await hitRateLimit("intake", `u:${context.userId}`);
    if (!verdict.allowed) {
      return { ok: false as const, error: "طلبات كثيرة في وقت قصير. أعد المحاولة بعد قليل." };
    }

    const missing = missingRequiredDocs(data.documents.map((d) => d.kind));
    if (missing.length > 0) {
      return {
        ok: false as const,
        error: `مستندات إلزامية ناقصة: ${missing.map((k) => DOC_LABELS[k] ?? k).join("، ")}`,
      };
    }

    const db = withPhase2(context.supabase);
    const { data: res, error } = await db.rpc("create_orphan_intake", {
      _payload: intakePayload(data),
    });

    if (error) return { ok: false as const, error: error.message };
    const out = res as { id: string; code: string };
    return { ok: true as const, id: out.id, code: out.code };
  });

/**
 * بدء مسودّة.
 *
 * الوثائق تُرفع إلى `<orphan_id>/…` وعليه تقوم عزلة التخزين، لكن المعرّف
 * لا يوجد قبل إنشاء الملف والملف لا يكتمل قبل وثائقه. المسودّة تفكّ هذه
 * الدورة: يُنشأ الملف أولاً بحالة `draft` — غير منشورة ولا مرئية لأحد
 * خارج الجهة — فيصير له مجلّد تُرفع إليه الوثائق، ثم يُقدَّم.
 */
export const startOrphanDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orgId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = withPhase2(context.supabase);
    const { data: res, error } = await db.rpc("start_orphan_draft", { _org_id: data.orgId });
    if (error) return { ok: false as const, error: error.message };
    const out = res as { id: string; code: string };
    return { ok: true as const, id: out.id, code: out.code };
  });

/**
 * رابط رفع موقّع.
 *
 * الملفّ لا يمرّ عبر خادمنا: الرابط يُصدَر هنا ويرفع المتصفّح إلى التخزين
 * مباشرةً. فلا يُحمَّل الخادم بملفّات قد تبلغ عشرة ميغابايت، وتبقى سياسة
 * التخزين هي الحارس لا شيفرتنا.
 *
 * المسار يبدأ دائماً بمعرّف اليتيم، وعليه تقوم العزلة في السياسة.
 */
/**
 * مسار تخزين الوثيقة.
 *
 * العزلة في سياسة التخزين تقوم على أن المجلّد الأول هو معرّف اليتيم. فأي
 * شرطة مائلة في اسم الملف تُنشئ مجلّداً فرعياً، و«..» قد تُفسَّر صعوداً —
 * وكلاهما يكسر العزلة. لذا يُصفّى الاسم إلى حروف وأرقام ونقطة وشرطتين
 * لا غير، ويُقيَّد طوله.
 */
export function documentStoragePath(orphanId: string, kind: string, fileName: string, at: number) {
  const safe = fileName
    // كل ما ليس حرفاً ولا رقماً ولا نقطة ولا شرطة يصير شرطة سفلية.
    // هذا وحده يمنع الشرطة المائلة، فيبقى المسار مقطعين لا أكثر.
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    // ثم تُطوى النقاط المتتالية إلى واحدة وتُقصّ من الطرفين: «..» داخل
    // مقطع واحد غير ضارّ اليوم، لكن بعض أنظمة التخزين تُطبّع المسارات
    // فتحوّلها إلى صعود. إزالتها أرخص من الاتّكال على ألّا يحدث ذلك.
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\-_]+|[.\-_]+$/g, "")
    .slice(0, 120);
  // اسم فارغ بعد التطهير (اسم كلّه محارف ممنوعة) لا يُترك فارغاً.
  return `${orphanId}/${kind}-${at}-${safe || "file"}`;
}

export const createDocumentUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orphanId: z.string().uuid(),
        kind: z.enum(DOC_KINDS),
        fileName: z.string().trim().min(1).max(255),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const path = documentStoragePath(data.orphanId, data.kind, data.fileName, Date.now());

    const { data: signed, error } = await context.supabase.storage
      .from("orphan-documents")
      .createSignedUploadUrl(path);

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, path, token: signed.token, signedUrl: signed.signedUrl };
  });

/** رابط قراءة موقّع قصير العمر — لا يُخزَّن ولا يُشارَك. */
export const createDocumentReadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ path: z.string().trim().min(3).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("orphan-documents")
      // ستّون ثانية تكفي لفتح الوثيقة ولا تكفي لتسريبها.
      .createSignedUrl(data.path, 60);

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, url: signed.signedUrl };
  });

export const listOrphanDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orphanId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = withPhase2(context.supabase);
    const { data: docs, error } = await db
      .from("orphan_documents")
      .select(
        "id, kind, storage_path, file_name, mime_type, size_bytes, verified, note, created_at",
      )
      .eq("orphan_id", data.orphanId)
      .order("created_at", { ascending: true });

    if (error) return { ok: false as const, error: error.message, documents: [] };
    return { ok: true as const, documents: docs ?? [] };
  });

/** توثيق وثيقة — للإدارة، ويكتب أثراً تدقيقياً في القاعدة. */
export const verifyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        verified: z.boolean(),
        note: z.string().trim().max(400).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = withPhase2(context.supabase);
    const { error } = await db.rpc("verify_document", {
      _id: data.id,
      _verified: data.verified,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/**
 * ضبط موافقة الصورة من الجهة أو الإدارة.
 *
 * تمرّ بـ`record_photo_consent` في القاعدة، لا بتحديثٍ مباشر: الكتابة
 * المباشرة على `photo_consent*` مرفوضة (كانت تسمح بنسبة الموافقة للوليّ
 * ونقض سحبه). والوثيقة معرّفُ «إقرار موافقة على الصورة» وثّقته الإدارة —
 * لا نصٌّ حرّ — والفاعل من الجلسة. وسحب الوليّ لا يُنقض إلا منه أو من
 * الإدارة؛ والقاعدة هي التي تفصل.
 */
export const setPhotoConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orphanId: z.string().uuid(),
        consent: z.enum(["none", "face_hidden", "granted", "withdrawn"]),
        consentDocumentId: z.string().uuid().optional(),
        photoUrl: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = withPhase2(context.supabase);
    const { error } = await db.rpc("record_photo_consent", {
      _orphan: data.orphanId,
      _state: data.consent,
      _document: data.consentDocumentId ?? null,
      _photo_url: data.photoUrl || null,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
