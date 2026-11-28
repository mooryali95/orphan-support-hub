/**
 * «حسابي» و«تفضيلات الإشعارات» في العرض التفاعلي: حسابٌ نموذجي في ذاكرة الصفحة وحدها.
 * لا جلسة مصادقة ولا بصمة حقيقية ولا بريد: الاسم والبصمات والتفضيلات تتغيّر في هذه الصفحة
 * ولا تصل إلى أحد. يُسجَّل بنداءٍ صريح (`registerAccountDemos`)، لأنّ الحزمة `sideEffects: false`.
 * (من ملفّات التجربة في `trial.manifest.json`.)
 */
import type { AccountUser } from "@/components/account/AccountBoard";
import type { AuthMethods } from "@/lib/auth-methods";
import { registerDemo } from "@/lib/data-port";
import type { Locale } from "@/lib/locale";
import type { PasskeyInfo, PasskeyResult } from "@/lib/passkey";

const NAMES = {
  ar: {
    user: "داعمٌ نموذجي",
    laptop: "الحاسوب المحمول",
    phone: "هاتف العمل",
    device: "هذا الجهاز",
  },
  en: { user: "Sample supporter", laptop: "Laptop", phone: "Work phone", device: "This device" },
};
const namesFor = (locale: Locale) => (locale === "ar" ? NAMES.ar : NAMES.en);

/** صاحب الحساب النموذجي: بريدٌ في نطاقٍ محجوز للأمثلة، لا عنوانٌ حقيقي. */
export function tryAccountUser(locale: Locale): AccountUser {
  return {
    id: "try-account",
    email: "supporter@example.org",
    phone: null,
    created_at: "2026-03-14T09:00:00Z",
    full_name: namesFor(locale).user,
    google: false,
  };
}

export function registerAccountDemos(locale: Locale = "ar") {
  const n = namesFor(locale);
  const keys: PasskeyInfo[] = [
    {
      id: "try-key-1",
      friendly_name: n.laptop,
      created_at: "2026-04-02T10:00:00Z",
      last_used_at: "2026-11-20T08:30:00Z",
    },
    {
      id: "try-key-2",
      friendly_name: n.phone,
      created_at: "2026-09-18T16:00:00Z",
      last_used_at: null,
    },
  ];
  const methods: AuthMethods = { email: true, phone: false, google: true, passkey: true };
  const prefs = {
    email_enabled: true,
    muted_kinds: ["pledge_preparing"] as string[],
    unsubscribe_token: "",
  };

  registerDemo("account.authMethods", async () => methods);
  registerDemo("account.passkeys", async () => keys.map((k) => ({ ...k })));
  registerDemo("account.saveName", async () => ({ error: null }));
  registerDemo("account.addPasskey", async (): Promise<PasskeyResult> => {
    keys.push({
      id: `try-key-${keys.length + 1}`,
      friendly_name: n.device,
      created_at: new Date().toISOString(),
      last_used_at: null,
    });
    return { ok: true };
  });
  registerDemo("account.renamePasskey", async ({ id, name }: { id: string; name: string }) => {
    const k = keys.find((x) => x.id === id);
    if (k) k.friendly_name = name.trim().slice(0, 120);
    return { data: null, error: null };
  });
  registerDemo("account.removePasskey", async ({ id }: { id: string }) => {
    const i = keys.findIndex((x) => x.id === id);
    if (i >= 0) keys.splice(i, 1);
    return { data: null, error: null };
  });

  registerDemo("notifications.prefs", async () => ({
    ok: true as const,
    error: null,
    prefs: { ...prefs, muted_kinds: [...prefs.muted_kinds] },
  }));
  registerDemo(
    "notifications.savePrefs",
    async ({ data }: { data: { emailEnabled: boolean; mutedKinds: string[] } }) => {
      prefs.email_enabled = data.emailEnabled;
      prefs.muted_kinds = [...data.mutedKinds];
      return { ok: true as const, error: null, prefs: { ...prefs } };
    },
  );
}
