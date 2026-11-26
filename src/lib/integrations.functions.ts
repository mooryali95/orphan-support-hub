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
        scopes: z
          .array(
            z.enum([
              "orphans:read",
              "orphans:import",
              "mirror:write",
              "records:primary",
              "records:verify",
            ]),
          )
          .min(1),
        source: z
          .string()
          .regex(/^[a-z0-9-]{2,40}$/)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // القاعدة تمنع الاستيراد بلا جهة؛ ويُقال هنا قبل الرحلة لا بعدها.
    if (data.scopes.includes("orphans:import") && !data.orgId) {
      return {
        ok: false as const,
        error: "نطاق الاستيراد يحتاج جهة ميدانية مسؤولة عن الملفّات الواردة.",
        credentials: null,
      };
    }

    if (data.scopes.includes("records:primary") && data.scopes.includes("records:verify")) {
      return {
        ok: false as const,
        error: "مفتاح الندوة ومفتاح المكتب منفصلان: اختر أحدهما.",
        credentials: null,
      };
    }
    // مفتاح الندوة لا يرتبط بمنصّة تشغيل؛ القاعدة تمنع الجمع أيضاً.
    if (data.scopes.includes("records:primary")) delete data.source;

    if (
      (data.scopes.includes("mirror:write") || data.scopes.includes("records:verify")) &&
      !data.source
    ) {
      return {
        ok: false as const,
        error: "مفتاح المزامنة يحتاج منصّة تشغيلٍ يرتبط بها.",
        credentials: null,
      };
    }

    const key = newClientKey();
    const { secret, salt, hash, prefix } = newSecret();

    const db = context.supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{ error: { message: string } | null }>;
    };
    const { error } = await db.rpc("create_api_client", {
      _name: data.name,
      _org: data.orgId,
      _scopes: data.scopes,
      _key: key,
      _salt: salt,
      _hash: hash,
      _prefix: prefix,
      _source: data.source ?? null,
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

export type MirrorStatus = {
  platforms: Array<{
    key: string;
    name: string;
    country: string;
    active: boolean;
    org_id: string | null;
  }>;
  state: Array<{
    source: string;
    entity: string;
    cursor_at: string | null;
    last_run_at: string | null;
    last_error: string | null;
    drift: null | {
      checked_at: string;
      upstream: number;
      here: number;
      missing_here: string[];
      missing_upstream: string[];
    };
  }>;
  counts: Record<string, number>;
};

export const getMirrorStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as {
      rpc: (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
    const { data, error } = await db.rpc("admin_mirror_status");
    return JSON.stringify(error ? null : data);
  });

export const setPlatformOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ platform: z.string().regex(/^[a-z0-9-]{2,40}$/), orgId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{ error: { message: string } | null }>;
    };
    const { error } = await db.rpc("admin_set_platform_org", {
      _platform: data.platform,
      _org: data.orgId,
    });
    return error ? { ok: false as const } : { ok: true as const };
  });
