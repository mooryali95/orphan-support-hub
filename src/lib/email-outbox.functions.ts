import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type { DrainSummary } from "@/lib/email-outbox.server";

/**
 * تصريف طابور البريد يدوياً من الإدارة.
 *
 * الجسم في email-outbox.server.ts، والمجدول (/api/notifications/dispatch)
 * يناديه نفسه — طريقٌ واحد بضماناتٍ واحدة (ARC-02).
 */
export const drainEmailOutbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).default(25) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin");
    if (roleError || isAdmin !== true) throw new Error("غير مصرّح");

    const { drainOutbox, liveOutboxDeps } = await import("@/lib/email-outbox.server");
    return drainOutbox(await liveOutboxDeps(), data.limit);
  });
