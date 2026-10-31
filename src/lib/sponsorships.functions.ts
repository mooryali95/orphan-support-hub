import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withM5 } from "@/integrations/supabase/types.extra";

/**
 * التمويل الزائد (M5) — يُقترَح لا يُرفَض.
 *
 * كافل يدفع 200$ لملفٍ متبقّيه 40$ يُرسل 160$ إلى طفل مكفول بينما ينتظر
 * غيره. والرفض ليس الجواب: كافل يُردّ عند لحظة العطاء قد لا يعود.
 *
 * فيُعرض عليه المتبقّي الحقيقي وتُقترح ملفّات يغطّي فائضه احتياجها. وإن
 * أصرّ على هذا الطفل — وهو حقّه، فقد اختاره لسبب — قُبل عطاؤه كاملاً.
 */
export type FundingState = {
  need: number;
  funded: number;
  currency: string;
  gap: number;
  surplus: number;
  surplus_unlocks: { title: string; summary: string; monthly_price: number; slug: string } | null;
};

export type SuggestedOrphan = {
  id: string;
  code: string;
  display_name: string;
  city: string | null;
  region: string | null;
  education_stage: string | null;
  photo_url: string | null;
  currency: string;
  monthly_need: number;
  funded_monthly: number;
  gap: number;
};

/** حال تمويل ملف — يُقرأ للزائر أيضاً، فالفائض جزء ممّا يُعرض. */
export const getFundingState = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ orphanId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: state, error } = await withM5(supabaseAdmin).rpc("orphan_funding_state", {
      _orphan: data.orphanId,
    });
    if (error) return { ok: false as const, error: error.message, state: null };
    return { ok: true as const, state: (state as FundingState | null) ?? null };
  });

/**
 * معاينة قبل الإنشاء.
 *
 * تُستدعى حين يغيّر الكافل المبلغ، فيرى أثر اختياره **قبل** أن يلتزم.
 * والاقتراح هنا لا في رسالة خطأ بعد الرفض: الفرق أن الأول توجيه والثاني
 * لوم.
 */
export const previewSponsorship = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ orphanId: z.string().uuid(), amount: z.number().min(0).max(100000) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = withM5(supabaseAdmin);

    const { data: raw } = await db.rpc("orphan_funding_state", { _orphan: data.orphanId });
    const state = raw as FundingState | null;
    if (!state) return { ok: false as const, error: "الملف غير متاح", excess: 0, suggestions: [] };

    const excess = Math.max(0, data.amount - state.gap);
    if (excess <= 0) {
      return { ok: true as const, excess: 0, gap: state.gap, suggestions: [] as SuggestedOrphan[] };
    }

    const { data: alts } = await db.rpc("suggest_orphans_for_amount", {
      _amount: excess,
      _exclude: data.orphanId,
      _limit: 3,
    });

    return {
      ok: true as const,
      excess,
      gap: state.gap,
      suggestions: (alts as SuggestedOrphan[] | null) ?? [],
    };
  });

export const createSponsorship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orphanId: z.string().uuid(),
        amount: z.number().min(5).max(100000),
        type: z.enum(["monthly", "one_time"]).default("monthly"),
        isAnonymous: z.boolean().default(false),
        message: z.string().trim().max(500).optional(),
        /** إقرار الكافل بأن مبلغه يتجاوز المتبقّي وأنه يريده لهذا الطفل. */
        confirmExcess: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: orphan, error: orphanError } = await supabase
      .from("orphans")
      .select("id, currency, status")
      .eq("id", data.orphanId)
      .maybeSingle();

    if (orphanError) return { ok: false as const, error: orphanError.message };
    if (!orphan || !["approved", "fully_sponsored"].includes(orphan.status)) {
      return { ok: false as const, error: "الملف غير متاح للكفالة حالياً" };
    }

    // التجاوز يحتاج إقراراً صريحاً. وليس منعاً: الطلب يعود بالمتبقّي
    // وباقتراحات، ثم يُعاد بـ`confirmExcess` إن أصرّ الكافل.
    if (!data.confirmExcess) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const db = withM5(supabaseAdmin);
      const { data: raw } = await db.rpc("orphan_funding_state", { _orphan: data.orphanId });
      const state = raw as { gap: number } | null;
      const gap = Number(state?.gap ?? 0);

      if (state && data.amount > gap) {
        const { data: alts } = await db.rpc("suggest_orphans_for_amount", {
          _amount: data.amount - gap,
          _exclude: data.orphanId,
          _limit: 3,
        });
        return {
          ok: false as const,
          needsExcessConfirmation: true as const,
          gap,
          excess: data.amount - gap,
          suggestions: (alts as SuggestedOrphan[] | null) ?? [],
          error: "المبلغ يتجاوز المتبقّي لهذا الملف",
        };
      }
    }

    const { data: created, error } = await supabase
      .from("sponsorships")
      .insert({
        sponsor_id: userId,
        orphan_id: data.orphanId,
        amount: data.amount,
        currency: orphan.currency,
        type: data.type,
        is_anonymous: data.isAnonymous,
        message: data.message ?? null,
        status: "pending_payment",
      })
      .select("id")
      .single();

    if (error) return { ok: false as const, error: error.message };

    // سجلّ المدفوعات يُكتب من webhook بوابة الدفع عبر service_role حصراً،
    // فلا يستطيع العميل تلفيق قيد بحالة "paid". قيد الدفعة يُنشأ في المرحلة 3
    // مع نيّة الدفع لدى المزوّد.
    return { ok: true as const, sponsorshipId: created.id };
  });

export const listMySponsorships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sponsorships")
      .select(
        "id, amount, currency, type, status, created_at, orphan:orphans(id, display_name, code, monthly_need, funded_monthly)",
      )
      .eq("sponsor_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) return { sponsorships: [], error: error.message };
    return { sponsorships: data ?? [], error: null as string | null };
  });

export const cancelSponsorship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sponsorships")
      .update({ status: "cancelled", ended_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("sponsor_id", context.userId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
