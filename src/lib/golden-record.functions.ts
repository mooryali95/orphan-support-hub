import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isMissingObject } from "@/lib/data-entry";
import {
  MAX_GOLDEN_ROWS,
  type Conflict,
  type CountryHealth,
  type IngestResult,
  type LinkItem,
} from "@/lib/golden-record";

/**
 * مصادر التحقق في الإدارة: صحة البيانات لكل دولة، ووضع المكتب، والرفع،
 * وصندوق التعارضات، وطابور الربط.
 *
 * الطبقة تنقل ولا تحرس: كل دالّةٍ في القاعدة تفحص `is_admin()` بنفسها. وما لم
 * تُطبَّق هجرته بعد يعود `missing: true` فتعرض الواجهة «تحتاج تحديث القاعدة».
 */

type DbError = { message: string; code?: string | null };
type Rpc = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: DbError | null }>;
};

export type GoldenFailure = { ok: false; missing: boolean; error: string };

async function call<T>(
  client: unknown,
  fn: string,
  args?: Record<string, unknown>,
): Promise<{ ok: true; data: T } | GoldenFailure> {
  const { data, error } = await (client as Rpc).rpc(fn, args);
  if (error) {
    return {
      ok: false,
      missing: isMissingObject(error),
      error: /^[a-z_]{3,40}$/.test(error.message) ? error.message : "failed",
    };
  }
  // الدوالّ تعيد { ok:false, code } لرفضٍ مفهوم؛ يُسمّى ولا يُخفى.
  const d = data as { ok?: boolean; code?: string } | null;
  if (d && d.ok === false) return { ok: false, missing: false, error: d.code ?? "failed" };
  return { ok: true, data: data as T };
}

const code2 = z.string().regex(/^[A-Z]{2}$/);
const sourceKey = z.string().regex(/^[a-z0-9-]{2,40}$/);
const uuid = z.string().uuid();

export const getDataHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => call<CountryHealth[]>(context.supabase, "admin_data_health"));

export const setCountrySource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        country: code2,
        source: sourceKey.nullable(),
        mode: z.enum(["none", "shadow", "active"]),
        staleDays: z.number().int().min(30).max(730).optional(),
      })
      .parse(input),
  )
  .handler(({ data, context }) =>
    call<{ ok: true; from: string; to: string; reevaluated: number }>(
      context.supabase,
      "admin_country_source_set",
      {
        _country: data.country,
        _source: data.source,
        _mode: data.mode,
        _stale_days: data.staleDays ?? null,
      },
    ),
  );

const record = z.object({
  external_ref: z.string().trim().min(1).max(120),
  observed_at: z.string().max(40).optional(),
  fields: z.record(
    z.string().regex(/^[a-z_]{2,40}$/),
    z.union([z.string().max(4000), z.boolean()]),
  ),
});

export const importGolden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        role: z.enum(["wamy", "office"]),
        country: code2,
        source: sourceKey.nullable(),
        records: z.array(record).min(1).max(MAX_GOLDEN_ROWS),
      })
      .parse(input),
  )
  .handler(({ data, context }) =>
    call<IngestResult>(context.supabase, "admin_golden_import", {
      _role: data.role,
      _country: data.country,
      _source: data.role === "wamy" ? null : data.source,
      _records: data.records,
    }),
  );

export const listConflicts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ country: code2.nullable() }).parse(input))
  .handler(({ data, context }) =>
    call<Conflict[]>(context.supabase, "admin_conflicts", { _country: data.country, _limit: 200 }),
  );

export const resolveConflict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid,
        choice: z.enum(["accept", "keep", "use_wamy", "use_office", "manual"]),
        value: z.string().trim().max(4000).optional(),
      })
      .parse(input),
  )
  .handler(({ data, context }) =>
    call<{ ok: true }>(context.supabase, "admin_conflict_resolve", {
      _id: data.id,
      _choice: data.choice,
      _value: data.value === undefined ? null : data.value,
    }),
  );

export const listLinkQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ country: code2.nullable() }).parse(input))
  .handler(({ data, context }) =>
    call<LinkItem[]>(context.supabase, "admin_link_queue", { _country: data.country, _limit: 200 }),
  );

export const resolveLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid,
        action: z.enum(["link", "create", "ignore"]),
        orphanId: uuid.optional(),
      })
      .parse(input),
  )
  .handler(({ data, context }) =>
    call<{ ok: true }>(context.supabase, "admin_link_resolve", {
      _id: data.id,
      _action: data.action,
      _orphan: data.orphanId ?? null,
    }),
  );

export const createUnmatched = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ country: code2 }).parse(input))
  .handler(({ data, context }) =>
    call<{ ok: true; created: number; failed: number }>(
      context.supabase,
      "admin_link_create_unmatched",
      { _country: data.country },
    ),
  );
