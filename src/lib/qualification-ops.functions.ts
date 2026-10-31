import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  withQualificationOps,
  type EnrollmentDetail,
  type OrphanEnrollmentRow,
} from "@/integrations/supabase/types.extra";

/** ما تُرجعه `record_trait_assessment` بعد الحساب الخادمي. */
export type AssessmentResult = {
  id: string;
  phase: "baseline" | "progress" | "final";
  scores: Record<string, number>;
  core_trait: string | null;
  relational_trait: string | null;
  below_threshold: boolean;
};

/**
 * تشغيل بناء الأهلية — إسناد الأدوار، وتوثيق الإذن، وتقدّم المرحلة،
 * وتسجيل القياس.
 *
 * الصلاحية كلّها في القاعدة لا هنا: هذه الطبقة تنقل الطلب وتترجم الخطأ،
 * والدوالّ في القاعدة تفحص من يملك ماذا. فلا يُغني تجاوزها عن شيء.
 */

export const ENROLLMENT_ROLE_LABELS: Record<string, string> = {
  supervisor: "المشرف",
  jurist: "الفقيه",
  guardian: "الولي",
  trustee: "الوصي",
  mentor: "المرشد",
};

/** الأدوار التي يخصّها الإذن. */
export const CONSENT_ROLES = ["guardian", "trustee"] as const;

const roleSchema = z.enum(["supervisor", "jurist", "guardian", "trustee", "mentor"]);

export const getOrphanEnrollments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orphanId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = withQualificationOps(context.supabase);
    const { data: rows, error } = await db.rpc("orphan_enrollments", {
      _orphan: data.orphanId,
    });
    if (error) return { ok: false as const, error: error.message, enrollments: [] };
    return {
      ok: true as const,
      error: null,
      enrollments: (rows ?? []) as OrphanEnrollmentRow[],
    };
  });

export const getEnrollmentDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ enrollmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = withQualificationOps(context.supabase);
    const { data: row, error } = await db.rpc("enrollment_detail", {
      _enrollment: data.enrollmentId,
    });
    if (error) return { ok: false as const, error: error.message, detail: null };
    return { ok: true as const, error: null, detail: (row ?? null) as EnrollmentDetail | null };
  });

export const assignEnrollmentRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        enrollmentId: z.string().uuid(),
        role: roleSchema,
        personName: z.string().trim().max(160).optional(),
        // البريد اختياري: من له حساب يُربط به، ومن لا حساب له يُوثَّق باسمه.
        personEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
        personContact: z.string().trim().max(120).optional(),
        note: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = withQualificationOps(context.supabase);
    const { data: id, error } = await db.rpc("assign_enrollment_role", {
      _enrollment: data.enrollmentId,
      _role: data.role,
      _person_name: (data.personName ?? null) as never,
      _person_email: (data.personEmail ?? null) as never,
      _person_contact: (data.personContact ?? null) as never,
      _note: (data.note ?? null) as never,
    });
    if (error) return { ok: false as const, error: error.message, id: null };
    return { ok: true as const, error: null, id: id as string };
  });

export const recordEnrollmentConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        roleId: z.string().uuid(),
        // الوثيقة مطلوبة: إذنٌ بلا ما يُثبته إقرارٌ من الجهة على نفسها.
        document: z.string().trim().min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = withQualificationOps(context.supabase);
    const { error } = await db.rpc("record_enrollment_consent", {
      _role_id: data.roleId,
      _document: data.document,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, error: null };
  });

export const setEnrollmentStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        enrollmentId: z.string().uuid(),
        stage: z.enum(["concept", "trait", "system", "actions", "measurement", "qualified"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = withQualificationOps(context.supabase);
    const { data: stage, error } = await db.rpc("set_enrollment_stage", {
      _enrollment: data.enrollmentId,
      _stage: data.stage,
    });
    if (error) return { ok: false as const, error: error.message, stage: null };
    return { ok: true as const, error: null, stage: stage as string };
  });

export const recordTraitAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        enrollmentId: z.string().uuid(),
        // المجموع مئةٌ — والقاعدة هي من تفرضه؛ الفحص هنا للرسالة لا للأمان.
        scores: z.record(z.string().trim().max(40), z.number().int().min(0).max(100)),
        phase: z.enum(["baseline", "progress", "final"]),
        note: z.string().trim().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = withQualificationOps(context.supabase);
    const { data: res, error } = await db.rpc("record_trait_assessment", {
      _enrollment: data.enrollmentId,
      _scores: data.scores,
      _phase: data.phase,
      _note: (data.note ?? null) as never,
    });
    if (error) return { ok: false as const, error: error.message, result: null };
    return { ok: true as const, error: null, result: res as AssessmentResult };
  });
