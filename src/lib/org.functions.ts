import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withPhase2, withProtection, type OrgOrphanRow } from "@/integrations/supabase/types.extra";

export const getMyOrgWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: org } = await supabase
      .from("care_organizations")
      .select("id, name, city, region, status, license_number, contact_email")
      .eq("owner_id", userId)
      .maybeSingle();

    if (!org) return { org: null, orphans: [] };

    /* المدينة محجوبةٌ بالمنح منذ حاجب الأطفال، فتُقرأ من دالّةٍ تفحص
       ملكيّة الجهة صفّاً صفّاً — والمنح دورٌ كامل لا صفٌّ بعينه. */
    const { data: rows } = await withProtection(supabase).rpc("org_orphans");
    const orphans = (rows ?? []) as OrgOrphanRow[];

    return { org, orphans: orphans ?? [] };
  });

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};
const rpc = (client: unknown) => client as RpcClient;

/** وثائق التحقّق التي تُرفع مع طلب الجهة (PRD-16). */
export const ORG_DOC_KINDS = [
  "registration_certificate",
  "license",
  "representative_id",
  "other",
] as const;
export type OrgDocKind = (typeof ORG_DOC_KINDS)[number];

export const ORG_DOC_LABELS: Record<OrgDocKind, string> = {
  registration_certificate: "شهادة تسجيل الجهة",
  license: "الترخيص",
  representative_id: "هوية الممثّل القانوني",
  other: "وثيقة أخرى",
};

/** ما ينقص الجهة لتُعتمد — بالمفاتيح التي تُعيدها `care_org_kyc_missing`. */
export const ORG_MISSING_LABELS: Record<string, string> = {
  kyc: "بيانات التحقّق (الاسم القانوني، رقم التسجيل، العنوان، الممثّل القانوني)",
  registration_document: "شهادة التسجيل أو الترخيص",
};

export type OrgKyc = {
  org_id: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  kyc: {
    legal_name: string;
    registration_number: string;
    country_code: string;
    address: string;
    legal_rep_name: string;
    legal_rep_title: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    submitted_at: string;
    decision_note: string | null;
    reviewed_at: string | null;
  } | null;
  documents: Array<{ id: string; kind: OrgDocKind; file_name: string | null; created_at: string }>;
  missing: string[];
};

/** الدول التي تعمل فيها المنصّة — تسجيل الجهة وملفّ الطفل يختاران منها لا نصّاً حرّاً. */
export const listOperatingCountries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (
      context.supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            in: (
              k: string,
              v: string[],
            ) => {
              order: (k: string) => PromiseLike<{ data: unknown; error: unknown }>;
            };
          };
        };
      }
    )
      .from("countries")
      .select("*")
      .in("status", ["active", "emergency"])
      .order("sort_order");
    type Row = { code: string; name_ar: string; currency?: string | null };
    return ((data ?? []) as Row[]).map((r) => ({
      code: r.code,
      name: r.name_ar,
      currency: r.currency ?? null,
    }));
  });

const kycSchema = z.object({
  name: z.string().trim().min(3).max(140),
  legalName: z.string().trim().min(3).max(200),
  registrationNumber: z.string().trim().min(2).max(80),
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/),
  address: z.string().trim().min(5).max(400),
  legalRepName: z.string().trim().min(3).max(140),
  legalRepTitle: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().email().max(200).optional(),
  contactPhone: z.string().trim().min(5).max(40).optional(),
  city: z.string().trim().max(80).optional(),
  region: z.string().trim().max(80).optional(),
  about: z.string().trim().max(1000).optional(),
});
export type OrgRegistrationInput = z.infer<typeof kycSchema>;

/**
 * تسجيل جهة ميدانية — لأيّ حسابٍ مسجَّل (UX-03).
 *
 * يمرّ بـ`register_care_organization` في القاعدة: تُنشأ الجهة «بانتظار
 * الاعتماد» ويُمنح صاحبها دور care_org في معاملةٍ واحدة، والحقول
 * الإلزامية تُفحص هناك لا هنا وحدها. والطلب المرفوض يُصحَّح بالنداء نفسه.
 */
