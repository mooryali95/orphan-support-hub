import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * مصادقة شركاء التكامل.
 *
 * **سرٌّ حامل، مُجزَّأ عندنا — لا HMAC بسرٍّ مشترك.** خارطة الطريق كتبت
 * «توقيع HMAC»، وهو الصواب حين نكون نحن المُرسِل (كما في الـwebhooks
 * الصادرة). أمّا هنا فالشريك هو المُنادي، وHMAC بسرٍّ مشترك يفرض أن
 * **نحفظ سرّه قابلاً للاسترجاع** — فتسرُّبُ قاعدتنا يُمكّن من انتحال كل
 * شريك. والسرّ الحامل فوق TLS يُعرّض السرّ للسلك وحده (وهو مُعمّى)،
 * ويُخزَّن عندنا مُجزَّأً بملحٍ فلا يُستردّ. والمقايضة في صالحنا.
 *
 * ومع ذلك يبقى **ختم الوقت** شرطاً: طلبٌ ملتقَط يُعاد إرساله إلى الأبد
 * بلا نافذةٍ زمنية. والختم وحده لا يمنع الإعادة **داخل** النافذة (APP-12):
 * فكلّ كتابةٍ تحمل أحاديةً تُقبل مرّةً واحدة (`replayNonce` ومخزن
 * `api_request_nonces`) — `X-Api-Nonce` من الشريك، أو بصمة الطلب نفسه.
 */

const SCRYPT_KEYLEN = 32;
const WINDOW_SECONDS = 300;

export function newSecret(): { secret: string; salt: string; hash: string; prefix: string } {
  const secret = `sk_live_${randomBytes(24).toString("base64url")}`;
  const salt = randomBytes(16).toString("hex");
  return { secret, salt, hash: hashSecret(secret, salt), prefix: secret.slice(0, 16) };
}

export function newClientKey(): string {
  return `ck_live_${randomBytes(12).toString("base64url")}`;
}

export function hashSecret(secret: string, salt: string): string {
  return scryptSync(secret, salt, SCRYPT_KEYLEN).toString("hex");
}

/** مقارنةٌ ثابتة الزمن: مقارنةُ النصوص تُسرّب طول البادئة المطابقة. */
export function secretMatches(secret: string, salt: string, expectedHash: string): boolean {
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHash, "hex");
  } catch {
    return false;
  }
  if (expected.length !== SCRYPT_KEYLEN) return false;
  const actual = scryptSync(secret, salt, SCRYPT_KEYLEN);
  return timingSafeEqual(actual, expected);
}

export function digest(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export const NONCE_MAX_LENGTH = 200;
export const REPLAY_WINDOW_SECONDS = WINDOW_SECONDS;

/**
 * أحادية الطلب في مخزن الإعادة، أو null إن لم يلزم.
 *
 * - `X-Api-Nonce` من الشريك تُستعمل كما هي (`n:`)، لكل طريقة.
 * - بلاها، الكتابة بلا مفتاح تكرار تأخذ بصمة الطلب نفسه (`f:`): الختم
 *   والطريقة والمسار وبصمة الجسم. فالطلب الملتقَط حرفاً بحرف لا يمرّ مرّتين،
 *   والشريك الذي يعيد المحاولة يولّد ختماً جديداً كما يفعل أصلاً.
 * - القراءة (GET) آمنة الإعادة، والكتابة بمفتاح تكرار يحرسها المفتاح.
 */
export function replayNonce(req: {
  nonce: string | null;
  timestamp: string | null;
  method: string;
  path: string;
  body: string;
  idempotencyKey: string | null;
}): string | null {
  if (req.nonce) {
    if (req.nonce.length > NONCE_MAX_LENGTH) throw new Error("nonce_too_long");
    return `n:${req.nonce}`;
  }
  if (req.method.toUpperCase() === "GET" || req.idempotencyKey) return null;
  return `f:${digest(
    [req.timestamp ?? "", req.method.toUpperCase(), req.path, digest(req.body)].join("\n"),
  )}`;
}

export type AuthFailure ={ code: string; status: number; message: string };

/** ختمٌ خارج النافذة يُرفض: بلا ذلك يُعاد الطلب الملتقَط أبداً. */
export function timestampFresh(value: string | null, nowMs = Date.now()): boolean {
  if (!value) return false;
  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  // يُقبل بالثواني أو بالمللي ثانية: الشركاء يختلفون، والخطأ هنا مُحيِّر.
  const ms = Math.abs(n) > 1e12 ? n : n * 1000;
  return Math.abs(nowMs - ms) <= WINDOW_SECONDS * 1000;
}

export const AUTH_ERRORS: Record<string, AuthFailure> = {
  missing_credentials: {
    code: "missing_credentials",
    status: 401,
    message: "مطلوب X-Api-Key و X-Api-Secret و X-Api-Timestamp.",
  },
  stale_timestamp: {
    code: "stale_timestamp",
    status: 401,
    message: "ختم الوقت خارج نافذة خمس دقائق.",
  },
  invalid_credentials: {
    code: "invalid_credentials",
    status: 401,
    message: "مفتاح أو سرّ غير صالح، أو مفتاح مُبطَل.",
  },
  scope_denied: {
    code: "scope_denied",
    status: 403,
    message: "المفتاح لا يحمل النطاق المطلوب لهذه العملية.",
  },
};
