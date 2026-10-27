import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { withProtection, type OrphanView } from "@/integrations/supabase/types.extra";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/**
 * الملفّ العامّ — بطاقةٌ دائماً، وتفاصيلُ عند الإذن وحده.
 *
 * كان هنا `select(PUBLIC_COLUMNS)` يقرأ القصّة والصورة والمدينة وتاريخ
 * الميلاد من الجدول مباشرةً. وقد سُحبت هذه الأعمدة من المنح في حاجب
 * الأطفال، فالقراءة تمرّ الآن بدالّةٍ تفحص صلة القارئ بالطفل.
 *
 * وجهةُ الرعاية تُقرأ كما كانت: بياناتها بيانات مؤسّسة معلنة، لا بيانات
 * طفل.
 */
export const getPublicOrphan = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { data: view } = await withProtection(supabase).rpc("orphan_view", {
      _orphan: data.id,
    });
    const orphan = (view ?? null) as OrphanView | null;
    if (!orphan) return { orphan: null, org: null };

    const { data: org } = orphan.org_id
      ? await supabase
          .from("care_organizations")
          .select("id, name, city, region, about")
          .eq("id", orphan.org_id)
          .maybeSingle()
      : { data: null };

    return { orphan, org: org ?? null };
  });

export const getPlatformStats = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const [{ count: total }, { count: sponsored }, { data: sums }] = await Promise.all([
    supabase
      .from("orphans")
      .select("id", { count: "exact", head: true })
      .in("status", ["approved", "fully_sponsored"]),
    supabase
      .from("orphans")
      .select("id", { count: "exact", head: true })
      .eq("status", "fully_sponsored"),
    supabase
      .from("orphans")
      .select("monthly_need, funded_monthly")
      .in("status", ["approved", "fully_sponsored"]),
  ]);

  const funded = (sums ?? []).reduce((acc, r) => acc + Number(r.funded_monthly ?? 0), 0);
  const need = (sums ?? []).reduce((acc, r) => acc + Number(r.monthly_need ?? 0), 0);

  return {
    totalOrphans: total ?? 0,
    fullySponsored: sponsored ?? 0,
    monthlyFunded: funded,
    monthlyNeed: need,
  };
});
