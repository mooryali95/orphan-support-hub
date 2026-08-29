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

export const confirmManualTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sponsorshipId: z.string().uuid(),
        reference: z.string().trim().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await assertAdmin(context.supabase))) {
      return { ok: false as const, error: "غير مصرّح" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { withPayments, withPhase4 } = await import("@/integrations/supabase/types.extra");
    const db = withPayments(supabaseAdmin);

    const { data: sponsorship, error } = await db
      .from("sponsorships")
      .select("id, sponsor_id, amount, currency, status")
      .eq("id", data.sponsorshipId)
      .maybeSingle();

    if (error || !sponsorship) return { ok: false as const, error: "لا توجد كفالة بهذا المعرّف" };
    if (sponsorship.status === "active") return { ok: true as const, alreadyActive: true };
    if (sponsorship.status === "cancelled" || sponsorship.status === "completed") {
      return { ok: false as const, error: "هذه الكفالة منتهية" };
    }

    const { data: settings } = await db
      .from("platform_settings")
      .select("fee_percent")
      .maybeSingle();

    const amount = Number(sponsorship.amount);
    const fee = Math.round(amount * (Number(settings?.fee_percent ?? 0) / 100) * 100) / 100;
    const paidAt = new Date().toISOString();

    const { error: payError } = await db.from("sponsorship_payments").insert({
      sponsorship_id: sponsorship.id,
      sponsor_id: sponsorship.sponsor_id,
      amount,
      currency: sponsorship.currency,
      status: "paid",
      provider: "manual",
      provider_ref: data.reference ?? sponsorship.id.slice(0, 8).toUpperCase(),
      fee_amount: fee,
      net_amount: amount - fee,
      paid_at: paidAt,
    });

    if (payError && payError.code !== "23505") {
      return { ok: false as const, error: "تعذّر تسجيل الدفعة" };
    }

    const { error: activateError } = await db
      .from("sponsorships")
      .update({ status: "active", provider: "manual", started_at: paidAt })
      .eq("id", sponsorship.id);

    if (activateError) return { ok: false as const, error: "تعذّر تفعيل الكفالة" };

    // الإعلان بعد التفعيل، وفشله لا يُبطل وصول المال.
    const { error: announceError } = await withPhase4(supabaseAdmin).rpc("announce_payment", {
      _sponsorship: sponsorship.id,
      _succeeded: true,
      _amount: amount,
      _currency: sponsorship.currency,
    });
    if (announceError) console.error("[payments] تعذّر إشعار الكافل", announceError.message);

    return { ok: true as const };
  });
