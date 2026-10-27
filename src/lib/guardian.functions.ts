import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
const rpc = (client: unknown) => client as RpcClient;

export type GuardianChild = {
  id: string;
  name: string;
  code: string;
  status: string;
  photo_consent: "none" | "face_hidden" | "granted" | "withdrawn";
  enrollment: null | {
    program: string;
    stage: string;
    accepted: number;
    total: number;
    next: string | null;
  };
  pending_consents: Array<{ role_id: string; program: string }>;
};

/** نصوص الموافقة كما تُحفظ في القاعدة حرفياً (consent_statement). */
export const CONSENT_AR: Record<string, string> = {
  "enrollment:granted":
    "أوافق بصفتي وليّاً على التحاق الطفل ببرنامج بناء الأهلية، وعلى أن يُقاس تقدّمه وتُرصد سماته، ويُعرض ذلك لمن تأذن له الإدارة.",
  "photo:face_hidden": "أوافق على نشر صورٍ للطفل لا يظهر فيها وجهه.",
  "photo:granted":
    "أوافق على نشر صورٍ للطفل يظهر فيها وجهه، وأعلم أنني أستطيع سحب الموافقة متى شئت فتُحذف الصورة.",
  "photo:withdrawn": "أسحب موافقتي على نشر صور الطفل.",
};

export const getGuardianChildren = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await rpc(context.supabase).rpc("guardian_children_overview");
    return error ? ([] as GuardianChild[]) : ((data ?? []) as GuardianChild[]);
  });

export const consentEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ roleId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await rpc(context.supabase).rpc("guardian_consent_enrollment", {
      _role: data.roleId,
    });
    return error ? { ok: false as const } : { ok: true as const };
  });

export const setPhotoConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orphanId: z.string().uuid(),
        state: z.enum(["face_hidden", "granted", "withdrawn"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await rpc(context.supabase).rpc("guardian_set_photo_consent", {
      _orphan: data.orphanId,
      _state: data.state,
    });
    return error ? { ok: false as const } : { ok: true as const };
  });
