import { supabase } from "@/integrations/supabase/client";

/**
 * البصمة (passkey) — دخولٌ بالوجه أو الإصبع أو قفل الجهاز، بلا رمزٍ ولا
 * كلمة مرور. تُدار عبر Supabase Auth مباشرة؛ ولا بيانات حيوية تغادر الجهاز.
 */
export function passkeySupported(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && window.isSecureContext;
}

/** اسمٌ ودود للجهاز الحالي: «آيفون» أو «ماك» … يُعرض في قائمة البصمات. */
export function deviceName(): string {
  if (typeof navigator === "undefined") return "جهاز";
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "آيفون";
  if (/iPad/.test(ua)) return "آيباد";
  if (/Android/.test(ua)) return "أندرويد";
  if (/Mac OS X/.test(ua)) return "ماك";
  if (/Windows/.test(ua)) return "ويندوز";
  return "هذا الجهاز";
}

export async function signInWithPasskey() {
  return supabase.auth.signInWithPasskey();
}

export async function addPasskey() {
  const res = await supabase.auth.registerPasskey();
  if (!res.error && res.data?.id) {
    await supabase.auth.passkey.update({ passkeyId: res.data.id, friendlyName: deviceName() });
  }
  return res;
}

export async function listPasskeys() {
  const { data, error } = await supabase.auth.passkey.list();
  return error ? [] : (data ?? []);
}

export async function removePasskey(passkeyId: string) {
  return supabase.auth.passkey.delete({ passkeyId });
}

/** «لاحقاً» تُحفظ في الجهاز: لا يُلحّ العرض في كل دخول. */
const DISMISS = "passkey-offer-dismissed";
export function offerDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS) === "1";
  } catch {
    return false;
  }
}
export function dismissOffer() {
  try {
    localStorage.setItem(DISMISS, "1");
  } catch {
    /* التخزين محجوب: يُعرض العرض مرّة أخرى، ولا ضرر */
  }
}
