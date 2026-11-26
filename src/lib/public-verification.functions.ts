import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { PublicVerification } from "@/lib/golden-record";

/**
 * شارة الكافل وشرط الثقة: درجةٌ من ثلاث، وهل يقبل الملف كفالةً جديدة، وشهر آخر
 * تحقّق، لملفٍّ منشور وحده. لا حقول ولا أسباب تنبيه. ملفٌّ خفيف لصفحة الطفل؛ وما لم
 * تُطبَّق هجرته يعيد null فلا تظهر الشارة ولا يُقفل الزرّ.
 */
export const getPublicVerification = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ orphanId: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<PublicVerification | null> => {
    // بابٌ للزوّار: حدّ الطلبات نفسه الذي يحرس الواجهة البرمجية، فلا يُمسح كل معرّف.
    const { getRequest } = await import("@tanstack/react-start/server");
    const { guardApiRate } = await import("@/lib/integrations/client");
    const req = getRequest();
    if (req && (await guardApiRate(req))) return null;
    const { publicClient } = await import("@/lib/protection.functions");
    const rpc = publicClient() as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{ data: unknown; error: unknown }>;
    };
    const { data: res, error } = await rpc.rpc("public_verification", { _orphan: data.orphanId });
    if (error || !res) return null;
    return res as PublicVerification;
  });
