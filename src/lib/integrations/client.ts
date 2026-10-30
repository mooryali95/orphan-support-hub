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
/**
 * الرؤوس محايدة لا تحمل اسم المنصّة (`X-Api-Key`…)، فتغيير الاسم لا يقطع
 * شريكاً. والرؤوس القديمة `X-IOSO-*` مقبولة لمن ربط قبل ذلك.
 */
export const API_HEADERS = {
  key: "X-Api-Key",
  secret: "X-Api-Secret",
  timestamp: "X-Api-Timestamp",
} as const;
const LEGACY_PREFIX = "x-ioso-";

function header(request: Request, part: keyof typeof API_HEADERS): string | null {
  return request.headers.get(API_HEADERS[part]) ?? request.headers.get(`${LEGACY_PREFIX}${part}`);
}

export async function authenticateClient(request: Request): Promise<AuthResult> {
  const key = header(request, "key");
  const secret = header(request, "secret");
  const stamp = header(request, "timestamp");

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
  missing_credentials: "X-Api-Key, X-Api-Secret and X-Api-Timestamp headers are required.",
  stale_timestamp: "Timestamp outside the 5-minute window.",
  invalid_credentials: "Invalid or revoked credentials.",
  scope_denied: "The key lacks the scope required for this operation.",
};

export function authFailureResponse(failure: AuthFailure): Response {
  return apiError(failure.code, failure.status, failure.message, EN[failure.code] ?? failure.code);
}

/** أقصى حجمٍ لجسم الطلب في بوّابات التكامل: ٢ ميغابايت. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * يقرأ الجسم نصّاً بحدٍّ أعلى. يرفض مبكراً بترويسة الطول إن وُجدت، ثم
 * يتحقّق من الطول الفعلي — الترويسة قد تكذب أو تغيب.
 */
export async function readBodyCapped(
  request: Request,
  max = MAX_BODY_BYTES,
): Promise<{ ok: true; text: string } | { ok: false }> {
  const declared = Number(request.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > max) return { ok: false };
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > max) return { ok: false };
  return { ok: true, text };
}

/**
 * حاجز المعدّل قبل المصادقة: يُعدّ بالمصدر لا بالمفتاح، كي لا يُخمَّن
 * المفتاح بعناوين كثيرة دون أن يُحسب.
 */
export async function guardApiRate(request: Request): Promise<Response | null> {
  const { hitRateLimit, identityOf, tooManyRequests } = await import("@/lib/rate-limit");
  const verdict = await hitRateLimit("api", await identityOf(request));
  return verdict.allowed ? null : tooManyRequests(verdict);
}
