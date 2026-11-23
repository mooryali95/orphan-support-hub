import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const listPublicOrganizations = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const supabase = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
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

  const { data, error } = await supabase
    .from("care_organizations")
    .select("id, name, city, region, about, logo_url")
    .eq("status", "approved")
    .order("name");

  if (error) return { organizations: [], error: error.message };
  return { organizations: data ?? [], error: null as string | null };
});

export const OFFICE_CATEGORIES = [
  "multi_program",
  "health",
  "relief",
  "youth_education",
  "survey_pending",
  "activity_scope",
] as const;
export type OfficeCategory = (typeof OFFICE_CATEGORIES)[number];

/** مكتبٌ للندوة كما تعرضه `public_offices_map()`: بلا أعضاء، والتجريبي موسوم. */
export type PublicOffice = {
  id: string;
  country: string;
  country_name: string;
  name: string;
  city: string | null;
  category: OfficeCategory | null;
  demo: boolean;
  active: boolean;
  source_url: string | null;
  source_seen_at: string | null;
};

/** سجلّ مكاتب الندوة على الخريطة — من القاعدة، فيُعدَّل ويُضاف ويُوقف من الإدارة. */
export const listOfficesMap = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const supabase = createClient(process.env["SUPABASE_URL"]!, key, {
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
  const { data, error } = await (
    supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc("public_offices_map");
  if (error) return { offices: [] as PublicOffice[], error: error.message };
  return { offices: (data ?? []) as PublicOffice[], error: null as string | null };
});
