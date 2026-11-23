/**
 * منطق البصمة الخالص — بلا متصفّحٍ ولا Supabase، فيُختبر وحده.
 * ما يحتاج `window` أو العميل يسكن في `passkey.ts`.
 */

/** ما يمكن أن تنتهي إليه مراسمُ البصمة سوى النجاح. */
export type PasskeyFailure =
  /** أغلق المستخدم النافذة أو رفض؛ لا يُعلَن. */
  | "cancelled"
  /** الخادم لا يقبل البصمات أصلاً؛ يُخفى الزرّ. */
  | "disabled"
  /** انتهى التحدّي قبل أن يختار؛ يُعاد طلبه بصمت. */
  | "expired"
  /** اختار بصمةً لا يعرفها الخادم (حُذفت من الحساب مثلاً). */
  | "none"
  /** هذا الجهاز سجّل بصمةً من قبل لهذا الحساب. */
  | "duplicate"
  /** الحساب بلا بريدٍ أو جوالٍ مؤكَّد، فلا يُقبل. */
  | "unconfirmed"
  /** أيّ شيءٍ آخر. */
  | "failed";

type ErrorLike = { code?: unknown; name?: unknown; message?: unknown; cause?: unknown };

/**
 * يقرأ رمز Supabase (`passkey_disabled` …) أو رمز WebAuthn في المكتبة
 * (`ERROR_CEREMONY_ABORTED` …) أو اسم خطأ المتصفّح (`NotAllowedError`).
 */
/**
 * «معطّلة» من أين؟ المكتبة في المتصفّح (نسخةٌ تشترط تفعيلها في العميل)،
 * أم خادم Supabase (البصمة غير مفعّلة في إعدادات المصادقة). الرسالة للمستخدم
 * تختلف، والعلاج يختلف.
 */
export function passkeyDisabledSource(err: unknown): "client" | "server" {
  const e = (err ?? {}) as ErrorLike;
  return /experimental and disabled/i.test(String(e.message ?? "")) ? "client" : "server";
}

export function classifyPasskeyError(err: unknown): PasskeyFailure {
  const e = (err ?? {}) as ErrorLike;
  const code = String(e.code ?? "");
  const name = String(e.name ?? "");
  const text = `${code} ${name} ${String(e.message ?? "")}`;

  if (code === "passkey_disabled") return "disabled";
  if (/experimental and disabled/i.test(String(e.message ?? ""))) return "disabled";
  if (code === "webauthn_challenge_expired" || code === "webauthn_challenge_not_found") {
    return "expired";
  }
  if (code === "webauthn_credential_not_found") return "none";
  if (
    code === "webauthn_credential_exists" ||
    code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED"
  ) {
    return "duplicate";
  }
  if (code === "email_not_confirmed" || code === "phone_not_confirmed") return "unconfirmed";
  if (
    code === "ERROR_CEREMONY_ABORTED" ||
    name === "NotAllowedError" ||
    name === "AbortError" ||
    /\babort|cancel/i.test(text)
  ) {
    return "cancelled";
  }
  // المكتبة تلفّ خطأ المتصفّح في cause أحياناً.
  if (e.cause && e.cause !== err) {
    const inner = classifyPasskeyError(e.cause);
    if (inner !== "failed") return inner;
  }
  return "failed";
}

export type DeviceKind = "iphone" | "ipad" | "android" | "mac" | "windows" | "linux" | "other";

/** نوع الجهاز من وكيل المستخدم؛ يكفي لاسمٍ ودود في قائمة البصمات. */
export function deviceKind(userAgent: string): DeviceKind {
  const ua = userAgent || "";
  if (/iPhone/.test(ua)) return "iphone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua))) return "ipad";
  if (/Android/.test(ua)) return "android";
  if (/Mac OS X|Macintosh/.test(ua)) return "mac";
  if (/Windows/.test(ua)) return "windows";
  if (/Linux|CrOS/.test(ua)) return "linux";
  return "other";
}

const EN: Record<DeviceKind, string> = {
  iphone: "iPhone",
  ipad: "iPad",
  android: "Android",
  mac: "Mac",
  windows: "Windows",
  linux: "Linux",
  other: "This device",
};

const DEVICE_NAMES: Record<string, Record<DeviceKind, string>> = {
  en: EN,
  ar: {
    iphone: "آيفون",
    ipad: "آيباد",
    android: "أندرويد",
    mac: "ماك",
    windows: "ويندوز",
    linux: "لينكس",
    other: "هذا الجهاز",
  },
  sq: {
    iphone: "iPhone",
    ipad: "iPad",
    android: "Android",
    mac: "Mac",
    windows: "Windows",
    linux: "Linux",
    other: "Kjo pajisje",
  },
};

/** اسم الجهاز بلغة الواجهة؛ لغةٌ بلا جدولٍ تعود إلى الإنجليزية. */
export function deviceLabel(kind: DeviceKind, locale: string): string {
  const table = DEVICE_NAMES[locale] ?? DEVICE_NAMES[locale.split("-")[0] ?? ""] ?? EN;
  return table[kind];
}

/**
 * الاسم الذي يُحفظ مع البصمة: «آيفون · 31 أكتوبر». التاريخ يفرّق بين
 * جهازين من النوع نفسه، والحدّ ١٢٠ حرفاً من الخادم.
 */
export function passkeyFriendlyName(kind: DeviceKind, locale: string, at = new Date()): string {
  const intl = locale === "ar" ? "ar-u-nu-latn" : locale;
  let date: string;
  try {
    date = new Intl.DateTimeFormat(intl, { day: "numeric", month: "short" }).format(at);
  } catch {
    date = at.toISOString().slice(0, 10);
  }
  return `${deviceLabel(kind, locale)} · ${date}`.slice(0, 120);
}
