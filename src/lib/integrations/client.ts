import { AUTH_ERRORS, secretMatches, timestampFresh, type AuthFailure } from "./auth";

export type ApiClientRow = {
  id: string;
  name: string;
  client_key: string;
  secret_hash: string;
  secret_salt: string | null;
  scopes: string[];
  org_id: string | null;
  active: boolean;
  revoked_at: string | null;
};

export type AuthResult = { ok: true; client: ApiClientRow } | { ok: false; failure: AuthFailure };

/**
 * التعرّف على الشريك.
 *
 * **كل مسارات الفشل تُعيد `invalid_credentials` نفسه**: التمييز بين
 * «مفتاح غير موجود» و«سرّ خاطئ» و«مفتاح مبطَل» يُعطي المهاجم مِسباراً
 * يعدّ به المفاتيح الصالحة.
 */
export async function authenticateClient(request: Request): Promise<AuthResult> {
  const key = request.headers.get("x-ioso-key");
  const secret = request.headers.get("x-ioso-secret");
  const stamp = request.headers.get("x-ioso-timestamp");

  if (!key || !secret || !stamp) {
    return { ok: false, failure: AUTH_ERRORS["missing_credentials"]! };
  }
  if (!timestampFresh(stamp)) {
    return { ok: false, failure: AUTH_ERRORS["stale_timestamp"]! };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("api_clients")
    .select("id, name, client_key, secret_hash, secret_salt, scopes, org_id, active, revoked_at")
    .eq("client_key", key)
    .maybeSingle();

  const client = data as ApiClientRow | null;
  const invalid = { ok: false as const, failure: AUTH_ERRORS["invalid_credentials"]! };

  if (!client || !client.active || client.revoked_at || !client.secret_salt) return invalid;
  if (!secretMatches(secret, client.secret_salt, client.secret_hash)) return invalid;

  return { ok: true, client };
}

export function hasScope(client: ApiClientRow, scope: string): boolean {
  return Array.isArray(client.scopes) && client.scopes.includes(scope);
}

/** ردٌّ موحّد: رمزٌ ثابت ورسالتان — المطوّر الشريك قد لا يقرأ العربية. */
export function apiError(
  code: string,
  status: number,
  ar: string,
  en: string,
  extra?: Record<string, unknown>,
): Response {
  return Response.json(
    { ok: false, error: { code, message_ar: ar, message_en: en, ...extra } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export function apiOk(body: Record<string, unknown>, status = 200): Response {
  return Response.json({ ok: true, ...body }, { status, headers: { "cache-control": "no-store" } });
}

const EN: Record<string, string> = {
  missing_credentials: "X-IOSO-Key, X-IOSO-Secret and X-IOSO-Timestamp headers are required.",
  stale_timestamp: "Timestamp outside the 5-minute window.",
  invalid_credentials: "Invalid or revoked credentials.",
  scope_denied: "The key lacks the scope required for this operation.",
};

export function authFailureResponse(failure: AuthFailure): Response {
  return apiError(failure.code, failure.status, failure.message, EN[failure.code] ?? failure.code);
}
