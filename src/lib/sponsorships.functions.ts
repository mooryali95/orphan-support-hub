import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

    await supabase.from("sponsorship_payments").insert({
      sponsorship_id: created.id,
      sponsor_id: userId,
      amount: data.amount,
      currency: orphan.currency,
      status: "pending",
    });

    return { ok: true as const, sponsorshipId: created.id };
  });

export const listMySponsorships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sponsorships")
      .select(
        "id, amount, currency, type, status, created_at, orphan:orphans(id, display_name, code, city, photo_url, monthly_need, funded_monthly)",
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