export const registerOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    kycSchema
      .refine((v) => Boolean(v.contactEmail || v.contactPhone), {
        message: "أدخل بريداً أو هاتفاً للتواصل",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await rpc(context.supabase).rpc("register_care_organization", {
      _payload: {
        name: data.name,
        legal_name: data.legalName,
        registration_number: data.registrationNumber,
        country_code: data.countryCode,
        address: data.address,
        legal_rep_name: data.legalRepName,
        legal_rep_title: data.legalRepTitle ?? "",
        contact_email: data.contactEmail ?? "",
        contact_phone: data.contactPhone ?? "",
        city: data.city ?? "",
        region: data.region ?? "",
        about: data.about ?? "",
      },
    });
    if (error) {
      return {
        ok: false as const,
        error:
          error.code === "42501"
            ? "لديك جهة معتمدة أو موقوفة؛ تعديل بياناتها يمرّ بالإدارة"
            : "تعذّر إرسال الطلب — تحقّق من الحقول الإلزامية",
      };
    }
    return { ok: true as const, id: (res as { id: string }).id };
  });

export const getMyOrgKyc = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await rpc(context.supabase).rpc("my_care_org_kyc");
    if (error || !data) return null;
    return data as OrgKyc;
  });

/** مسار وثيقة الجهة: مجلّدها الأوّل معرّفها، واسم الملف مطهَّر كوثائق الطفل. */
export function orgDocumentPath(orgId: string, kind: string, fileName: string, at: number) {
  const safe = fileName
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\-_]+|[.\-_]+$/g, "")
    .slice(0, 120);
  return `${orgId}/${kind}-${at}-${safe || "file"}`;
}

export const createOrgDocumentUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        kind: z.enum(ORG_DOC_KINDS),
        fileName: z.string().trim().min(1).max(255),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const path = orgDocumentPath(data.orgId, data.kind, data.fileName, Date.now());
    // سياسة الخزنة هي الحارس: لا يُوقَّع رفعٌ إلى مجلّد جهةٍ لا يملكها الطالب.
    const { data: signed, error } = await context.supabase.storage
      .from("org-documents")
      .createSignedUploadUrl(path);
    if (error) return { ok: false as const, error: "تعذّر تجهيز الرفع" };
    return { ok: true as const, path, signedUrl: signed.signedUrl };
  });

export const attachOrgDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        kind: z.enum(ORG_DOC_KINDS),
        path: z.string().trim().min(3).max(500),
        fileName: z.string().trim().max(255).optional(),
        mimeType: z.string().trim().max(120).optional(),
        sizeBytes: z.number().int().min(0).max(20_000_000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await rpc(context.supabase).rpc("attach_care_org_document", {
      _org: data.orgId,
      _kind: data.kind,
      _path: data.path,
      _file_name: data.fileName ?? null,
      _mime: data.mimeType ?? null,
      _size: data.sizeBytes ?? null,
    });
    if (error) return { ok: false as const, error: "تعذّر حفظ الوثيقة" };
    return { ok: true as const };
  });

export const removeOrgDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await rpc(context.supabase).rpc("remove_care_org_document", {
      _doc: data.id,
    });
    if (error) return { ok: false as const, error: "تعذّر حذف الوثيقة" };
    return { ok: true as const };
  });

/*
 * حُذفت `createOrphanProfile` هنا.
 *
 * كانت تُدرج الملف ثم بياناته السرّية بنداءين منفصلين، والثاني بلا فحص
 * خطأ (M3)، وتولّد الرمز بعشوائية معرّضة للتصادم (M4). وقد حلّ محلّها
 * `submitOrphanIntake` في `intake.functions.ts` التي تمرّ عبر دالة
 * معامَلاتية واحدة في القاعدة.
 *
 * ولم تُترك معطَّلةً بل حُذفت: مسار كتابة معطوب لا يستدعيه أحد اليوم
 * يبقى قابلاً لأن يُستدعى غداً.
 */
