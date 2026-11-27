import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { NONCE_COOKIE } from "@/lib/sso/launch-token";

/**
 * هل بدأ هذا المتصفّح الدخول الذي يُكمَل الآن؟ يقارن رقم `/sso#n=` بالكعكة HttpOnly التي
 * وضعها `/api/sso/wamy`. رابط `/sso` يُرسَل لمتصفّحٍ آخر لا يحملها، فلا يُفتح به حساب.
 * ويسلّم رمز الجلسة من الخادم مرّةً واحدة (`sso_handoff_take`).
 */
export const checkSsoNonce = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ nonce: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; tokenHash?: string }> => {
    const cookie = getRequest()?.headers.get("cookie") ?? "";
    const value = cookie
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith(`${NONCE_COOKIE}=`))
      ?.slice(NONCE_COOKIE.length + 1);
    if (!value || value !== data.nonce) return { ok: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { untypedRpc } = await import("@/lib/rpc-call");
    const r = await untypedRpc(supabaseAdmin).rpc("sso_handoff_take", { _nonce: data.nonce });
    const tokenHash = typeof r.data === "string" ? r.data : undefined;
    return tokenHash ? { ok: true, tokenHash } : { ok: false };
  });
