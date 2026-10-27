import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  withPhase4,
  withProtection,
  type GuardianOrphanRow,
} from "@/integrations/supabase/types.extra";

/**
 * حلقة الأثر — التقارير والخط الزمني والإشعارات.
 *
 * الكافل يدفع شهرياً؛ وما لم يصله خبرٌ عن أثر ماله فالكفالة اشتراك صامت
 * يُلغى عند أول مراجعة للحساب. هذه الدوال هي ما يجعله يرى الأثر.
 */

export const REPORT_STATUS_LABELS: Record<string, string> = {
  submitted: "بانتظار المراجعة",
  approved: "منشور",
  rejected: "أُعيد للتصحيح",
};

export const TIMELINE_LABELS: Record<string, string> = {
  "orphan.approved": "اعتُمد الملف ونُشر",
  "orphan.rejected": "أُعيد الملف للتصحيح",
  "report.submitted": "رُفع تقرير دوري",
  "report.published": "نُشر تقرير الأثر",
  "report.rejected": "أُعيد التقرير للتصحيح",
  "sponsorship.started": "بدأت الكفالة",
  disbursement_delivered: "وصلت كفالة الشهر موثّقة",
};

/** الفترة بصيغة YYYY-MM — نفس ما تفرضه القاعدة. */
const periodSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "الفترة بصيغة YYYY-MM");

export const submitProgressReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orphanId: z.string().uuid(),
        period: periodSchema,
        educationNote: z.string().trim().max(2000).optional(),
        healthNote: z.string().trim().max(2000).optional(),
        livingNote: z.string().trim().max(2000).optional(),
        summary: z.string().trim().max(2000).optional(),
        attachments: z.array(z.string().trim().max(500)).max(10).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = withPhase4(context.supabase);
    const { data: res, error } = await db.rpc("submit_progress_report", {
      _payload: {
        orphan_id: data.orphanId,
        period: data.period,
        education_note: data.educationNote ?? "",
        health_note: data.healthNote ?? "",
        living_note: data.livingNote ?? "",
        summary: data.summary ?? "",
        attachments: data.attachments,
      },
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, id: (res as { id: string }).id };
  });

export const reviewProgressReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().max(600).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.decision === "rejected" && !data.note) {
      return { ok: false as const, error: "الرفض يحتاج ملاحظة توضّح ما يُصحَّح" };
    }
    const db = withPhase4(context.supabase);
    const { error } = await db.rpc("review_progress_report", {
      _id: data.id,
      _decision: data.decision,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/** تقارير ملف واحد — RLS تحجب غير المعتمَد عن الكافل. */
export const listReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orphanId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = withPhase4(context.supabase);
    const { data: rows, error } = await db
      .from("progress_reports")
      .select(
        "id, period, status, summary, education_note, health_note, living_note, attachments, review_note, published_at, created_at",
      )
      .eq("orphan_id", data.orphanId)
      .order("period", { ascending: false });

    if (error) return { ok: false as const, error: error.message, reports: [] };
    return { ok: true as const, reports: rows ?? [] };
  });

/** طابور التقارير المعلّقة — للإدارة. */
export const listPendingReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = withPhase4(context.supabase);
    const { data: rows, error } = await db
      .from("progress_reports")
      .select(
        "id, orphan_id, period, summary, education_note, health_note, living_note, attachments, created_at, orphans(display_name, code)",
      )
      .eq("status", "submitted")
      .order("created_at", { ascending: true });

    if (error) return { ok: false as const, error: error.message, reports: [] };
    return { ok: true as const, reports: rows ?? [] };
  });

export const listTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orphanId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("timeline_events")
      .select("id, event_type, detail, created_at")
      .eq("orphan_id", data.orphanId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return { ok: false as const, error: error.message, events: [] };
    return { ok: true as const, events: rows ?? [] };
  });

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = withPhase4(context.supabase);
    const { data: rows, error } = await db
      .from("notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) return { ok: false as const, error: error.message, notifications: [], unread: 0 };
    const notifications = rows ?? [];
    return {
      ok: true as const,
      notifications,
      unread: notifications.filter((n) => !n.read_at).length,
    };
  });

/**
 * وسم الإشعارات مقروءة.
 *
 * بلا `id` تُوسم كلّها. والسياسة تقصر التحديث على `user_id = auth.uid()`،
 * فلا يستطيع أحد وسم إشعارات غيره ولو أرسل معرّفاً ليس له.
 */
export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = withPhase4(context.supabase);
    const now = new Date().toISOString();
    let q = db.from("notifications").update({ read_at: now }).is("read_at", null);
    if (data.id) q = q.eq("id", data.id);

    const { error } = await q;
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/**
 * مساحة ولي الأمر.
 *
 * الدور معرَّف في المخطّط منذ البداية (`orphans.guardian_id`) ولم يُخدَم
 * بشاشة قطّ. وولي الأمر هو أقرب الناس إلى اليتيم: يرى ما تراه الجهة عن
 * ملفه، ويقرأ التقارير المنشورة عنه، دون أن يرى شيئاً عن كفلائه — لا
 * أسماءهم ولا مبالغهم. تلك علاقة بين الكافل والمنصة لا بينه وبين الأسرة.
 */
export const getGuardianWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = withPhase4(context.supabase);
    /* `guardian_id` محجوبٌ بالمنح — وهو معرّف بالغٍ — فلا يُرشَّح به
       من العميل. والدالّة تقرأ الصلة من الجلسة. */
    const { data: rows, error } = await withProtection(context.supabase).rpc("guardian_orphans");
    const orphans = (rows ?? []) as GuardianOrphanRow[];

    if (error) return { ok: false as const, error: error.message, orphans: [] };
    return { ok: true as const, orphans: orphans ?? [] };
  });
