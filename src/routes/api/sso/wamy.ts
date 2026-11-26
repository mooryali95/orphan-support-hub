import { createFileRoute } from "@tanstack/react-router";

import { guardApiRate } from "@/lib/integrations/client";
import { safeNext, verifyLaunchToken, type VerifyKeys } from "@/lib/sso/launch-token";

/**
 * الدخول من منصّة الندوة — `/api/sso/wamy` (POST نموذجٌ بحقل `token`، أو GET `?token=`).
 *
 * الندوة توقّع رمز إطلاقٍ قصير العمر لمستخدمها (src/lib/sso/launch-token.ts)، وهنا:
 *   1) يُتحقّق من التوقيع والمُصدِر والجمهور والعمر.
 *   2) يُحجز الرمز (jti) فلا يُستعمل مرّتين.
 *   3) يُعرف الحساب بمعرّفه عند الندوة، أو ببريده الموثَّق أوّل مرّة، أو يُنشأ.
 *   4) يُولَّد رابط دخولٍ لمرّةٍ واحدة، ويُسلَّم للمتصفّح في جزء الرابط (#) لا في
 *      الاستعلام، فلا يبلغ سجلّات الخادم، وتُكمل صفحة `/sso` الجلسة.
 * الدخول لا يمنح دوراً؛ الأدوار من فريق الدولة والإدارة كما هي.
 */

const PROVIDER = "wamy";
let jwksCache: { url: string; at: number; keys: JsonWebKey[] } | null = null;

async function keys(env: Record<string, string | undefined>): Promise<VerifyKeys> {
  const out: VerifyKeys = {};
  if (env["WAMY_SSO_SECRET"]) out.secret = env["WAMY_SSO_SECRET"];
  const url = env["WAMY_SSO_JWKS_URL"];
  if (url) {
    if (!jwksCache || jwksCache.url !== url || Date.now() - jwksCache.at > 10 * 60_000) {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      const body = (await res.json()) as { keys?: JsonWebKey[] };
      jwksCache = { url, at: Date.now(), keys: Array.isArray(body.keys) ? body.keys : [] };
    }
    out.jwks = jwksCache.keys;
  }
  return out;
}

const fail = (origin: string, reason: string) =>
  Response.redirect(`${origin}/sso#error=${encodeURIComponent(reason)}`, 303);

async function handle(request: Request, token: string | null): Promise<Response> {
  const origin = new URL(request.url).origin;
  const limited = await guardApiRate(request);
  if (limited) return limited;
  const { serverConfig } = await import("@/lib/env.server");
  const cfg = serverConfig();
  if (!cfg.features.sso.ready) return fail(origin, "not_configured");
  const env = process.env as Record<string, string | undefined>;
  let k: VerifyKeys;
  try {
    k = await keys(env);
  } catch {
    return fail(origin, "keys_unavailable");
  }
  if (!k.secret && !k.jwks?.length) return fail(origin, "not_configured");
  const v = await verifyLaunchToken(token ?? "", { issuer: cfg.env.WAMY_SSO_ISSUER!, keys: k });
  if (!v.ok) return fail(origin, v.reason);
  const c = v.claims;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as {
    rpc: (fn: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  const claimed = await db.rpc("sso_claim_jti", {
    _jti: `${PROVIDER}:${c.jti}`,
    _expires: new Date(c.exp * 1000).toISOString(),
  });
  if (claimed.error || claimed.data !== true) return fail(origin, "token_used");

  const resolve = () =>
    db.rpc("sso_resolve", { _provider: PROVIDER, _subject: c.sub, _email: c.email });
  let r = (await resolve()).data as { ok?: boolean; code?: string; user_id?: string | null } | null;
  if (r?.ok && !r.user_id) {
    const created = await supabaseAdmin.auth.admin.createUser({
      email: c.email,
      email_confirm: true,
      user_metadata: { ...(c.name ? { full_name: c.name } : {}), sso_provider: PROVIDER },
    });
    if (created.error) return fail(origin, "account_failed");
    r = (await resolve()).data as typeof r;
  }
  if (!r?.ok || !r.user_id) return fail(origin, r?.code ?? "account_failed");

  const link = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email: c.email });
  const hashed = link.data?.properties?.hashed_token;
  if (link.error || !hashed) return fail(origin, "session_failed");
  const next = safeNext(c.next);
  return Response.redirect(
    `${origin}/sso#th=${encodeURIComponent(hashed)}&next=${encodeURIComponent(next)}`,
    303,
  );
}

export const Route = createFileRoute("/api/sso/wamy")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request, new URL(request.url).searchParams.get("token")),
      POST: async ({ request }) => {
        const form = await request.formData().catch(() => null);
        const t = form?.get("token");
        return handle(request, typeof t === "string" ? t : null);
      },
    },
  },
});
