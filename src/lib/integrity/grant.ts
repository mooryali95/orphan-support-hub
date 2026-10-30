/**
 * الإذن الموقّع لمنصّة التشغيل — JWS مضغوط بخوارزمية EdDSA (Ed25519).
 *
 * كهاتين وحدها تحمل المفتاح الخاصّ (متغيّر البيئة GRANT_SIGNING_KEY: PKCS8
 * بترميز base64). منصّة التشغيل تحمل العامّ وتتحقّق قبل أن تسمح بعمليةٍ
 * على سجلٍّ مقفول. انظر docs/integration/rowad-changes.ar.md، البند ٧.
 */
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/\s+/g, "")), (c) => c.charCodeAt(0));

export type GrantPayload = {
  iss: "kahatayn";
  aud: string;
  sub: string;
  op: "update" | "delete";
  fields: string[];
  request_id: string;
  approved_by: string[];
  exp: number;
  jti: string;
};

export async function importSigningKey(pkcs8Base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", fromB64(pkcs8Base64), { name: "Ed25519" }, false, [
    "sign",
  ]);
}

export async function importVerifyKey(spkiBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("spki", fromB64(spkiBase64), { name: "Ed25519" }, false, [
    "verify",
  ]);
}

export async function signGrant(
  payload: GrantPayload,
  key: CryptoKey,
  kid = "kahatayn-1",
): Promise<string> {
  const enc = new TextEncoder();
  const head = b64url(enc.encode(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid })));
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("Ed25519", key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

/**
 * التحقّق كما تفعله منصّة التشغيل: التوقيع، والجمهور، والانتهاء. (عدم إعادة
 * الاستعمال عبر `jti` مسؤوليتها في قاعدتها.) مرجعٌ لتنفيذها واختبارٌ لنا.
 */
export async function verifyGrant(
  token: string,
  key: CryptoKey,
  expect: { aud: string; now?: number },
): Promise<{ ok: true; payload: GrantPayload } | { ok: false; reason: string }> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [head, body, sig] = parts as [string, string, string];
  let header: { alg?: string };
  let payload: GrantPayload;
  try {
    header = JSON.parse(new TextDecoder().decode(fromB64url(head)));
    payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (header.alg !== "EdDSA") return { ok: false, reason: "bad_alg" };
  const valid = await crypto.subtle.verify(
    "Ed25519",
    key,
    fromB64url(sig),
    new TextEncoder().encode(`${head}.${body}`),
  );
  if (!valid) return { ok: false, reason: "bad_signature" };
  if (payload.iss !== "kahatayn" || payload.aud !== expect.aud)
    return { ok: false, reason: "bad_audience" };
  if (payload.exp <= Math.floor((expect.now ?? Date.now()) / 1000))
    return { ok: false, reason: "expired" };
  return { ok: true, payload };
}
