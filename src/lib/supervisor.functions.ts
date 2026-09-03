import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  withSupervisor,
  type MySupervisorProfile,
  type ProgramLevel,
  type SupervisedEnrollment,
} from "@/integrations/supabase/types.extra";

/**
 * المشرف — أهليّته ومن يُشرف عليهم.
 *
 * كان الدور يُسنَد إليه ولا سبيل له ليجد مستفيديه: عليه أن يُعطى معرّف
 * الالتحاق يدوياً. فالدور مُسنَد ولا يُمارَس.
 *
 * وأهليّته هو مشروطة: المنهجية تعقد للمشرف شهادة استقلالية بمؤشّر، وتنقله
 * في مستويات كما تنقل من يُدرّبهم. ومن يعتمده **الإدارة لا جهة الرعاية**
 * — جهةٌ تعتمد مشرفيها كجهةٍ تعتمد ملفّاتها.
 */

export const LEVEL_LABELS: Record<ProgramLevel, string> = {
  foundational: "تأسيسي",
  applied: "تطبيقي",
  advanced: "متقدّم",
};

export const getMySupervisorProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = withSupervisor(context.supabase);
    const { data, error } = await db.rpc("my_supervisor_profile");
    if (error) return { ok: false as const, error: error.message, profile: null };
    return { ok: true as const, error: null, profile: (data ?? null) as MySupervisorProfile };
  });

export const getMySupervisedEnrollments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = withSupervisor(context.supabase);
    const { data, error } = await db.rpc("my_supervised_enrollments");
    if (error) return { ok: false as const, error: error.message, enrollments: [] };
    return {
      ok: true as const,
      error: null,
      enrollments: (data ?? []) as SupervisedEnrollment[],
    };
  });

/** اعتماد مشرف — للإدارة وحدها، والقاعدة هي من تفرض ذلك. */
export const certifySupervisor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        level: z.enum(["foundational", "applied", "advanced"]),
        independence: z.number().int().min(0).max(100),
        note: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = withSupervisor(context.supabase);
    const { error } = await db.rpc("certify_supervisor", {
      _user: data.userId,
      _level: data.level,
      _independence: data.independence,
      _note: data.note || null,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, error: null };
  });
