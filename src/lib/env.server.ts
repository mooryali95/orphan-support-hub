import { z } from "zod";

/**
 * إعداد الخادم — مصدرٌ واحد مُنمَّط ومُتحقَّق منه (ARC-12).
 *
 * كان كلّ ملفٍّ يقرأ process.env بنفسه بقيمٍ احتياطية مختلفة: عنوان الأصل
 * من APP_ORIGIN أو PUBLIC_BASE_URL أو نطاقٍ مكتوبٍ في الشيفرة. فصار هنا:
 *
 * - **القاعدة** (SUPABASE_URL وSUPABASE_PUBLISHABLE_KEY) شرطٌ لكلّ شيء:
 *   غيابها يُسجَّل خطأً عند أوّل طلب.
 * - **كلّ ميزةٍ** لها مجموعتها (البريد، الدفع، المجدول، الإدارة…): نقصها
 *   يُطفئ الميزة وحدها ويُسمّى في السجلّ وفي /api/ops/health (أسماءٌ لا قيم).
 * - **عنوان الأصل** واحد: `PUBLIC_BASE_URL`. و`APP_ORIGIN` اسمٌ قديمٌ يُقبل
 *   احتياطاً حتى يُنقل ما تبقّى من قرّائه، ولا نطاق مكتوباً في الشيفرة.
 *
 * يُقرأ عند أوّل نداء ويُحفظ: Workers تملأ process.env قبل أوّل طلب.
 */

const url = z
  .string()
  .trim()
  .url()
  .refine((v) => /^https?:\/\//i.test(v), "يجب أن يبدأ بـ http(s)://");
const text = z.string().trim().min(1);

const Schema = z.object({
  SUPABASE_URL: url,
  SUPABASE_PUBLISHABLE_KEY: text,
  SUPABASE_SERVICE_ROLE_KEY: text.optional(),
  PUBLIC_BASE_URL: url.optional(),
  APP_ORIGIN: url.optional(),
  LOVABLE_CRON_SECRET: text.optional(),
  LOVABLE_CRON_SECRET_PREVIOUS: text.optional(),
  LOVABLE_API_KEY: text.optional(),
  LOVABLE_SEND_URL: url.optional(),
  PAYMENT_PROVIDER: text.optional(),
  CREEM_API_KEY: text.optional(),
  CREEM_WEBHOOK_SECRET: text.optional(),
  CREEM_PRODUCT_MONTHLY: text.optional(),
  GRANT_SIGNING_KEY: text.optional(),
  ERROR_REPORT_WEBHOOK_URL: url.optional(),
  SENTRY_DSN: url.optional(),
  HEARTBEAT_URL_OPS: url.optional(),
  HEARTBEAT_URL_DISPATCH: url.optional(),
});

export type ServerEnv = z.infer<typeof Schema>;

/** المتطلّبات لكلّ ميزة. الاسم يظهر في الصحّة، والقيمة لا تظهر أبداً. */
export const FEATURES = {
  admin: ["SUPABASE_SERVICE_ROLE_KEY"],
  cron: ["LOVABLE_CRON_SECRET", "SUPABASE_SERVICE_ROLE_KEY"],
  email: ["LOVABLE_API_KEY", "PUBLIC_BASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  payments: ["CREEM_API_KEY", "CREEM_WEBHOOK_SECRET", "CREEM_PRODUCT_MONTHLY"],
  grants: ["GRANT_SIGNING_KEY"],
} as const satisfies Record<string, ReadonlyArray<keyof ServerEnv>>;
export type Feature = keyof typeof FEATURES;

export type ServerConfig = {
  env: Partial<ServerEnv>;
  /** أخطاءٌ تُوقف الخادم كلّه (القاعدة) أو قيمٌ موجودة لكنها مشوّهة. */
  errors: string[];
  /** لكلّ ميزة: هل اكتمل إعدادها، وما ينقصها. */
  features: Record<Feature, { ready: boolean; missing: string[] }>;
};

/** يبني الإعداد من مصدرٍ ممرَّر (للاختبار) أو من process.env. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerConfig {
  // الفارغ غائب: Lovable Cloud تُنشئ المتغيّر فارغاً قبل أن يُملأ.
  const raw: Record<string, string> = {};
  for (const key of Object.keys(Schema.shape)) {
    const v = source[key];
    if (typeof v === "string" && v.trim() !== "") raw[key] = v;
  }

  const errors: string[] = [];
  const env: Partial<ServerEnv> = {};
  for (const [key, field] of Object.entries(Schema.shape)) {
    const res = (field as z.ZodTypeAny).safeParse(raw[key]);
    if (res.success) {
      if (res.data !== undefined) (env as Record<string, unknown>)[key] = res.data;
    } else {
      errors.push(raw[key] === undefined ? `${key}: مطلوب` : `${key}: قيمةٌ غير صالحة`);
    }
  }

  const features = {} as ServerConfig["features"];
  for (const [name, keys] of Object.entries(FEATURES) as Array<[Feature, readonly string[]]>) {
    const missing = keys.filter((k) => {
      if (k === "PUBLIC_BASE_URL") return !baseUrlOf(env);
      return env[k as keyof ServerEnv] === undefined;
    });
    features[name] = { ready: missing.length === 0, missing };
  }
  return { env, errors, features };
}

function baseUrlOf(env: Partial<ServerEnv>): string | null {
  const v = env.PUBLIC_BASE_URL ?? env.APP_ORIGIN;
  return v ? v.trim().replace(/\/+$/, "") : null;
}

let cached: ServerConfig | null = null;

export function serverConfig(): ServerConfig {
  if (!cached) cached = parseServerEnv(process.env as Record<string, string | undefined>);
  return cached;
}

/** للاختبار وحده. */
export function resetServerConfig(): void {
  cached = null;
}

/**
 * أصل المنصّة العامّ بلا شرطةٍ أخيرة — المصدر الوحيد للروابط المطلقة (البريد،
 * خريطة الموقع، العودة من الدفع). null إن لم يُضبط: من يحتاجه يتوقّف، ولا
 * يخترع نطاقاً.
 */
export function appBaseUrl(): string | null {
  return baseUrlOf(serverConfig().env);
}

export function featureReady(feature: Feature): boolean {
  return serverConfig().features[feature].ready;
}

/** ملخّصٌ آمن للصحّة: أسماء ما ينقص، بلا قيمة واحدة. */
export function configSummary(): {
  ok: boolean;
  errors: string[];
  features: Record<Feature, boolean>;
} {
  const c = serverConfig();
  return {
    ok: c.errors.length === 0,
    errors: c.errors,
    features: Object.fromEntries(
      Object.entries(c.features).map(([k, v]) => [k, v.ready]),
    ) as Record<Feature, boolean>,
  };
}
