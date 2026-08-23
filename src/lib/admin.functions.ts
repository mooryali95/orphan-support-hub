import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin) return { allowed: false as const };

    const [pendingOrphans, pendingOrgs, sponsorships] = await Promise.all([
      supabase
        .from("orphans")
        .select("id, code, display_name, city, region, monthly_need, currency, status, created_at")
        .in("status", ["submitted", "under_review"])
        .order("created_at", { ascending: true }),
      supabase
        .from("care_organizations")
        .select("id, name, city, region, license_number, contact_email, status, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
      supabase.from("sponsorships").select("id, amount, status"),
    ]);

    const rows = sponsorships.data ?? [];
    return {
      allowed: true as const,
      pendingOrphans: pendingOrphans.data ?? [],
      pendingOrgs: pendingOrgs.data ?? [],
      stats: {
        sponsorships: rows.length,
        active: rows.filter((r) => r.status === "active").length,
        monthlyActive: rows
          .filter((r) => r.status === "active")
          .reduce((acc, r) => acc + Number(r.amount), 0),
      },
    };
  });

export const reviewOrphan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        reason: z.string().trim().max(400).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) return { ok: false as const, error: "غير مصرّح" };

    const { error } = await context.supabase
      .from("orphans")
      .update({
        status: data.decision,
        approved_at: data.decision === "approved" ? new Date().toISOString() : null,
        rejection_reason: data.decision === "rejected" ? (data.reason ?? null) : null,
      })
      .eq("id", data.id);

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const reviewOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), decision: z.enum(["approved", "rejected"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) return { ok: false as const, error: "غير مصرّح" };

    const { error } = await context.supabase
      .from("care_organizations")
      .update({ status: data.decision })
      .eq("id", data.id);

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
