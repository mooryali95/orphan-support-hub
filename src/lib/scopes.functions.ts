import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * ما يفتحه كل نطاق، وشاشة قرار الإدارة به.
 *
 * كل باب هنا دالّة في القاعدة تفحص النطاق بنفسها؛ الواجهة تعرض ما يعود
 * ولا تخمّن. وما لم يُمنح يعود بـ `allowed: false` فيُعرض مقفلاً.
 */

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
const rpc = (client: unknown) => client as RpcClient;
const orphanInput = (input: unknown) => z.object({ orphanId: z.string().uuid() }).parse(input);

export type Locked = { allowed: false };

export type JourneyView =
  | Locked
  | {
      allowed: true;
      scopes: { journey: boolean; progress: boolean; results: boolean };
      enrollments: Array<{
        program: string;
        status: string;
        started_at: string | null;
        stage: string | null;
        accepted: number | null;
        total: number | null;
        units: Array<{
          ordinal: number;
          title: string;
          focus: string;
          status: "pending" | "submitted" | "returned" | "accepted";
          evidence: string | null;
          note: string | null;
          decided_at: string | null;
        }> | null;
      }>;
    };

export type ReportsView =
  | Locked
  | {
      allowed: true;
      progress: Array<{
        period: string;
        summary: string | null;
        education: string | null;
        living: string | null;
        published_at: string | null;
      }>;
      field: Array<{
        office: string;
        title: string;
        body: string;
        metrics: Record<string, number | string>;
        period_start: string | null;
        period_end: string | null;
        published_at: string | null;
        attachments: number;
      }>;
    };

export type TraitsView =
  | Locked
  | {
      allowed: true;
      traits: Array<{
        dimension: string;
        dimension_label: string;
        trait_id: string;
        name: string;
        first_percent: number | null;
        latest_percent: number | null;
        observations: number;
      }>;
    };

export type GroupView =
  | Locked
  | {
      allowed: true;
      group: null | {
        name: string;
        country: string;
        region: string | null;
        institution: string | null;
        supervisor: string | null;
        members: Array<{ code: string; name: string }>;
      };
    };

// الردّ JSON من القاعدة؛ تُحدِّد الواجهةُ شكله بالأنواع أعلاه.
function viewFn(name: string) {
  return createServerFn({ method: "GET" })
    .middleware([requireSupabaseAuth])
    .inputValidator(orphanInput)
    .handler(async ({ data, context }) => {
      const { data: v, error } = await rpc(context.supabase).rpc(name, { _orphan: data.orphanId });
      return JSON.stringify(error ? { allowed: false } : v);
    });
}

export const getOrphanJourney = viewFn("orphan_journey");
export const getOrphanReports = viewFn("orphan_reports");
export const getOrphanTraits = viewFn("orphan_traits");
export const getOrphanGroup = viewFn("orphan_group");

// ---------------------------------------------------------------------
// قرار الإدارة بالنطاقات، والمحادثة
// ---------------------------------------------------------------------
export type ScopeCatalog = {
  scopes: Array<{ key: string; label: string; description: string; sensitivity: number }>;
  packages: Array<{ key: string; label: string; description: string; scopes: string[] }>;
};

export type ThreadMessage = {
  id: string;
  from_admin: boolean;
  body: string;
  mine: boolean;
  created_at: string;
};

export const getScopeCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await rpc(context.supabase).rpc("access_scope_catalog");
    if (error) return { scopes: [], packages: [] } as ScopeCatalog;
    return data as ScopeCatalog;
  });

export const getAccessThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: t, error } = await rpc(context.supabase).rpc("access_thread", {
      _request: data.requestId,
    });
    return error ? ([] as ThreadMessage[]) : ((t ?? []) as ThreadMessage[]);
  });

export const postAccessMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ requestId: z.string().uuid(), body: z.string().trim().min(2).max(2000) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await rpc(context.supabase).rpc("post_access_message", {
      _request: data.requestId,
      _body: data.body,
    });
    return error ? { ok: false as const } : { ok: true as const };
  });

export const decideWithScopes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        scopes: z.array(z.string().regex(/^[a-z_]{2,40}$/)).max(30),
        note: z.string().trim().max(500).optional(),
        days: z.number().int().min(1).max(365),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await rpc(context.supabase).rpc("decide_orphan_access", {
      _request: data.requestId,
      _decision: data.decision,
      _scopes: data.decision === "approved" ? data.scopes : null,
      _note: data.note || null,
      _days: data.days,
    });
    return error
      ? { ok: false as const, error: error.message }
      : { ok: true as const, error: null };
  });

export const amendAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        scopes: z
          .array(z.string().regex(/^[a-z_]{2,40}$/))
          .min(1)
          .max(30),
        note: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await rpc(context.supabase).rpc("amend_orphan_access", {
      _request: data.requestId,
      _scopes: data.scopes,
      _note: data.note || null,
    });
    return error
      ? { ok: false as const, error: error.message }
      : { ok: true as const, error: null };
  });

export const STAGE_LABELS: Record<string, string> = {
  concept: "المفهوم",
  trait: "السمة",
  system: "النظام",
  actions: "الأفعال",
  measurement: "القياس",
  qualified: "الأهلية",
};

export const UNIT_STATUS_LABELS: Record<string, string> = {
  pending: "لم تبدأ",
  submitted: "قيد المراجعة",
  returned: "أُعيدت للتحسين",
  accepted: "مقبولة",
};
