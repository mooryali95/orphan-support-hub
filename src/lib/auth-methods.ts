/**
 * أيّ طرق الدخول مفعّلةٌ في الخادم فعلاً — فلا تُعرض طريقةٌ لا تعمل.
 *
 * `GET /auth/v1/settings` نقطةٌ عامّة في Supabase Auth تُقرأ بالمفتاح المنشور نفسه الذي يحمله
 * المتصفّح؛ تقول أيّ المزوّدين مفعّل. تُسأل مرّةً واحدة حين تُفتح لوحة الدخول. وإن تعذّر السؤال
 * (شبكة، حجب) عادت `null` فتبقى اللوحة كما كانت: تعرض الطرق وتشرح الخطأ إن وقع.
 */
export type AuthMethods = {
  /** رمزٌ أو رابط إلى البريد */
  email: boolean;
  /** رمزٌ برسالةٍ نصّية: يحتاج مزوّد SMS في الخادم */
  phone: boolean;
};

export function parseAuthSettings(json: unknown): AuthMethods | null {
  if (!json || typeof json !== "object") return null;
  const external = (json as Record<string, unknown>)["external"];
  if (!external || typeof external !== "object") return null;
  const e = external as Record<string, unknown>;
  return { email: e["email"] !== false, phone: e["phone"] === true };
}

let asked: Promise<AuthMethods | null> | null = null;

export function serverAuthMethods(): Promise<AuthMethods | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  asked ??= (async () => {
    try {
      const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
      const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;
      if (!url || !key) return null;
      const res = await fetch(`${url}/auth/v1/settings`, {
        headers: { apikey: key },
        signal: AbortSignal.timeout(6000),
      });
      return res.ok ? parseAuthSettings(await res.json()) : null;
    } catch {
      return null;
    }
  })();
  return asked;
}
