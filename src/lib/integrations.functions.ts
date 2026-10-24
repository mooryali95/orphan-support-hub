import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { newClientKey, newSecret } from "@/lib/integrations/auth";
import { withIntegration, type ApiClientSummary } from "@/integrations/supabase/types.extra";

/**
 * مفاتيح التكامل — إصدارٌ وإبطال.
 *
 * **السرّ يُعرض مرّةً واحدة.** لا نحفظه بل تجزيئه، فلا نستطيع إعادة
 * عرضه ولو أردنا — وهذا هو المقصود: قاعدةٌ مسروقة لا تُمكّن من انتحال
 * شريك. ومن فقد سرّه يُصدِر غيره ويُبطل الأوّل.
 */

export const listApiClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = withIntegration(context.supabase);
    const { data, error } = await db.rpc("admin_api_clients");
    if (error) return { ok: false as const, error: error.message, clients: [] };
    return { ok: true as const, error: null, clients: (data ?? []) as ApiClientSummary[] };
  });

export const listApprovedOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = withIntegration(context.supabase);
    const { data, error } = await db.rpc("admin_approved_orgs");
    if (error) return { orgs: [] as Array<{ id: string; name: string }> };
    return { orgs: (data ?? []) as Array<{ id: string; name: string }> };
  });

export const issueApiClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        orgId: z.string().uuid().nullable(),
        scopes: z.array(z.enum(["orphans:read", "orphans:import"])).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // القاعدة تمنع الاستيراد بلا جهة؛ ويُقال هنا قبل الرحلة لا بعدها.
    if (data.scopes.includes("orphans:import") && !data.orgId) {
      return {
        ok: false as const,
        error: "نطاق الاستيراد يحتاج جهة رعاية مسؤولة عن الملفّات الواردة.",
        credentials: null,
      };
    }

    const key = newClientKey();
    const { secret, salt, hash, prefix } = newSecret();

    const db = withIntegration(context.supabase);
    const { error } = await db.rpc("create_api_client", {
      _name: data.name,
      _org: data.orgId,
      _scopes: data.scopes,
      _key: key,
      _salt: salt,
      _hash: hash,
      _prefix: prefix,
    });
    if (error) return { ok: false as const, error: error.message, credentials: null };

    /* المرّة الوحيدة التي يُرى فيها السرّ. */
    return { ok: true as const, error: null, credentials: { clientKey: key, secret } };
  });

export const revokeApiClientFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = withIntegration(context.supabase);
    const { error } = await db.rpc("revoke_api_client", { _client: data.clientId });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, error: null };
  });
