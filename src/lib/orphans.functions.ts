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

    // في حشدٍ صغير تدلّ مدينة الجهة على الطفل: تُحذف من الردّ نفسه لا
    // من العرض فقط، فما يصل المتصفّح قد قُرئ.
    const safeOrg = org && orphan.cohort_small ? { ...org, city: null, region: null } : org;
    return { orphan, org: safeOrg ?? null };
  });

export type PlatformStats = {
  totalOrphans: number;
  fullySponsored: number;
  monthlyFunded: number;
  monthlyNeed: number;
  /**
   * لكلّ عملةٍ مجموعها (UX-07): الصفحة لا تكتب «$ 750» لملفاتٍ باليورو، ولا
   * تجمع العملتين. فارغةٌ في قاعدةٍ لم تُطبَّق عليها الهجرة فتُعرض «—».
   */
  byCurrency: Array<{ currency: string; monthlyNeed: number; monthlyFunded: number }>;
};

type StatsRow = {
  total: number;
  fully_sponsored: number;
  monthly_need: number | string;
  monthly_funded: number | string;
};

/** صفّ التجميع ← أرقام الصفحة؛ وما ليس رقماً لا يُعرض صفراً. */
export function toPlatformStats(row: unknown): PlatformStats | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Partial<StatsRow>;
  const n = (v: unknown) => (v == null ? NaN : Number(v));
  const out = {
    totalOrphans: n(r.total),
    fullySponsored: n(r.fully_sponsored),
    monthlyFunded: n(r.monthly_funded),
    monthlyNeed: n(r.monthly_need),
  };
  if (!Object.values(out).every(Number.isFinite)) return null;
  const raw = (row as { by_currency?: unknown }).by_currency;
  const byCurrency = (Array.isArray(raw) ? raw : [])
    .map((x: Record<string, unknown>) => ({
      currency: String(x["currency"] ?? "").toUpperCase(),
      monthlyNeed: n(x["monthly_need"]),
      monthlyFunded: n(x["monthly_funded"]),
    }))
    .filter(
      (x) =>
        /^[A-Z]{3}$/.test(x.currency) &&
        Number.isFinite(x.monthlyNeed) &&
        Number.isFinite(x.monthlyFunded),
    );
  return { ...out, byCurrency };
}

/**
 * أرقام الصفحة الأولى — تجميعٌ واحد في القاعدة (`public_platform_stats`)، لا
 * تنزيل كل الصفوف وجمعها هنا: PostgREST يقطع عند 1000 صفّ فيُنقص المجموع
 * بصمت (PERF-06). وإلى أن تصل الهجرة القاعدةَ المنشورة يبقى المسار القديم
 * احتياطاً.
 */
export const getPlatformStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlatformStats | null> => {
    const supabase = publicClient();
    const rpc = supabase as unknown as {
      rpc: (fn: string) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
    };
    const { data, error } = await rpc.rpc("public_platform_stats");
    if (!error) return toPlatformStats(data);
    // PGRST202: الدالّة لم تُنشأ بعد في هذه القاعدة. غير ذلك: «غير متاح».
    if (error.code !== "PGRST202") return null;
    return legacyPlatformStats(supabase);
  },
);

async function legacyPlatformStats(
  supabase: ReturnType<typeof publicClient>,
): Promise<PlatformStats | null> {
  const [{ count: total, error: e1 }, { count: sponsored, error: e2 }, { data: sums, error: e3 }] =
    await Promise.all([
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
        .select("monthly_need, funded_monthly, currency")
        .in("status", ["approved", "fully_sponsored"]),
    ]);

  // القاعدة متوقّفة أو تعذّر الوصول: «غير متاح» لا «صفر» — الصفر ادّعاء.
  if (e1 || e2 || e3) return null;

  return {
    totalOrphans: total ?? 0,
    fullySponsored: sponsored ?? 0,
    monthlyFunded: (sums ?? []).reduce((acc, r) => acc + Number(r.funded_monthly ?? 0), 0),
    monthlyNeed: (sums ?? []).reduce((acc, r) => acc + Number(r.monthly_need ?? 0), 0),
    byCurrency: [...new Set((sums ?? []).map((r) => r.currency))].map((currency) => ({
      currency,
      monthlyNeed: (sums ?? [])
        .filter((r) => r.currency === currency)
        .reduce((acc, r) => acc + Number(r.monthly_need ?? 0), 0),
      monthlyFunded: (sums ?? [])
        .filter((r) => r.currency === currency)
        .reduce((acc, r) => acc + Number(r.funded_monthly ?? 0), 0),
    })),
  };
}
