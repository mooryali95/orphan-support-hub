import { guardApiRate } from "@/lib/integrations/client";
import { untypedRpc } from "@/lib/rpc-call";
import { NONCE_COOKIE, safeNext, verifyLaunchToken, type VerifyKeys } from "@/lib/sso/launch-token";

/**
 * الدخول من منصّة الندوة — `/api/sso/wamy` (POST نموذجٌ بحقل `token` وحده: لا GET، فلا يبلغ
 * الرمز سجلّات الخوادم الوسيطة ولا ترويسة Referer).
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

async function keys(env: Record<string, string | undefined>, kid?: string): Promise<VerifyKeys> {
  const out: VerifyKeys = {};
  if (env["WAMY_SSO_SECRET"]) out.secret = env["WAMY_SSO_SECRET"];
  const url = env["WAMY_SSO_JWKS_URL"];
  if (url) {
    const stale = !jwksCache || jwksCache.url !== url || Date.now() - jwksCache.at > 10 * 60_000;
    const unknownKid =
      kid !== undefined && !jwksCache?.keys.some((k) => (k as { kid?: string }).kid === kid);
    if (stale || unknownKid) {
      // يُحفظ الجواب السليم وحده، ويبقى آخر مفاتيح صالحة إن تعثّر الجلب (تدوير المفاتيح عند الندوة).
      try {
        const res = await fetch(url, { headers: { accept: "application/json" } });
        const body = res.ok ? ((await res.json()) as { keys?: JsonWebKey[] }) : null;
        if (body && Array.isArray(body.keys) && body.keys.length > 0) {
          jwksCache = { url, at: Date.now(), keys: body.keys };
        }
      } catch {
        if (!jwksCache) throw new Error("jwks_unavailable");
      }
    }
    out.jwks = jwksCache?.url === url ? jwksCache.keys : [];
  }
  return out;
}

/** معرّف المفتاح من ترويسة الرمز (بلا تحقّق): لطلب مفاتيح الندوة الجديدة عند التدوير. */
function kidOf(token: string | null): string | undefined {
  try {
    const head = JSON.parse(
      atob((token ?? "").split(".")[0]!.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof head.kid === "string" ? head.kid : undefined;
  } catch {
    return undefined;
  }
}

const fail = (origin: string, reason: string) =>
  Response.redirect(`${origin}/sso#error=${encodeURIComponent(reason)}`, 303);

/** مُصدَّرة لمسار /api/sso/wamy ولاختبارها (launch.server.test.ts). */
export async function handle(request: Request, token: string | null): Promise<Response> {
  const origin = new URL(request.url).origin;
  const limited = await guardApiRate(request);
  if (limited) return limited;
  const { serverConfig } = await import("@/lib/env.server");
  const cfg = serverConfig();
  if (!cfg.features.sso.ready) return fail(origin, "not_configured");
  const env = process.env as Record<string, string | undefined>;
  let k: VerifyKeys;
  try {
    k = await keys(env, kidOf(token));
  } catch {
    return fail(origin, "keys_unavailable");
  }
  if (!k.secret && !k.jwks?.length) return fail(origin, "not_configured");
  const v = await verifyLaunchToken(token ?? "", { issuer: cfg.env.WAMY_SSO_ISSUER!, keys: k });
  if (!v.ok) return fail(origin, v.reason);
  const c = v.claims;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = untypedRpc(supabaseAdmin);
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

  // الجلسة للحساب المربوط بمعرّف الندوة، لا لبريد الرمز: لو تغيّر بريده هناك إلى بريد
  // حسابٍ آخر هنا لما فُتح ذاك الحساب.
  const owner = await supabaseAdmin.auth.admin.getUserById(r.user_id);
  const ownerEmail = owner.data?.user?.email;
  if (owner.error || !ownerEmail) return fail(origin, "account_failed");
  const link = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: ownerEmail,
  });
  const hashed = link.data?.properties?.hashed_token;
  if (link.error || !hashed || link.data?.user?.id !== r.user_id)
    return fail(origin, "session_failed");
  // ربطٌ بالمتصفّح الذي بدأ الدخول: رابط /sso يُرسَل لضحيةٍ بلا هذا الكعك لا يفتح شيئاً.
  const nonce = crypto.randomUUID();
  const next = safeNext(c.next);
  return new Response(null, {
    status: 303,
    headers: {
      location: `${origin}/sso#th=${encodeURIComponent(hashed)}&n=${nonce}&next=${encodeURIComponent(next)}`,
      "set-cookie": `${NONCE_COOKIE}=${nonce}; Path=/; Max-Age=120; HttpOnly; Secure; SameSite=Lax`,
      "cache-control": "no-store",
    },
  });
}
