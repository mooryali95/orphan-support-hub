import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Messages } from "@/lib/locale";

/**
 * حال اللغات للواجهة العامّة: أيّ لغاتٍ منشورة، ونصوص اللغة المطلوبة.
 *
 * - العربية والإنجليزية في الكود دائماً؛ هذه الدالّة للّغات الأخرى.
 * - النصّ المنشور يُسقَط إن تغيّر أصله منذ تُرجم (بصمة الأصل في الفهرس
 *   لا تطابق بصمته في القاعدة): ترجمةٌ لنصٍّ قديم قد تقول غير ما يقوله
 *   الأصل الآن، فالأسلم أن يظهر الأصل الإنجليزي حتى تُراجَع.
 * - النتيجة مخبّأة دقيقةً لكل لغة: المنشور واحدٌ للجميع.
 */
export type UiLocale = { code: string; name: string; dir: "rtl" | "ltr" };
export type UiState = { locale: string; locales: UiLocale[]; messages: Messages | null };

function anon() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

type Rpc = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

const TTL = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function liveLocales(): Promise<UiLocale[]> {
  return cached("locales", async () => {
    const { data, error } = await (anon() as unknown as Rpc).rpc("public_ui_locales");
    // قاعدةٌ لم تُطبَّق عليها الهجرة بعد: لا لغات إضافية، والعربية والإنجليزية تعملان.
    return error ? [] : ((data ?? []) as UiLocale[]);
  });
}

async function publishedMessages(locale: string): Promise<Messages> {
  return cached(`msgs:${locale}`, async () => {
    const { data, error } = await (anon() as unknown as Rpc).rpc("published_ui_messages", {
      _locale: locale,
    });
    if (error || !data) return {};
    const { default: catalog } = await import("@/i18n/catalog.json");
    const hashes = (catalog as { entries: Record<string, { hash: string }> }).entries;
    const out: Messages = {};
    for (const row of data as Array<{ key: string; text: string; source_hash: string }>) {
      if (hashes[row.key]?.hash === row.source_hash) out[row.key] = row.text;
    }
    return out;
  });
}

/**
 * للتطوير وحده: `KH_DEV_DRAFT_LOCALES=sq` يعرض المسودّة المرفقة كأنها منشورة،
 * فيرى المترجم والمطوّر الموقع بلغته محلياً بلا قاعدة. لا أثر له في البناء.
 */
async function devDrafts(): Promise<{
  locales: UiLocale[];
  messages: Record<string, Messages>;
} | null> {
  if (!import.meta.env.DEV) return null;
  const codes = (process.env["KH_DEV_DRAFT_LOCALES"] ?? "").split(",").filter(Boolean);
  if (codes.length === 0) return null;
  const { dirOf, nativeName } = await import("@/lib/locale");
  const messages: Record<string, Messages> = {};
  for (const c of codes) {
    if (c === "sq") messages[c] = (await import("@/i18n/drafts/sq.json")).default as Messages;
  }
  return {
    locales: Object.keys(messages).map((c) => ({ code: c, name: nativeName(c), dir: dirOf(c) })),
    messages,
  };
}

export const getUiState = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ locale: z.string().regex(/^[a-z]{2,3}$/) }).parse(d))
  .handler(async ({ data }): Promise<UiState> => {
    const dev = await devDrafts();
    if (dev) {
      const wanted = data.locale;
      if (dev.messages[wanted])
        return { locale: wanted, locales: dev.locales, messages: dev.messages[wanted]! };
      return { locale: wanted === "ar" ? "ar" : "en", locales: dev.locales, messages: null };
    }
    const locales = await liveLocales();
    const wanted = data.locale;
    if (wanted === "ar" || wanted === "en") return { locale: wanted, locales, messages: null };
    // لغةٌ غير منشورة (أو أُوقفت): الإنجليزية، لا صفحةٌ بنصوصٍ ناقصة.
    if (!locales.some((l) => l.code === wanted)) return { locale: "en", locales, messages: null };
    return { locale: wanted, locales, messages: await publishedMessages(wanted) };
  });
