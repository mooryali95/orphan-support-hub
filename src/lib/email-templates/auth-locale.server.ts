import { authEmailFrame, authEmailLocaleHint, emailLocale, type EmailLocale } from "./copy";

/**
 * إطار رسالة المصادقة بلغة المستلم: من رابطها إن حمل `lang`، وإلا من لغة حسابه المخزّنة
 * (`auth_email_locale`، للخادم وحده)، وإلا العربية. فاستعادةٌ بدأت من لوحة المصادقة أو دعوةٌ
 * بلا لغة تصل بلغة صاحبها.
 */
export async function authEmailFrameFor(
  data: { url: string; email: string },
  lookup: (email: string) => Promise<EmailLocale | null> = storedEmailLocale,
) {
  if (authEmailLocaleHint(data.url)) return authEmailFrame(data.url);
  return authEmailFrame(data.url, await lookup(data.email).catch(() => null));
}

async function storedEmailLocale(email: string): Promise<EmailLocale | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const client = supabaseAdmin as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await client.rpc("auth_email_locale", { _email: email });
  return error || typeof data !== "string" ? null : emailLocale(data);
}
