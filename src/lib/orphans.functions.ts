import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

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

const PUBLIC_COLUMNS =
  "id, code, display_name, gender, birth_date, city, region, story, photo_url, education_stage, monthly_need, funded_monthly, currency, status, org_id, created_at";

// يُدرج مصطلح البحث نصياً في تعبير PostgREST المنطقي، فالفاصلة والقوس
// والنقطة تغيّر بنية الفلتر. نزيلها إضافةً إلى محارف بدل LIKE.
function sanitizeSearch(value: string) {
  return value
    .replace(/[%_,().:*"'\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const listSchema = z.object({
  region: z.string().trim().max(80).optional(),
  search: z.string().trim().max(80).optional(),
  onlyOpen: z.boolean().optional(),
  limit: z.number().int().min(1).max(60).optional(),
});

export const listPublicOrphans = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => listSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    let query = supabase
      .from("orphans")
      .select(PUBLIC_COLUMNS)
      .in("status", ["approved", "fully_sponsored"])
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 24);

    if (data.region) query = query.eq("region", data.region);
    if (data.onlyOpen) query = query.eq("status", "approved");
    const search = data.search ? sanitizeSearch(data.search) : "";
    if (search) query = query.or(`display_name.ilike.%${search}%,city.ilike.%${search}%`);

    const { data: rows, error } = await query;
    if (error) return { orphans: [], error: error.message };
    return { orphans: rows ?? [], error: null as string | null };
  });

export const getPublicOrphan = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { data: orphan } = await supabase
      .from("orphans")
      .select(PUBLIC_COLUMNS)
      .eq("id", data.id)
      .in("status", ["approved", "fully_sponsored"])
      .maybeSingle();

    if (!orphan) return { orphan: null, needs: [], org: null };

    const [{ data: needs }, { data: org }] = await Promise.all([
      supabase
        .from("orphan_needs")
        .select("id, category, title, monthly_amount")
        .eq("orphan_id", data.id),
      orphan.org_id
        ? supabase
            .from("care_organizations")
            .select("id, name, city, region, about")
            .eq("id", orphan.org_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return { orphan, needs: needs ?? [], org: org ?? null };
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
