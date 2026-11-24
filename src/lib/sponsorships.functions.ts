import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withM5 } from "@/integrations/supabase/types.extra";
import {
  needOnly,
  parsePayOptions,
  quoteFor,
  unitInNeed,
  type PayOptions,
} from "@/lib/pay-options";
import { publicClient } from "@/lib/protection.functions";

/**
 * عملات الدفع لملفٍّ منشور: عملة حاجته، ثم عملة تشغيل دولته والعملة الموحّدة
 * حيث لهما سعرٌ مخزَّن ويحصّل بهما المزوّد. تُقرأ بدالّةٍ أحدث من الأنواع
 * المولَّدة (`sponsorship_pay_options`)، فإن غابت (هجرةٌ لم تُطبَّق) أو تعذّرت
 * عادت عملة الحاجة وحدها — كما كان قبل العملة الموحّدة.
 */
type PayRpc = {
  rpc: (
    fn: "sponsorship_pay_options",
    args: { _orphan: string },
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

async function readPayOptions(
  client: unknown,
  orphanId: string,
  needCurrency: string,
): Promise<PayOptions> {
  try {
    const { data, error } = await (client as PayRpc).rpc("sponsorship_pay_options", {
      _orphan: orphanId,
    });
    if (error) return needOnly(needCurrency);
    const parsed = parsePayOptions(data, needCurrency);
    // المزوّد يحدّ ما يُعرض: عملةٌ لا يحصّل بها شهرياً ولمرّة لا تُختار، والتحويل
    // اليدوي يُطابَق بعملة الحاجة وحدها.
    const { paymentProvider } = await import("@/lib/payments");
    const provider = paymentProvider();
    // لا تحصيل حقيقيّ بسعرٍ استرشادي: عملةٌ لا تُحوَّل إلى عملة الحاجة إلا عبر
    // سعرٍ غير معتمد (بذرة الهجرة مثلاً) لا تُعرض حتى ينشر المدير سعراً معتمداً.
    const firm = parsed.rates.filter((r) => !r.indicative);
    const convertible = (currency: string) =>
      firm.some(
        (r) =>
          (r.base === currency && r.quote === needCurrency) ||
          (r.quote === currency && r.base === needCurrency),
      );
    const options = parsed.options.filter(
      (o) =>
        o.currency === needCurrency ||
        (convertible(o.currency) &&
          provider.supportsCurrency?.(o.currency, true) === true &&
          provider.supportsCurrency(o.currency, false) === true),
    );
    return {
      needCurrency,
      options,
      // لا يُرسل سعرُ عملةٍ لم تُعرض.
      rates: parsed.rates.filter((r) =>
        options.some(
          (o) => o.currency !== needCurrency && (o.currency === r.base || o.currency === r.quote),
        ),
      ),
    };
  } catch {
    return needOnly(needCurrency);
  }
}

export const getPayOptions = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({ orphanId: z.string().uuid(), currency: z.string().regex(/^[A-Z]{3}$/) })
      .parse(input),
  )
  .handler(async ({ data }) => readPayOptions(publicClient(), data.orphanId, data.currency));

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

/**
 * بطاقة الاقتراح — ما تعرضه الواجهة وحده.
 *
 * لا منطقة ولا مرحلة دراسية ولا مدينة ولا صورة (APP-09): الاقتراح يُقرأ
 * بلا دخول، والمنطقة مع المرحلة في حشدٍ صغير تدلّ على طفلٍ بعينه. القاعدة
 * تحجبهما للحشد الصغير، والخادم هنا لا يمرّرهما أصلاً — فإن قُرئ من قاعدةٍ
 * لم تُطبَّق عليها هجرة الحجب بعد، لم يخرج منها شيء.
 */
export type SuggestedOrphan = {
  id: string;
  code: string;
  display_name: string;
  currency: string;
  monthly_need: number;
  funded_monthly: number;
  gap: number;
};

/** الصفّ من القاعدة ← البطاقة، بالحقول المسمّاة وحدها. */
export function toSuggestions(rows: unknown): SuggestedOrphan[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r: Record<string, unknown>) => ({
    id: String(r["id"]),
    code: String(r["code"] ?? ""),
    display_name: String(r["display_name"] ?? ""),
    currency: String(r["currency"] ?? ""),
    monthly_need: Number(r["monthly_need"] ?? 0),
    funded_monthly: Number(r["funded_monthly"] ?? 0),
    gap: Number(r["gap"] ?? 0),
  }));
}

