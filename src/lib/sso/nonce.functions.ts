import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { NONCE_COOKIE } from "@/lib/sso/launch-token";

/**
 * هل بدأ هذا المتصفّح الدخول الذي يُكمَل الآن؟ يقارن رقم `/sso#n=` بالكعكة HttpOnly التي
 * وضعها `/api/sso/wamy`. رابط `/sso` يُرسَل لمتصفّحٍ آخر لا يحملها، فلا يُفتح به حساب.
 */
export const checkSsoNonce = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ nonce: z.string().uuid() }).parse(input))
  .handler(({ data }): { ok: boolean } => {
    const cookie = getRequest()?.headers.get("cookie") ?? "";
    const value = cookie
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith(`${NONCE_COOKIE}=`))
      ?.slice(NONCE_COOKIE.length + 1);
    return { ok: !!value && value === data.nonce };
  });
