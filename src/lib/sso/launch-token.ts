/**
 * رمز الإطلاق من منصّة الندوة — التحقّق الخالص (WebCrypto، بلا مكتبة ولا شبكة).
 *
 * منصّة الندوة (خادمها لا متصفّحها) توقّع لمستخدمها المسجّل JWT قصير العمر:
 *
 *   { iss, aud: "kahatayn", sub, email, email_verified: true, name?, iat, exp, jti, next? }
 *
 * والتوقيع إمّا ES256/RS256 بمفتاحٍ خاصٍّ عند الندوة وعامٍّ هنا (الموصى به: لا سرّ
 * مشترك)، أو HS256 بسرٍّ مشترك (أبسط للبدء). عمر الرمز دقيقتان على الأكثر، ويُستعمل
 * مرّةً واحدة (jti، في القاعدة). التفصيل في docs/wamy-sso.ar.md.
 */

export type LaunchClaims = {
  iss: string;
  aud: string | string[];
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  iat: number;
  exp: number;
  jti: string;
  /** الصفحة المطلوبة بعد الدخول: مسارٌ داخلي من القائمة المسموحة وحدها. */
  next?: string;
};

export type VerifyKeys = {
  /** HS256: سرٌّ مشترك (32 حرفاً فأكثر). */
  secret?: string;
  /** ES256 / RS256: مفاتيح الندوة العامّة بصيغة JWK. */
  jwks?: JsonWebKey[];
};

export type VerifyFailure =
  | "malformed"
  | "alg_not_allowed"
  | "no_key"
  | "bad_signature"
  | "wrong_issuer"
  | "wrong_audience"
  | "expired"
  | "not_yet_valid"
  | "lifetime_too_long"
  | "claims_invalid"
  | "email_unverified";

export const AUDIENCE = "kahatayn";
/** أقصى عمرٍ للرمز (exp − iat)، وسماحية الساعة بين الخادمين. */
export const MAX_LIFETIME_S = 120;
export const CLOCK_SKEW_S = 30;

/** الصفحات التي يُفتح عليها الدخول؛ غيرها يعود إلى «بواباتي». */
export const ALLOWED_NEXT = ["/country-data", "/workspaces", "/dashboard", "/admin", "/orphans"];
export const DEFAULT_NEXT = "/workspaces";

export function safeNext(next: unknown): string {
  if (typeof next !== "string" || next.length > 200) return DEFAULT_NEXT;
  if (!/^\/(?![/\\])[A-Za-z0-9\-_/?=&.%]*$/.test(next)) return DEFAULT_NEXT;
  const path = next.split(/[?#]/)[0]!;
  return ALLOWED_NEXT.some((p) => path === p || path.startsWith(`${p}/`)) ? next : DEFAULT_NEXT;
}

const b64urlToBytes = (s: string): Uint8Array<ArrayBuffer> => {
  const b64 = s
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const decodeJson = (s: string): unknown => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

type Header = { alg?: string; kid?: string; typ?: string };

async function keyFor(alg: string, header: Header, keys: VerifyKeys): Promise<CryptoKey | null> {
  if (alg === "HS256") {
    if (!keys.secret || keys.secret.length < 32) return null;
    return crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(keys.secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
  }
  const kty = alg === "ES256" ? "EC" : "RSA";
  const jwk = (keys.jwks ?? []).find(
    (k) => k.kty === kty && (!header.kid || (k as { kid?: string }).kid === header.kid),
  );
  if (!jwk) return null;
  return alg === "ES256"
    ? crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"])
    : crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
        "verify",
      ]);
}

function algParams(alg: string): AlgorithmIdentifier | EcdsaParams {
  if (alg === "ES256") return { name: "ECDSA", hash: "SHA-256" };
  if (alg === "RS256") return { name: "RSASSA-PKCS1-v1_5" };
  return { name: "HMAC" };
}

export async function verifyLaunchToken(
  token: string,
  opts: { issuer: string; keys: VerifyKeys; now?: number },
): Promise<{ ok: true; claims: LaunchClaims } | { ok: false; reason: VerifyFailure }> {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3 || token.length > 8192) return { ok: false, reason: "malformed" };
  let header: Header;
  let claims: Partial<LaunchClaims>;
  try {
    header = decodeJson(parts[0]!) as Header;
    claims = decodeJson(parts[1]!) as Partial<LaunchClaims>;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  // الخوارزمية من قائمتنا لا من الرمز وحده: لا «none» ولا خلط مفتاحٍ عامٍّ بسرّ.
  const alg = header.alg ?? "";
  const allowed = [
    ...(opts.keys.secret ? ["HS256"] : []),
    ...((opts.keys.jwks ?? []).length ? ["ES256", "RS256"] : []),
  ];
  if (!allowed.includes(alg)) return { ok: false, reason: "alg_not_allowed" };
  const key = await keyFor(alg, header, opts.keys);
  if (!key) return { ok: false, reason: "no_key" };
  const valid = await crypto.subtle.verify(
    algParams(alg),
    key,
    b64urlToBytes(parts[2]!),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) return { ok: false, reason: "bad_signature" };

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (claims.iss !== opts.issuer) return { ok: false, reason: "wrong_issuer" };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(AUDIENCE)) return { ok: false, reason: "wrong_audience" };
  if (typeof claims.exp !== "number" || typeof claims.iat !== "number")
    return { ok: false, reason: "claims_invalid" };
  if (claims.exp + CLOCK_SKEW_S < now) return { ok: false, reason: "expired" };
  if (claims.iat - CLOCK_SKEW_S > now) return { ok: false, reason: "not_yet_valid" };
  if (claims.exp - claims.iat > MAX_LIFETIME_S) return { ok: false, reason: "lifetime_too_long" };
  if (
    typeof claims.sub !== "string" ||
    !claims.sub ||
    claims.sub.length > 200 ||
    typeof claims.jti !== "string" ||
    claims.jti.length < 8 ||
    claims.jti.length > 200 ||
    typeof claims.email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) ||
    claims.email.length > 254
  )
    return { ok: false, reason: "claims_invalid" };
  if (claims.email_verified !== true) return { ok: false, reason: "email_unverified" };
  return {
    ok: true,
    claims: { ...(claims as LaunchClaims), email: claims.email.trim().toLowerCase() },
  };
}
