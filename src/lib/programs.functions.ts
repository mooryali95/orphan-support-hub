import { createServerFn } from "@tanstack/react-start";
import { cachedPublic } from "@/lib/public-cache";
import { createClient } from "@supabase/supabase-js";
import { withPhase7, type ProgramRow } from "@/integrations/supabase/types.extra";

/**
 * كتالوج البرامج للعرض العام.
 *
 * الكتالوج عامّ القراءة بسياسة `programs_public_read`، فيُقرأ بالمفتاح
 * المنشور لا بمفتاح الخدمة: ما يراه الزائر هنا هو نفسه ما تسمح به RLS.
 */
function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        // مفاتيح `sb_` تُرفض إن أُرسلت في ترويسة Authorization أيضاً.
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export type PublicProgram = Pick<
  ProgramRow,
  | "id"
  | "slug"
  | "title"
  | "summary"
  | "category"
  | "monthly_price"
  | "currency"
  | "duration_months"
> & { deliverables: string[]; kind: "service" | "qualification" };

// الكتالوج عامّ (المفتاح العامّ) ونادر التغيّر: خمس دقائق في ذاكرة العامل.
export const listPrograms = createServerFn({ method: "GET" }).handler(() =>
  cachedPublic("programs", 300_000, loadPrograms, (v) => !v.error),
);

async function loadPrograms() {
  const supabase = withPhase7(publicClient());
  const { data, error } = await supabase
    .from("programs")
    .select(
      "id, slug, title, summary, category, monthly_price, currency, duration_months, deliverables, kind",
    )
    .eq("status", "active")
    // تعداد `program_kind` مرتّب service ثم qualification، فالتنازلي
    // يقدّم بناء الأهلية على الخدمة — وهو ترتيب المعنى لا الأبجدية.
    .order("kind", { ascending: false })
    .order("monthly_price", { ascending: false });

  // الكتالوج زينة الصفحة لا شرط عملها: خطأٌ فيه يُخفي القسم ولا يُسقط الصفحة.
  if (error) return { programs: [] as PublicProgram[], error: error.message };
  return { programs: (data ?? []) as PublicProgram[], error: null as string | null };
}
