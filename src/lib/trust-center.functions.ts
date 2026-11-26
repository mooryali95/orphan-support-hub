import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callRpc, type RpcResult } from "@/lib/rpc-call";
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

export type TrustResult<T> = RpcResult<T>;

const code2 = z.string().regex(/^[A-Z]{2}$/);

export const getTrustOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => callRpc<TrustCountry[]>(context.supabase, "admin_trust_overview"));

export const getTrustAging = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) =>
    callRpc<TrustAging>(context.supabase, "admin_trust_aging", { _limit: 20 }),
  );

export const getTrustTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => callRpc<TeamRow[]>(context.supabase, "admin_trust_team"));

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
    callRpc<DecisionPage>(context.supabase, "admin_trust_decisions", {
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
    callRpc<TrustWeekly>(context.supabase, "admin_trust_weekly", { _country: data.country }),
  );
