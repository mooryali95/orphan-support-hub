import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { signChildPhoto } from "@/lib/child-photo";
import {
  withProtection,
  type AccessRequestRow,
  type OrphanCardRow,
  type OrphanFilterOptions,
  type OrphanView,
} from "@/integrations/supabase/types.extra";

/**
 * حاجب الأطفال — الدليل بطاقةٌ، والملفّ يُطلَب ويُؤذَن فيه.
 *
 * الحاجب في القاعدة لا هنا: المنح مضيَّقة على `orphans`، والتفاصيل
 * تمرّ بدالّةٍ تفحص الصلة. وهذه الطبقة تنقل ولا تحرس — حراسةٌ في
 * الخادم وحده يلتفّ عليها نداءُ REST مباشر بالمفتاح المنشور.
 */

export function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
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

const filterSchema = z.object({
  country: z.string().trim().max(80).nullish(),
  region: z.string().trim().max(80).nullish(),
  ageBand: z
    .enum(["under_6", "age_6_11", "age_12_14", "age_15_17", "age_18_plus", "unknown"])
    .nullish(),
  gender: z.enum(["male", "female"]).nullish(),
  educationStage: z.string().trim().max(80).nullish(),
  funding: z.enum(["any", "open", "full"]).nullish(),
  building: z.boolean().nullish(),
  search: z.string().trim().max(80).nullish(),
  sort: z.enum(["waiting", "closest", "newest", "documented"]).nullish(),
  limit: z.number().int().min(1).max(60).optional(),
  offset: z.number().int().min(0).max(10_000).optional(),
  group: z.string().uuid().nullish(),
});

export const listOrphanCards = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => filterSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const db = withProtection(publicClient());
    const { data: res, error } = await db.rpc("list_orphan_cards", {
      _country: (data.country ?? null) as never,
      _region: (data.region ?? null) as never,
      _age_band: (data.ageBand ?? null) as never,
      _gender: (data.gender ?? null) as never,
      _education_stage: (data.educationStage ?? null) as never,
      _funding: (data.funding ?? null) as never,
      _building: (data.building ?? null) as never,
      _search: (data.search ?? null) as never,
      _sort: data.sort ?? "waiting",
      _limit: data.limit ?? 24,
      _offset: data.offset ?? 0,
      _group: (data.group ?? null) as never,
    });
    if (error) return { rows: [] as OrphanCardRow[], total: 0, error: error.message };
    const payload = (res ?? {}) as { rows?: OrphanCardRow[]; total?: number };
    return {
      rows: payload.rows ?? [],
      total: payload.total ?? 0,
      error: null as string | null,
    };
  });

export const getFilterOptions = createServerFn({ method: "GET" }).handler(async () => {
  const db = withProtection(publicClient());
  const { data, error } = await db.rpc("orphan_filter_options");
  if (error) {
    return { countries: [], regions: [], stages: [] } satisfies OrphanFilterOptions;
  }
  return (data ?? { countries: [], regions: [], stages: [] }) as OrphanFilterOptions;
});

/**
 * الملفّ — بجلسةٍ إن وُجدت، وبلا جلسةٍ للزائر.
 *
 * الزائر يُخدَم بالعميل العامّ فيرى البطاقة؛ والمسجَّل يُخدَم بجلسته
 * فيحسب الحاجبُ صلتَه. ولا فرق في الحراسة: هي في القاعدة للاثنين.
 */
export const getOrphanView = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ orphanId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const db = withProtection(publicClient());
    const { data: view, error } = await db.rpc("orphan_view", { _orphan: data.orphanId });
    if (error) return { orphan: null as OrphanView | null, error: error.message };
    return { orphan: (view ?? null) as OrphanView | null, error: null as string | null };
  });

