import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicClient } from "@/lib/protection.functions";

/**
 * مسار الدعم ونموذج السمات.
 *
 * الكتالوج والنموذج عامّان (مفتاحٌ منشور)، والتعهّد بجلسة المستخدم.
 * إن تعذّر الاتصال بالقاعدة تعود الدوالّ بـ ok:false، فتعرض الصفحة
 * رسالةً هادئة بدل أن تنهار.
 */

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
const rpc = (client: unknown) => client as RpcClient;

export type SupportKind = "qualification" | "in_kind";
export type TargetType = "orphan" | "group" | "region" | "country" | "institution";

export type SupportCatalog = {
  countries: Array<{ code: string; name: string }>;
  regions: Array<{ country: string; name: string }>;
  groups: Array<{
    id: string;
    name: string;
    country: string;
    /** محجوبةٌ إن كان في أطفال المجموعة من حشده صغير — المنطقة تدلّ عليه. */
    region: string | null;
    /** لا يُنشر عددٌ دون حدّ الحشد (٥). */
    children: number | null;
  }>;
  institutions: Array<{
    id: string;
    name: string;
    kind: string | null;
    country: string;
    region: string | null;
  }>;
};

export type TraitModel = Array<{
  key: string;
  label: string;
  label_local: string | null;
  description: string | null;
  traits: Array<{
    id: string;
    name: string;
    name_local: string | null;
    definition: string | null;
    stage: string | null;
    elements: string[];
  }>;
}>;

export type MyPledge = {
  id: string;
  kind: SupportKind;
  target_type: TargetType;
  target: string | null;
  amount: number;
  currency: string;
  status: "pending" | "active" | "fulfilled" | "cancelled";
  created_at: string;
  deliveries?: Array<{ stage: "preparing" | "delivered"; at: string; documented: boolean }>;
};

export const getSupportCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await rpc(publicClient()).rpc("support_catalog");
  if (error) return { ok: false as const, catalog: null };
  return { ok: true as const, catalog: data as SupportCatalog };
});

export const getTraitModel = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await rpc(publicClient()).rpc("trait_model");
  if (error) return { ok: false as const, model: [] as TraitModel };
  return { ok: true as const, model: (data ?? []) as TraitModel };
});

export const createPledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        kind: z.enum(["qualification", "in_kind"]),
        targetType: z.enum(["orphan", "group", "region", "country", "institution"]),
        target: z.string().trim().min(1).max(200),
        amount: z.number().positive().max(1_000_000),
        country: z
          .string()
          .regex(/^[A-Z]{2}$/)
          .optional(),
        note: z.string().trim().max(1000).optional(),
        /** عملة الفجوة التي اقتُرح منها المبلغ؛ الافتراضي EUR. */
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional(),
        /** ثوانٍ من فتح المسار حتى التسجيل — لمقياس «ادعم في دقيقتين». */
        elapsed: z.number().int().min(0).max(86_400).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await rpc(context.supabase).rpc("create_support_pledge", {
      _kind: data.kind,
      _target_type: data.targetType,
      _target: data.target,
      _amount: data.amount,
      _country: data.country ?? null,
      _note: data.note || null,
      _currency: data.currency ?? "EUR",
      _elapsed: data.elapsed ?? null,
    });
    if (error) return { ok: false as const, error: pledgeError(error.message), id: null };
    return { ok: true as const, error: null, id: id as string };
  });

export const getMyPledges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await rpc(context.supabase).rpc("my_pledges");
    if (error) return { ok: false as const, pledges: [] as MyPledge[] };
    return { ok: true as const, pledges: (data ?? []) as MyPledge[] };
  });

/** رسائل القاعدة رموزٌ تقنية؛ الداعم يحتاج جملةً يفهمها. */
export function pledgeError(code: string): string {
  if (code.includes("country_not_active")) return "الدعم في هذه الدولة لم يُفتح بعد.";
  if (code.includes("target_not_found")) return "الهدف المختار غير متاح الآن.";
  if (code.includes("auth_required")) return "سجّل الدخول لتسجيل دعمك.";
  return "تعذّر تسجيل الدعم. حاول لاحقاً.";
}

export const KIND_INFO: Record<SupportKind, { label: string; text: string }> = {
  qualification: {
    label: "بناء الأهلية",
    text: "تموّل رحلة التأهيل: الجلسات، المتابعة، وقياس السمات قبل وبعد.",
  },
  in_kind: {
    label: "دعم عيني",
    text: "حقائب، كسوة، غذاء، أجهزة… يُسلَّم ويُوثَّق بالصور والتقارير.",
  },
};

export const TARGET_INFO: Record<TargetType, { label: string; text: string }> = {
  orphan: { label: "يتيم", text: "تختار طفلاً بعينه من الدليل." },
  group: { label: "مجموعة", text: "أطفال المجموعة الواحدة مع مشرفهم." },
  region: { label: "منطقة", text: "كل من في منطقة داخل الدولة." },
  country: { label: "دولة", text: "حيث الحاجة الأكبر في الدولة." },
  institution: { label: "مؤسسة", text: "مركز، مكتب، مدرسة… تعمل مع الأطفال." },
};
