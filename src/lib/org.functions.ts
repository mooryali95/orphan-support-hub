import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withPhase2, withProtection, type OrgOrphanRow } from "@/integrations/supabase/types.extra";

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

    /* المدينة محجوبةٌ بالمنح منذ حاجب الأطفال، فتُقرأ من دالّةٍ تفحص
       ملكيّة الجهة صفّاً صفّاً — والمنح دورٌ كامل لا صفٌّ بعينه. */
    const { data: rows } = await withProtection(supabase).rpc("org_orphans");
    const orphans = (rows ?? []) as OrgOrphanRow[];

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

/*
 * حُذفت `createOrphanProfile` هنا.
 *
 * كانت تُدرج الملف ثم بياناته السرّية بنداءين منفصلين، والثاني بلا فحص
 * خطأ (M3)، وتولّد الرمز بعشوائية معرّضة للتصادم (M4). وقد حلّ محلّها
 * `submitOrphanIntake` في `intake.functions.ts` التي تمرّ عبر دالة
 * معامَلاتية واحدة في القاعدة.
 *
 * ولم تُترك معطَّلةً بل حُذفت: مسار كتابة معطوب لا يستدعيه أحد اليوم
 * يبقى قابلاً لأن يُستدعى غداً.
 */
