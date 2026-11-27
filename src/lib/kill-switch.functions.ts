import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callRpc } from "@/lib/rpc-call";

/**
 * مفتاحا الإيقاف بيد الإدارة (هجرة security_pass2):
 * - إيقاف الدخول من منصّة الندوة (`platform_settings.sso_disabled`، يقرؤه launch.server.ts).
 * - تجميد ملفّ طفل: لا كتابة ذهبية ولا كفالة جديدة حتى يُرفع (الرفع بجلسة aal2).
 * الطبقة تنقل؛ القاعدة تفحص `is_admin()` بنفسها.
 */
export type SecuritySwitches = {
  ok: true;
  sso_disabled: boolean;
  frozen: { reason: string; at: string } | null;
};

export const getSecuritySwitches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orphan: z.string().uuid().nullable() }).parse(i))
  .handler(({ data, context }) =>
    callRpc<SecuritySwitches>(context.supabase, "admin_security_switches", {
      _orphan: data.orphan,
    }),
  );

export const setSsoDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ disabled: z.boolean() }).parse(i))
  .handler(({ data, context }) =>
    callRpc<{ ok: boolean; code?: string }>(context.supabase, "admin_sso_set_disabled", {
      _disabled: data.disabled,
    }),
  );

export const setOrphanFrozen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ orphan: z.string().uuid(), frozen: z.boolean(), reason: z.string().max(500) })
      .parse(i),
  )
  .handler(({ data, context }) =>
    data.frozen
      ? callRpc<{ ok: boolean; code?: string }>(context.supabase, "admin_orphan_freeze", {
          _orphan: data.orphan,
          _reason: data.reason,
        })
      : callRpc<{ ok: boolean; code?: string }>(context.supabase, "admin_orphan_unfreeze", {
          _orphan: data.orphan,
        }),
  );
