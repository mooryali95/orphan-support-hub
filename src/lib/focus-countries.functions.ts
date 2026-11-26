import { createServerFn } from "@tanstack/react-start";

import { untypedRpc } from "@/lib/rpc-call";

/**
 * الدول الأساسية التي يعرضها الوضع الحقيقي، بترتيبها (`countries.live_focus`).
 * رموزٌ فقط بلا أعداد. تعيد [] إن لم تُطبَّق الهجرة، فتعود القاعة إلى الشبكة كلّها.
 */
export const getFocusCountries = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
    const { publicClient } = await import("@/lib/protection.functions");
    const rpc = untypedRpc(publicClient());
    const { data, error } = await rpc.rpc("public_focus_countries");
    return error || !Array.isArray(data) ? [] : (data as string[]);
  },
);
