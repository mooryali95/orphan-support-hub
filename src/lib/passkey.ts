import { supabase } from "@/integrations/supabase/client";
import {
  classifyPasskeyError,
  deviceKind,
  passkeyFriendlyName,
  type PasskeyFailure,
} from "@/lib/passkey-core";

export { classifyPasskeyError, type PasskeyFailure } from "@/lib/passkey-core";

/**
 * البصمة (passkey) — دخولٌ بالوجه أو الإصبع أو قفل الجهاز، بلا رمزٍ ولا
 * كلمة مرور. تُدار عبر Supabase Auth مباشرة؛ ولا بيانات حيوية تغادر الجهاز.
 *
 * ثلاث طبقات:
 *  - الملاءمة: هل يستطيع هذا المتصفّح أصلاً، وهل فيه مصادِقٌ مدمج،
 *    وهل يدعم الإكمال التلقائي (Conditional UI).
 *  - الذاكرة: هل سجّل هذا الجهاز بصمةً من قبل، فتُقدَّم أولاً.
 *  - المراسم: دخولٌ وتسجيلٌ بتصنيف الخطأ، وإعادة التحدّي المنتهي بصمت.
 */

export function passkeySupported(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && window.isSecureContext;
}

export type PasskeyCapabilities = {
  /** WebAuthn موجود وفي سياقٍ آمن. */
  supported: boolean;
  /** بصمة أو وجه أو قفل مدمج في الجهاز (لا مفتاحٌ خارجي فقط). */
  platform: boolean;
  /** المتصفّح يعرض البصمات في قائمة الإكمال التلقائي لحقل البريد. */
  conditional: boolean;
};

/** تُحسب مرّةً في العميل؛ على الخادم كلّ شيءٍ false. */
export async function passkeyCapabilities(): Promise<PasskeyCapabilities> {
  if (!passkeySupported()) return { supported: false, platform: false, conditional: false };
  const PKC = window.PublicKeyCredential as typeof PublicKeyCredential & {
    isConditionalMediationAvailable?: () => Promise<boolean>;
  };
  const [platform, conditional] = await Promise.all([
    PKC.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false) ?? false,
    PKC.isConditionalMediationAvailable?.().catch(() => false) ?? false,
  ]);
  return { supported: true, platform, conditional };
}

/** اسمٌ ودود لبصمة هذا الجهاز بلغة الواجهة: «آيفون · 31 أكتوبر». */
export function deviceName(locale = "ar"): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return passkeyFriendlyName(deviceKind(ua), locale);
}

/* ── الذاكرة المحلّية ─────────────────────────────────────────────── */

const KNOWN = "passkey-on-device";
const DISMISS = "passkey-offer-dismissed";
const DISABLED = "passkey-server-disabled";

function flag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function setFlag(key: string, on: boolean) {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* التخزين محجوب: نفقد التحسين لا الوظيفة */
  }
}

/** سجّل هذا الجهاز بصمةً أو دخل بها من قبل، فتُقدَّم البصمة أوّل الطرق. */
export const deviceHasPasskey = () => flag(KNOWN);
export const rememberDevicePasskey = (on = true) => setFlag(KNOWN, on);

/** «لاحقاً» تُحفظ في الجهاز: لا يُلحّ العرض في كل دخول. */
export const offerDismissed = () => flag(DISMISS);
export const dismissOffer = () => setFlag(DISMISS, true);

/**
 * الخادم ردّ بـ passkey_disabled: يُخفى الزرّ في هذه الجلسة وما بعدها حتى
 * يُفعَّل. لا يُحفظ طويلاً — التفعيل قد يأتي في أيّ لحظة — فنكتفي بالجلسة.
 */
export function passkeyServerDisabled(): boolean {
  try {
    return sessionStorage.getItem(DISABLED) === "1";
  } catch {
    return false;
  }
}
function markServerDisabled() {
  try {
    sessionStorage.setItem(DISABLED, "1");
  } catch {
    /* لا شيء */
  }
}

/* ── المراسم ──────────────────────────────────────────────────────── */

/** المكتبة قد ترمي بدل أن تُرجع { error } (البصمة معطّلة فيها)؛ نوحّد الشكل. */
async function guard<T extends { error: unknown }>(run: () => Promise<T>): Promise<T | { data: null; error: unknown }> {
  try {
    return await run();
  } catch (error) {
    return { data: null, error };
  }
}

export type PasskeyResult = { ok: true } | { ok: false; why: PasskeyFailure };

type SignInOptions = { mediation?: CredentialMediationRequirement; signal?: AbortSignal };

/**
 * الدخول بالبصمة. تحدٍّ منتهٍ يُعاد طلبه مرّةً واحدة بصمت — يحدث في
 * الإكمال التلقائي حين يبقى حقل البريد مفتوحاً أكثر من خمس دقائق.
 */
export async function signInWithPasskey(options: SignInOptions = {}): Promise<PasskeyResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await guard(() => supabase.auth.signInWithPasskey({ options }));
    if (!error) {
      rememberDevicePasskey();
      return { ok: true };
    }
    const why = classifyPasskeyError(error);
    if (why === "expired" && attempt === 0 && !options.signal?.aborted) continue;
    if (why === "disabled") markServerDisabled();
    if (why === "none") rememberDevicePasskey(false);
    return { ok: false, why };
  }
  return { ok: false, why: "failed" };
}

/** تسجيل بصمة هذا الجهاز للحساب الحالي، باسمٍ ودودٍ بلغة الواجهة. */
export async function addPasskey(locale = "ar"): Promise<PasskeyResult> {
  const res = await guard(() => supabase.auth.registerPasskey());
  if (res.error) {
    const why = classifyPasskeyError(res.error);
    if (why === "disabled") markServerDisabled();
    // بصمةٌ مسجّلة سلفاً تعني أنّ الجهاز معروف — وهذا نجاحٌ من وجهة المستخدم.
    if (why === "duplicate") rememberDevicePasskey();
    return { ok: false, why };
  }
  rememberDevicePasskey();
  if (res.data?.id) {
    // اسمٌ من AAGUID قد يكون «iCloud Keychain»؛ اسم الجهاز والتاريخ أوضح للمستخدم.
    await supabase.auth.passkey.update({
      passkeyId: res.data.id,
      friendlyName: deviceName(locale),
    });
  }
  return { ok: true };
}

export type PasskeyInfo = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string | null;
};

export async function listPasskeys(): Promise<PasskeyInfo[]> {
  const { data, error } = await guard(() => supabase.auth.passkey.list());
  return error ? [] : ((data ?? []) as PasskeyInfo[]);
}

export async function renamePasskey(passkeyId: string, friendlyName: string) {
  return guard(() =>
    supabase.auth.passkey.update({ passkeyId, friendlyName: friendlyName.trim().slice(0, 120) }),
  );
}

export async function removePasskey(passkeyId: string) {
  const res = await guard(() => supabase.auth.passkey.delete({ passkeyId }));
  if (!res.error && (await listPasskeys()).length === 0) rememberDevicePasskey(false);
  return res;
}