/**
 * حال تمويل ملفّ — يُقرأ للزائر أيضاً، فالفائض جزء ممّا يُعرض.
 * بمفتاح الزائر لا بمفتاح الخدمة: ما يُقرأ بلا دخول يمرّ بمنح الزائر.
 */
export const getFundingState = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ orphanId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: state, error } = await withM5(publicClient()).rpc("orphan_funding_state", {
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
    // بلا دخول، فبمفتاح الزائر: الاقتراح يمرّ بمنحه وحجبه (APP-09).
    const db = withM5(publicClient());

    const { data: raw } = await db.rpc("orphan_funding_state", { _orphan: data.orphanId });
    const state = raw as FundingState | null;
    if (!state) return { ok: false as const, error: "الملفّ غير متاح", excess: 0, suggestions: [] };

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
      suggestions: toSuggestions(alts),
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
        /**
         * عملة الدفع التي كتب بها الكافل `amount`. غيابها أو مطابقتها لعملة
         * الحاجة = الدفع بعملة الحاجة كما كان.
         */
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional(),
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
      return { ok: false as const, error: "الملفّ غير متاح للكفالة حالياً" };
    }

    // عملة دفعٍ غير عملة الحاجة: يُتحقَّق أنها ممّا يُدفع به لهذا الطفل، ويُحسب
    // ما يُقيَّد لحاجته بالسعر المخزَّن. القاعدة تعيد الحساب نفسه عند الإدراج
    // (مُشغّل الإنشاء)، فالرقم هنا للمقارنة بالمتبقّي لا للحفظ.
    const payCurrency = data.currency && data.currency !== orphan.currency ? data.currency : null;
    let credited = data.amount;
    // المبلغ وحداتٌ كاملة من عملة الدفع: ما يزيد عن المتبقّي بأقلّ من وحدةٍ
    // أثرُ تقريبٍ («المتبقّي كاملاً» صعوداً) لا تجاوزٌ يُسأل عنه الكافل.
    let tolerance = 1;
    if (payCurrency) {
      const options = await readPayOptions(supabase, data.orphanId, orphan.currency);
      const quote = quoteFor(options, data.amount, payCurrency);
      if (!quote) {
        return {
          ok: false as const,
          error: `الدفع بعملة ${payCurrency} غير متاح لهذا الملفّ الآن. اختر عملة الملفّ (${orphan.currency}).`,
        };
      }
      // الاشتراك الشهري لدى المزوّد وحداتٌ كاملة من عملة الدفع.
      if (data.type === "monthly" && !Number.isInteger(data.amount)) {
        return { ok: false as const, error: "الكفالة الشهرية بمبلغٍ صحيح بلا كسور" };
      }
      credited = quote.credited.amount;
      tolerance = unitInNeed(options, payCurrency);
    }

    // التجاوز يحتاج إقراراً صريحاً. وليس منعاً: الطلب يعود بالمتبقّي
    // وباقتراحات، ثم يُعاد بـ`confirmExcess` إن أصرّ الكافل.
    // a one-time gift is not a share of the monthly need, so the monthly gap does not bound it
    if (!data.confirmExcess && data.type === "monthly") {
      // بجلسة الكافل نفسها لا بمفتاح الخدمة: الدالّتان ممنوحتان للمسجَّل.
      const db = withM5(supabase);
      const { data: raw } = await db.rpc("orphan_funding_state", { _orphan: data.orphanId });
      const state = raw as { gap: number } | null;
      const gap = Number(state?.gap ?? 0);

      // بعملة الحاجة يبقى الحدّ كما كان (أيّ زيادة تُسأل)؛ التسامح لأثر التقريب عند التحويل وحده.
      if (state && (payCurrency ? credited - gap >= tolerance : credited > gap)) {
        const { data: alts } = await db.rpc("suggest_orphans_for_amount", {
          _amount: credited - gap,
          _exclude: data.orphanId,
          _limit: 3,
        });
        return {
          ok: false as const,
          needsExcessConfirmation: true as const,
          gap,
          excess: credited - gap,
          suggestions: toSuggestions(alts),
          error: "المبلغ يتجاوز المتبقّي لهذا الملفّ",
        };
      }
    }

    const row = {
      sponsor_id: userId,
      orphan_id: data.orphanId,
      amount: credited,
      currency: orphan.currency,
      type: data.type,
      is_anonymous: data.isAnonymous,
      message: data.message ?? null,
      status: "pending_payment" as const,
    };
    // عمودا التحصيل أحدث من الأنواع المولَّدة؛ يُرسلان فقط حين اختيرت عملة دفعٍ
    // أخرى، فالمسار القديم لا يمسّه شيء إن لم تُطبَّق الهجرة بعد.
    const { data: created, error } = payCurrency
      ? await (supabase as unknown as ChargeInsert)
          .from("sponsorships")
          .insert({ ...row, charge_currency: payCurrency, charge_amount: data.amount })
          .select("id")
          .single()
      : await supabase.from("sponsorships").insert(row).select("id").single();

    if (error) {
      if (payCurrency && /currency_not_payable|charge_currency|charge_amount/.test(error.message)) {
        return {
          ok: false as const,
          error: `الدفع بعملة ${payCurrency} غير متاح لهذا الملفّ الآن. اختر عملة الملفّ (${orphan.currency}).`,
        };
      }
      return { ok: false as const, error: error.message };
    }
    if (!created) return { ok: false as const, error: "تعذّر تسجيل الكفالة، حاول لاحقاً" };

    // سجلّ المدفوعات يُكتب من webhook بوابة الدفع عبر service_role حصراً،
    // فلا يستطيع العميل تلفيق قيد بحالة "paid". قيد الدفعة يُنشأ في المرحلة 3
    // مع نيّة الدفع لدى المزوّد.
    return { ok: true as const, sponsorshipId: created.id };
  });

