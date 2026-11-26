import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isMissingObject } from "@/lib/data-entry";
import {
  DECISION_ACTIONS,
  type DecisionPage,
  type TeamRow,
  type TrustAging,
  type TrustCountry,
  type TrustWeekly,
} from "@/lib/trust-center";

/**
 * مركز الثقة: قراءةٌ للإدارة وحدها. الطبقة تنقل ولا تحرس؛ كل دالّةٍ في القاعدة
 * تفحص `is_admin()` أوّلاً. وما لم تُطبَّق هجرته يعود `missing: true`.
 */

type DbError = { message: string; code?: string | null };
type Rpc = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: DbError | null }>;
};

export type TrustResult<T> = { ok: true; data: T } | { ok: false; missing: boolean; error: string };

async function call<T>(
  client: unknown,
  fn: string,
  args?: Record<string, unknown>,
): Promise<TrustResult<T>> {
  const { data, error } = await (client as Rpc).rpc(fn, args);
  if (error) {
    return {
      ok: false,
      missing: isMissingObject(error),
      error: /^[a-z_]{3,40}$/.test(error.message) ? error.message : "failed",
    };
  }
  const d = data as { ok?: boolean; code?: string } | null;
  if (d && d.ok === false) return { ok: false, missing: false, error: d.code ?? "failed" };
  return { ok: true, data: data as T };
}

const code2 = z.string().regex(/^[A-Z]{2}$/);

export const getTrustOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => call<TrustCountry[]>(context.supabase, "admin_trust_overview"));

export const getTrustAging = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) =>
    call<TrustAging>(context.supabase, "admin_trust_aging", { _limit: 20 }),
  );

export const getTrustTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => call<TeamRow[]>(context.supabase, "admin_trust_team"));

export const getTrustDecisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        country: code2.nullable(),
        action: z.enum(DECISION_ACTIONS).nullable(),
        beforeAt: z.string().datetime({ offset: true }).nullable(),
        beforeId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(({ data, context }) =>
    call<DecisionPage>(context.supabase, "admin_trust_decisions", {
      _country: data.country,
      _action: data.action,
      _before_at: data.beforeAt,
      _before_id: data.beforeId,
      _limit: 25,
    }),
  );

export const getTrustWeekly = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ country: code2 }).parse(input))
  .handler(({ data, context }) =>
    call<TrustWeekly>(context.supabase, "admin_trust_weekly", { _country: data.country }),
  );
