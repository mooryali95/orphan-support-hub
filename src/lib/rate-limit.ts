import { withPhase7 } from "@/integrations/supabase/types.extra";

/**
 * تحديد المعدّل (M6).
 *
 * العدّاد في القاعدة لا في ذاكرة العملية: النشر على Cloudflare يعني عدّة
 * عمليات لا واحدة، وعدّاد في الذاكرة يُقسَّم عليها فيصير الحدّ المعلن
 * أضعافه فعلياً — وهو أسوأ من غيابه لأنه يوهم بالحماية.
 */

export type Bucket = "auth" | "search" | "checkout" | "intake" | "api" | "api_client" | "cron";

/** حدود محافظة: تُوقف الآلة ولا تُزعج الإنسان. */
const LIMITS: Record<Bucket, { limit: number; windowSeconds: number }> = {
  // محاولة دخول كل ستّ ثوانٍ وسطياً: بعيد جداً عن استخدام بشري،
  // وقريب جداً من أن يجعل تخمين كلمات المرور بلا جدوى.
  auth: { limit: 10, windowSeconds: 60 },
  search: { limit: 60, windowSeconds: 60 },
  checkout: { limit: 10, windowSeconds: 300 },
  intake: { limit: 20, windowSeconds: 3600 },
  // بوّابات التكامل: كل طلبٍ بمفتاحٍ يكلّف تجزئة scrypt، فبلا حدٍّ يصير
  // التخمين مجّانياً واستنزاف المعالج ممكناً. مئةٌ وعشرون في الدقيقة لكل
  // مصدر تكفي مزامنةً بدفعات من خمسمئة.
  api: { limit: 120, windowSeconds: 60 },
  // بعد المصادقة: لكلّ مفتاح شريك، أيّاً كان عنوانه — فلا يتوزّع مفتاحٌ
  // مسرَّب على عناوين كثيرة ليتجاوز الحدّ.
  api_client: { limit: 300, windowSeconds: 60 },
  // مسارات المجدول (التصريف والصحّة): قبل فحص السرّ، فلا يُخمَّن بلا حدّ.
  cron: { limit: 30, windowSeconds: 60 },
};

/**
 * ما يُغلق عند تعذّر العدّ (APP-10). الدخول والدفع والبوّابات والمجدول
 * والإدخال حسّاسة: حاجزٌ معطّل فيها بابٌ مفتوح للتخمين والاستنزاف، والإغلاق
 * المؤقّت أهون. أمّا البحث العامّ فيبقى مفتوحاً: تعطيل الدليل لعطلٍ في
 * العدّاد يضرّ الزائرين ولا يحمي شيئاً.
 */
export const FAIL_CLOSED: ReadonlySet<Bucket> = new Set<Bucket>([
  "auth",
  "checkout",
  "intake",
  "api",
  "api_client",
  "cron",
]);

/**
 * عنوان الطالب من ترويسة المنصّة وحدها. Cloudflare تضع cf-connecting-ip
 * وتستبدل ما يرسله العميل بالاسم نفسه؛ أمّا x-forwarded-for فيكتبه العميل
 * كما يشاء، فالثقة به تجعل لكلّ طلبٍ دلواً جديداً.
 */
export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown";
}

/**
 * هوية الطالب.
 *
 * المستخدم المسجَّل يُعرَّف بمعرّفه؛ وغيره بعنوانه من ترويسة المنصّة وحدها
 * (APP-10: وكيل المتصفّح كان جزءاً من البصمة، فتغييره يعطي دلواً جديداً).
 * والعنوان يُجزَّأ لا يُخزَّن خاماً: عنوان IP بيانٌ شخصي.
 */
export async function identityOf(request: Request, userId?: string | null): Promise<string> {
  if (userId) return `u:${userId}`;
  const { createHash } = await import("node:crypto");
  return `a:${createHash("sha256").update(clientIp(request)).digest("hex").slice(0, 32)}`;
}

export type RateVerdict = {
  allowed: boolean;
  hits: number;
  limit: number;
  resetAt: string | null;
};

export async function hitRateLimit(bucket: Bucket, identity: string): Promise<RateVerdict> {
  const cfg = LIMITS[bucket];

  let data: unknown = null;
  let error: unknown = null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    ({ data, error } = await withPhase7(supabaseAdmin).rpc("hit_rate_limit", {
      _bucket: bucket,
      _identity: identity,
      _limit: cfg.limit,
      _window_seconds: cfg.windowSeconds,
    }));
  } catch (thrown) {
    // مفتاح الخدمة غائب أو الشبكة انقطعت: الحكم نفسه كخطأ القاعدة.
    error = thrown;
  }

  if (error) {
    // تعذّر العدّ: الحسّاس يُغلق، والبحث العامّ يمرّ (FAIL_CLOSED أعلاه).
    const { logServerError } = await import("@/lib/server-log");
    logServerError("rate_limit.unavailable", error, { bucket });
    return { allowed: !FAIL_CLOSED.has(bucket), hits: 0, limit: cfg.limit, resetAt: null };
  }

  const v = data as { allowed: boolean; hits: number; limit: number; reset_at: string };
  return { allowed: v.allowed, hits: v.hits, limit: v.limit, resetAt: v.reset_at };
}

/**
 * حدّ الطلب الجاري داخل دالّة خادم (بلا Request في يدها): يقرأ العنوان من
 * طلب TanStack الحالي. يُعيد الحكم، والدالّة تختار ردّها.
 */
export async function limitCurrentRequest(
  bucket: Bucket,
  userId?: string | null,
): Promise<RateVerdict> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const request = getRequest();
  return hitRateLimit(bucket, await identityOf(request, userId));
}

export const RATE_LIMITED_MESSAGE = "محاولات كثيرة في وقت قصير. أعد المحاولة بعد قليل.";

/** استجابة 429 قياسية مع `Retry-After`. */
export function tooManyRequests(verdict: RateVerdict): Response {
  const retry = verdict.resetAt
    ? Math.max(1, Math.ceil((new Date(verdict.resetAt).getTime() - Date.now()) / 1000))
    : 60;

  return new Response(
    JSON.stringify({ error: "محاولات كثيرة في وقت قصير. أعد المحاولة بعد قليل." }),
    {
      status: 429,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "retry-after": String(retry),
      },
    },
  );
}
