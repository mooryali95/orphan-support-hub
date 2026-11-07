import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * تأكيد التحويل البنكي يدوياً.
 *
 * مزوّد الدفع اليدوي لا يرسل webhook، فبغير هذا المسار تبقى كل كفالة
 * عالقة عند «بانتظار الدفع» إلى الأبد وإن وصل المال فعلاً. التأكيد هنا
 * يسلك نفس مسار الـwebhook تماماً: دفعة مدفوعة، ثم تفعيل العقد، ثم
 * إعلان الكافل — فلا يختلف أثر التحويل البنكي عن أثر البطاقة.
 *
 * الصلاحية تُفحص بعميل المستخدم قبل أي كتابة بـservice_role.
 */

async function assertAdmin(supabase: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc("is_admin");
  return data === true;
}

/** الكفالات المعلّقة بانتظار تأكيد تحويل. */
export const listAwaitingTransfers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await assertAdmin(context.supabase))) return { allowed: false as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { withPayments } = await import("@/integrations/supabase/types.extra");

    const { data, error } = await withPayments(supabaseAdmin)
      .from("sponsorships")
      .select("id, amount, currency, type, created_at, orphans(display_name, code)")
      .eq("status", "pending_payment")
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) return { allowed: true as const, rows: [] };

    const rows = (data ?? []).map((s) => {
      const orphan = s.orphans as { display_name?: string; code?: string } | null;
      return {
        id: s.id,
        amount: Number(s.amount),
        currency: s.currency,
        type: s.type,
        createdAt: s.created_at,
        orphanName: orphan?.display_name ?? "—",
        orphanCode: orphan?.code ?? "—",
        // نفس المرجع الذي يراه الكافل في صفحة التحويل.
        reference: s.id.slice(0, 8).toUpperCase(),
      };
    });

    return { allowed: true as const, rows };
  });

/**
 * تأكيد الاستلام بمطابقةٍ لا بضغطة (UX-15).
 *
 * كان التأكيد يُرسل معرّف الكفالة وحده، ويكتب بمفتاح الخدمة دفعةً بالمبلغ
 * المتوقَّع لا بما وصل، بلا تاريخ قيدٍ ولا مرجعٍ بنكي ولا أثرٍ لمن أكّد.
 * الآن يمرّ بـ`confirm_manual_transfer` في القاعدة بعميل المستخدم: الدور
 * يُفحص هناك، ولا تفعيل بلا المبلغ المستلَم وعملته وتاريخ القيد والمرجع،
 * والفرق لا يمرّ إلا بإقرارٍ وملاحظة، والأثر يُكتب في المعاملة نفسها.
 */
export const confirmManualTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sponsorshipId: z.string().uuid(),
        receivedAmount: z.number().positive().max(1_000_000),
        currency: z
          .string()
          .trim()
          .regex(/^[A-Za-z]{3}$/),
        valueDate: z
          .string()
          .trim()
          .regex(/^\d{4}-\d{2}-\d{2}$/),
        bankReference: z.string().trim().min(3).max(120),
        acceptMismatch: z.boolean().optional(),
        note: z.string().trim().max(400).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (
      context.supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => PromiseLike<{ error: { code?: string; message: string } | null }>;
      }
    ).rpc("confirm_manual_transfer", {
      _sponsorship: data.sponsorshipId,
      _received_amount: data.receivedAmount,
      _currency: data.currency.toUpperCase(),
      _value_date: data.valueDate,
      _bank_reference: data.bankReference,
      _accept_mismatch: data.acceptMismatch ?? false,
      _note: data.note ?? null,
    });
    if (!error) return { ok: true as const };
    const byCode: Record<string, string> = {
      "42501": "غير مصرّح",
      "23514": "المبلغ المستلَم يخالف المتوقَّع — أقِرّ بالفرق واكتب ملاحظة",
      "23505": "هذا المرجع البنكي مُطابَقٌ سلفاً على تحويلٍ آخر",
      "55000": "الكفالة لا تنتظر تحويلاً بنكياً (فُعّلت أو أُلغيت)",
      "22023": "تحقّق من المبلغ والعملة وتاريخ القيد والمرجع",
    };
    return { ok: false as const, error: byCode[error.code ?? ""] ?? "تعذّر تأكيد التحويل" };
  });
