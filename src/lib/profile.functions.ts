import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  withProfile,
  type OrphanProfile,
  type ProfileCompleteness,
  type ProfileSection,
} from "@/integrations/supabase/types.extra";

/**
 * البروفايل الكامل — من حول الطفل.
 *
 * القسمة في القاعدة لا هنا: الجدول نفسه محجوبٌ عن غير الدائرة، والدالّة
 * تُسقط الأقسام الحسّاسة عمّن أُذن له بالاطّلاع وحده. فلا يُلتفّ عليها
 * بنداء REST مباشر.
 */

const SECTIONS = [
  "education",
  "health",
  "family",
  "social",
  "aspiration",
  "supervisor_note",
] as const;

/** الحقول المعروفة لكل قسم — تُطابق `profile_section_fields` في القاعدة. */
export const SECTION_FIELDS: Record<ProfileSection, Array<[string, string]>> = {
  education: [
    ["school_name", "المدرسة"],
    ["grade", "الصف"],
    ["performance", "المستوى الدراسي"],
    ["favourite_subject", "المادّة المفضّلة"],
    ["challenges", "التحدّيات"],
    ["support_needed", "الدعم اللازم"],
  ],
  health: [
    ["general_state", "الحالة العامّة"],
    ["chronic_conditions", "حالات مزمنة"],
    ["medications", "أدوية"],
    ["disability", "إعاقة"],
    ["last_checkup", "آخر فحص"],
  ],
  family: [
    ["lives_with", "يعيش مع"],
    ["siblings_count", "عدد الإخوة"],
    ["housing_type", "نوع السكن"],
    ["income_source", "مصدر الدخل"],
    ["caregiver_relation", "صلة من يرعاه"],
  ],
  social: [
    ["peer_relations", "علاقته بأقرانه"],
    ["confidence", "ثقته بنفسه"],
    ["interests", "اهتماماته"],
    ["concerns", "ما يقلقه"],
  ],
  aspiration: [
    ["wants_to_be", "يريد أن يكون"],
    ["skills", "مهاراته"],
    ["strengths", "مواطن قوّته"],
    ["what_would_help", "ما ينفعه"],
  ],
  supervisor_note: [
    ["readiness", "جاهزيّته للبرنامج"],
    ["recommendation", "التوصية"],
  ],
};

export const SECTION_LABELS: Record<ProfileSection, string> = {
  education: "التعليم",
  health: "الصحّة",
  family: "الأسرة والسكن",
  social: "النفسي والاجتماعي",
  aspiration: "الطموح والميول",
  supervisor_note: "ملاحظة المشرف",
};

/** ما لا يُفتح بإذن الاطّلاع — يُطابق `profile_section_is_sensitive`. */
export const SENSITIVE_SECTIONS: ProfileSection[] = [
  "health",
  "family",
  "social",
  "supervisor_note",
];

export const getOrphanProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orphanId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = withProfile(context.supabase);
    const { data: res, error } = await db.rpc("orphan_profile", { _orphan: data.orphanId });
    if (error) {
      return { profile: { may_read: false, sections: [] } as OrphanProfile, error: error.message };
    }
    return { profile: (res ?? { may_read: false, sections: [] }) as OrphanProfile, error: null };
  });

export const getProfileCompleteness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orphanId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = withProfile(context.supabase);
    const { data: res, error } = await db.rpc("orphan_profile_completeness", {
      _orphan: data.orphanId,
    });
    if (error) return { completeness: null as ProfileCompleteness | null };
    return { completeness: (res ?? null) as ProfileCompleteness | null };
  });

export const saveProfileSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orphanId: z.string().uuid(),
        section: z.enum(SECTIONS),
        // الحقول تُقيَّد هنا وفي القاعدة: الطبقتان تمنعان المكبّ.
        data: z.record(z.string(), z.string().trim().max(500)),
        note: z.string().trim().max(2000).optional(),
      })
      .refine(
        (v) =>
          Object.keys(v.data).every((k) =>
            SECTION_FIELDS[v.section].some(([field]) => field === k),
          ),
        { message: "حقلٌ لا يعرفه القسم" },
      )
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = withProfile(context.supabase);
    const { error } = await db.rpc("save_orphan_profile_section", {
      _orphan: data.orphanId,
      _section: data.section,
      _data: data.data,
      _note: data.note || undefined,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, error: null };
  });
