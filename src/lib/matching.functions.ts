import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  withMatching,
  type SponsorPreferences,
  type SuggestedOrphan,
} from "@/integrations/supabase/types.extra";

/**
 * المطابقة — من يُرى أولاً.
 *
 * الترتيب في القاعدة لا هنا، وعمداً: ترتيبٌ في الواجهة يُلتفّ عليه بنداء
 * REST مباشر، والمنصّة تُخاطَب بمفتاحٍ منشور في المتصفّح.
 *
 * وهذه الطبقة لا تُرتّب ولا تُصفّي: تنقل ما ترتّبه القاعدة وسببَه.
 */

export const getSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(48).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = withMatching(context.supabase);
    const { data: rows, error } = await db.rpc("suggest_orphans_for_sponsor", {
      _limit: data.limit ?? 6,
    });
    // الترشيح زينة اللوحة لا شرطها: خطأٌ فيه يُخفي القسم ولا يُسقط الصفحة.
    if (error) return { ok: false as const, error: error.message, suggestions: [] };
    return {
      ok: true as const,
      error: null,
      suggestions: (rows ?? []) as SuggestedOrphan[],
    };
  });

export const getSponsorPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = withMatching(context.supabase);
    const [prefs, regions] = await Promise.all([
      db.rpc("my_sponsor_preferences"),
      db.rpc("published_regions"),
    ]);
    return {
      ok: !prefs.error as boolean,
      error: prefs.error?.message ?? null,
      preferences: (prefs.data ?? null) as SponsorPreferences,
      regions: (regions.data ?? []) as string[],
    };
  });

/**
 * الكتابة عبر دالّة `SECURITY INVOKER`: تبقى `profiles_update_own` هي
 * الحاكمة، والدالّة تختصر نداءً لقراءة المعرّف قبل الكتابة.
 */
export const saveSponsorPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        monthlyBudget: z.number().min(0).max(1_000_000).nullable(),
        preferredRegion: z.string().trim().max(120).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = withMatching(context.supabase);
    const { data: prefs, error } = await db.rpc("save_sponsor_preferences", {
      _budget: data.monthlyBudget,
      _region: data.preferredRegion,
    });
    if (error) return { ok: false as const, error: error.message, preferences: null };
    return { ok: true as const, error: null, preferences: prefs as SponsorPreferences };
  });
