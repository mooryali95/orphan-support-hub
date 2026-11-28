import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DecisionLogPage, QueueCounts, SearchResults, TodayStrip } from "@/lib/admin-tools";
import { callRpc } from "@/lib/rpc-call";

/**
 * أدوات الإدارة: عدّادات الطوابير، والبحث الموحّد، وسجلّ القرارات المقروء.
 * الطبقة تنقل ولا تحرس: كلّ دالّةٍ في القاعدة تفحص `is_admin()` أو `country_can`.
 */

const code2 = z.string().regex(/^[A-Z]{2}$/);

export const getQueueCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ country: code2.nullable() }).parse(input))
  .handler(({ data, context }) =>
    callRpc<QueueCounts>(context.supabase, "admin_queue_counts", { _country: data.country }),
  );

export const getTodayStrip = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ country: code2 }).parse(input))
  .handler(({ data, context }) =>
    callRpc<TodayStrip>(context.supabase, "admin_today_strip", { _country: data.country }),
  );

export const adminSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ q: z.string().trim().max(80) }).parse(input))
  .handler(async ({ data, context }) => {
    // حدّ الخادم قبل القاعدة (N2)؛ والقاعدة تحدّ أيضاً فلا يُتجاوز بنداءٍ مباشر.
    const { limitCurrentRequest } = await import("@/lib/rate-limit");
    const verdict = await limitCurrentRequest("search", context.userId);
    if (!verdict.allowed) return { ok: false as const, missing: false, error: "rate_limited" };
    return callRpc<SearchResults>(context.supabase, "admin_search", { _q: data.q, _limit: 6 });
  });

export const getDecisionLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orphan: z.string().uuid().nullable(),
        kind: z.enum(["decisions", "security"]).nullable(),
        beforeAt: z.string().max(40).nullable(),
        beforeId: z.string().max(40).nullable(),
      })
      .parse(input),
  )
  .handler(({ data, context }) =>
    callRpc<DecisionLogPage>(context.supabase, "admin_decision_log", {
      _orphan: data.orphan,
      _kind: data.kind,
      _before_at: data.beforeAt,
      _before_id: data.beforeId,
      _limit: 30,
    }),
  );