export const getOrphanViewAuthed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orphanId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = withProtection(context.supabase);
    const { data: view, error } = await db.rpc("orphan_view", { _orphan: data.orphanId });
    if (error) return { orphan: null as OrphanView | null, error: error.message };
    const orphan = (view ?? null) as OrphanView | null;
    /* الصورة مسارٌ في الخزنة الخاصّة: تُوقَّع بجلسة القارئ نفسه، فسياسة
       الخزنة تفحص «الهوية» والموافقة مرّةً ثانية، والرابط ينقضي بعد دقائق. */
    if (orphan?.detail) {
      orphan.detail.photo_url = await signChildPhoto(
        context.supabase,
        orphan.id,
        orphan.detail.photo_url,
      );
    }
    return { orphan, error: null as string | null };
  });

export const requestOrphanAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orphanId: z.string().uuid(),
        // عشرون حرفاً هي حدّ القاعدة نفسه: تكرارُه هنا يمنع رحلةً ضائعة.
        reason: z.string().trim().min(20).max(1000),
        package: z
          .string()
          .regex(/^[a-z_]{2,40}$/)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // بحزمةٍ أو بدونها: النسخة الثلاثية تُسجّل الحزمة وتمرّ بالنسخة الأصل.
    const db = context.supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
    const { data: res, error } = await db.rpc(
      "request_orphan_access",
      data.package
        ? { _orphan: data.orphanId, _reason: data.reason, _package: data.package }
        : { _orphan: data.orphanId, _reason: data.reason },
    );
    if (error) return { ok: false as const, error: error.message, status: null };
    const r = (res ?? {}) as { status?: string };
    return { ok: true as const, error: null, status: r.status ?? "pending" };
  });

export const listAccessRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ status: z.enum(["pending", "approved", "rejected", "revoked", "any"]) })
      .parse(input ?? { status: "pending" }),
  )
  .handler(async ({ data, context }) => {
    const db = withProtection(context.supabase);
    const { data: rows, error } = await db.rpc("admin_access_requests", {
      _status: data.status,
    });
    if (error) return { ok: false as const, error: error.message, requests: [] };
    return {
      ok: true as const,
      error: null,
      requests: (rows ?? []) as AccessRequestRow[],
    };
  });

export const decideAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().max(500).optional(),
        days: z.number().int().min(1).max(365).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = withProtection(context.supabase);
    const { error } = await db.rpc("decide_orphan_access", {
      _request: data.requestId,
      _decision: data.decision,
      _note: (data.note || null) as never,
      _days: data.days ?? 180,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, error: null };
  });

export const revokeAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ requestId: z.string().uuid(), note: z.string().trim().max(500).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = withProtection(context.supabase);
    const { error } = await db.rpc("revoke_orphan_access", {
      _request: data.requestId,
      _note: (data.note || null) as never,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, error: null };
  });

/**
 * مصدر الجغرافيا الواحد — أعداد الدول والمناطق كما تُعيدها `geo_stats`.
 * الخارطة وقائمتا البلد والمنطقة في الدليل تقرأ منه وحده. وعند تعذّر
 * القاعدة (متوقّفة أو لم تُطبَّق الهجرة) يعود `available: false`، فتقرّر
 * الواجهة ما تعرضه بدل أن تنهار.
 */
export const getGeoStats = createServerFn({ method: "GET" }).handler(async () => {
  const db = withProtection(publicClient());
  const { data, error } = await db.rpc("geo_stats" as never);
  if (error || !data) {
    // يُسجَّل التعذّر: الخارطة تقول «غير متاحة» للزائر، والانقطاع لا يمرّ صامتاً (ARC-11).
    console.error("geo_stats unavailable", error?.code ?? "no-data", error?.message ?? "");
    return { available: false as const, countries: [] as GeoCountryRow[] };
  }
  return {
    available: true as const,
    countries: (data as { countries?: GeoCountryRow[] }).countries ?? [],
  };
});

export type GeoRegionRow = {
  region: string;
  small: boolean;
  total: number | null;
  sponsored: number | null;
  /** طبقات الخارطة (هجرة 0929): الفجوة بالعملة الغالبة، والتسليمات الموثّقة خلال ٩٠ يوماً. */
  gap?: number | string | null;
  currency?: string | null;
  delivered?: number | null;
};
export type GeoCountryRow = Omit<GeoRegionRow, "region"> & {
  country: string;
  regions: GeoRegionRow[];
};