/** إدراج كفالةٍ بعمودَي التحصيل (هجرة العملة الموحّدة) — خارج الأنواع المولَّدة. */
type ChargeInsert = {
  from: (t: "sponsorships") => {
    insert: (row: Record<string, unknown>) => {
      select: (c: "id") => {
        single: () => PromiseLike<{
          data: { id: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

export const listMySponsorships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // حقول الدورة (موعد الإلغاء، الإيقاف) أحدث من الأنواع المولَّدة.
    const db = context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            c: string,
            v: string,
          ) => {
            order: (
              c: string,
              o: { ascending: boolean },
            ) => PromiseLike<{ data: MySponsorship[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
    const { data, error } = await db
      .from("sponsorships")
      .select(
        "id, amount, currency, type, status, created_at, started_at, ended_at, end_reason, cancel_effective_at, paused_until, provider_subscription_id, orphan:orphans(id, display_name, code, monthly_need, funded_monthly)",
      )
      .eq("sponsor_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) return { sponsorships: [] as MySponsorship[], error: error.message };
    return { sponsorships: data ?? [], error: null as string | null };
  });

export type MySponsorship = {
  id: string;
  amount: number;
  currency: string;
  type: "monthly" | "one_time" | "partial";
  status: "pending_payment" | "active" | "paused" | "cancelled" | "completed";
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  end_reason: "sponsor_cancelled" | "child_exit" | "provider_cancelled" | "admin" | null;
  cancel_effective_at: string | null;
  paused_until: string | null;
  provider_subscription_id: string | null;
  orphan: {
    id: string;
    display_name: string;
    code: string;
    monthly_need: number;
    funded_monthly: number;
  } | null;
};

type Rpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};

/** رسالة الخطأ كما يفهمها الكافل، من رمز القاعدة لا من نصّها. */
function lifecycleError(error: { message: string; code?: string }): string {
  if (error.code === "0A000")
    return "الكفالة بالبطاقة لا تُوقَف ولا يُعدَّل مبلغها من هنا بعد. يمكنك إنهاؤها ثم البدء بمبلغٍ جديد.";
  if (error.code === "55000") return "حال الكفالة لا تسمح بهذا الآن.";
  if (error.code === "22023") return "القيمة خارج الحدود المسموحة.";
  if (error.code === "P0002") return "لا توجد كفالة بهذا المعرّف.";
  return "تعذّر التنفيذ، حاول لاحقاً.";
}

export const CANCEL_REASONS = {
  financial: "ظرفٌ مالي",
  another_child: "أريد كفالة طفلٍ آخر",
  dissatisfied: "لست راضياً عن المتابعة",
  temporary: "أحتاج توقّفاً مؤقّتاً",
  other: "سببٌ آخر",
} as const;

/**
 * إنهاء الكفالة (APP-02 / PRD-10 / UX-02).
 *
 * الطلب المعلّق يُلغى فوراً، والجارية تبقى حتى آخر المدّة المدفوعة. القاعدة
 * تُبلغ الجهة والإدارة وتكتب الأثر؛ وإن كان للكفالة اشتراكٌ لدى المزوّد
 * يُلغى هنا فوراً عند نهاية الدورة (scheduled)، وإن تعذّر أعادته المطابقة.
 */
export const cancelSponsorship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.enum(Object.keys(CANCEL_REASONS) as [keyof typeof CANCEL_REASONS]).optional(),
        note: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await (context.supabase as unknown as Rpc).rpc(
      "sponsor_cancel_sponsorship",
      { _sponsorship: data.id, _reason: data.reason ?? null, _note: data.note || null },
    );
    if (error) return { ok: false as const, error: lifecycleError(error) };
    const r = res as {
      status: string;
      effective_at: string;
      immediate: boolean;
      provider_cancel: boolean;
    };

    if (r.provider_cancel) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { paymentProvider } = await import("@/lib/payments");
        const { processProviderCancellations } = await import("@/lib/payments/reconcile");
        type Db = Parameters<typeof processProviderCancellations>[0];
        await processProviderCancellations(
          supabaseAdmin as unknown as Db,
          paymentProvider(),
          data.id,
        );
      } catch (cause) {
        // الطلب سُجّل في القاعدة؛ المطابقة الدورية تعيد المحاولة.
        console.error("[sponsorships] تعذّر الإلغاء لدى المزوّد الآن", cause);
      }
    }
    return { ok: true as const, effectiveAt: r.effective_at, immediate: r.immediate };
  });

/** إيقافٌ مؤقّت من شهرٍ إلى ثلاثة — لكفالات التحويل (UX-13). */
export const pauseSponsorship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), months: z.number().int().min(1).max(3) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await (context.supabase as unknown as Rpc).rpc(
      "sponsor_pause_sponsorship",
      { _sponsorship: data.id, _months: data.months },
    );
    if (error) return { ok: false as const, error: lifecycleError(error) };
    return { ok: true as const, pausedUntil: (res as { paused_until: string }).paused_until };
  });

export const resumeSponsorship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as unknown as Rpc).rpc("sponsor_resume_sponsorship", {
      _sponsorship: data.id,
    });
    if (error) return { ok: false as const, error: lifecycleError(error) };
    return { ok: true as const };
  });

/** تعديل المبلغ الشهري — من التحويل القادم (UX-13). */
export const changeSponsorshipAmount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), amount: z.number().int().min(5).max(100000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as unknown as Rpc).rpc("sponsor_change_amount", {
      _sponsorship: data.id,
      _amount: data.amount,
    });
    if (error) return { ok: false as const, error: lifecycleError(error) };
    return { ok: true as const };
  });
