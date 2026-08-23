import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyOrgWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: org } = await supabase
      .from("care_organizations")
      .select("id, name, city, region, status, license_number, contact_email")
      .eq("owner_id", userId)
      .maybeSingle();

    if (!org) return { org: null, orphans: [] };

    const { data: orphans } = await supabase
      .from("orphans")
      .select(
        "id, code, display_name, city, status, monthly_need, funded_monthly, currency, created_at",
      )
      .eq("org_id", org.id)
      .order("created_at", { ascending: false });

    return { org, orphans: orphans ?? [] };
  });

export const registerOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(3).max(140),
        licenseNumber: z.string().trim().max(60).optional(),
        city: z.string().trim().max(80).optional(),
        region: z.string().trim().max(80).optional(),
        contactEmail: z.string().email().optional(),
        about: z.string().trim().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("care_organizations")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();

    if (existing) {
      return { ok: false as const, error: "لديك جهة رعاية مسجّلة بالفعل" };
    }

    const { error } = await context.supabase.from("care_organizations").insert({
      owner_id: context.userId,
      name: data.name,
      license_number: data.licenseNumber ?? null,
      city: data.city ?? null,
      region: data.region ?? null,
      contact_email: data.contactEmail ?? null,
      about: data.about ?? null,
      status: "pending",
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const createOrphanProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        displayName: z.string().trim().min(2).max(80),
        gender: z.enum(["male", "female"]),
        birthDate: z.string().optional(),
        city: z.string().trim().max(80).optional(),
        region: z.string().trim().max(80).optional(),
        educationStage: z.string().trim().max(80).optional(),
        story: z.string().trim().max(2000).optional(),
        monthlyNeed: z.number().min(0).max(100000),
        fullName: z.string().trim().max(140).optional(),
        guardianName: z.string().trim().max(140).optional(),
        guardianPhone: z.string().trim().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: org } = await supabase
      .from("care_organizations")
      .select("id, status")
      .eq("id", data.orgId)
      .eq("owner_id", userId)
      .maybeSingle();

    if (!org) return { ok: false as const, error: "غير مصرّح لك برفع ملفات لهذه الجهة" };
    if (org.status !== "approved") {
      return { ok: false as const, error: "جهتك بانتظار اعتماد الإدارة قبل رفع الملفات" };
    }

    const code = `KFL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const { data: created, error } = await supabase
      .from("orphans")
      .insert({
        code,
        org_id: data.orgId,
        created_by: userId,
        display_name: data.displayName,
        gender: data.gender,
        birth_date: data.birthDate || null,
        city: data.city ?? null,
        region: data.region ?? null,
        education_stage: data.educationStage ?? null,
        story: data.story ?? null,
        monthly_need: data.monthlyNeed,
        status: "submitted",
      })
      .select("id")
      .single();

    if (error) return { ok: false as const, error: error.message };

    if (data.fullName || data.guardianName || data.guardianPhone) {
      await supabase.from("orphan_private").insert({
        orphan_id: created.id,
        full_name: data.fullName ?? null,
        guardian_name: data.guardianName ?? null,
        guardian_phone: data.guardianPhone ?? null,
      });
    }

    return { ok: true as const, id: created.id };
  });
