import { withPhase7 } from "@/integrations/supabase/types.extra";

/**
 * تحديد المعدّل (M6).
 *
 * العدّاد في القاعدة لا في ذاكرة العملية: النشر على Cloudflare يعني عدّة
 * عمليات لا واحدة، وعدّاد في الذاكرة يُقسَّم عليها فيصير الحدّ المعلن
 * أضعافه فعلياً — وهو أسوأ من غيابه لأنه يوهم بالحماية.
 */

export type Bucket = "auth" | "search" | "checkout" | "intake";

/** حدود محافظة: تُوقف الآلة ولا تُزعج الإنسان. */
const LIMITS: Record<Bucket, { limit: number; windowSeconds: number }> = {
  // محاولة دخول كل ستّ ثوانٍ وسطياً: بعيد جداً عن استخدام بشري،
  // وقريب جداً من أن يجعل تخمين كلمات المرور بلا جدوى.
  auth: { limit: 10, windowSeconds: 60 },
  search: { limit: 60, windowSeconds: 60 },
  checkout: { limit: 10, windowSeconds: 300 },
  intake: { limit: 20, windowSeconds: 3600 },
};

/**
 * هوية الطالب.
 *
 * المستخدم المسجَّل يُعرَّف بمعرّفه؛ وغيره ببصمة من العنوان ووكيل
 * المتصفّح. والبصمة تُجزَّأ لا تُخزَّن خاماً: عنوان IP بيان شخصي، وحفظه
 * لتحديد المعدّل وحده لا يبرّر الاحتفاظ به مقروءاً.
 */
export async function identityOf(request: Request, userId?: string | null): Promise<string> {
  if (userId) return `u:${userId}`;

  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const ua = request.headers.get("user-agent") ?? "";

  const { createHash } = await import("node:crypto");
  return `a:${createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 32)}`;
}

export type RateVerdict = {
  allowed: boolean;
  hits: number;
  limit: number;
  resetAt: string | null;
};

export async function hitRateLimit(bucket: Bucket, identity: string): Promise<RateVerdict> {
  const cfg = LIMITS[bucket];

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await withPhase7(supabaseAdmin).rpc("hit_rate_limit", {
    _bucket: bucket,
    _identity: identity,
    _limit: cfg.limit,
    _window_seconds: cfg.windowSeconds,
  });

  if (error) {
    // تعذّر العدّ: يُسمح بالمرور. حاجز معطّل يمنع المستخدمين الشرعيين
    // بينما تبقى الإساءة ممكنة بطرق أخرى — فالفشل هنا إلى جانب الإتاحة.
    console.error("[rate-limit] تعذّر العدّ", error.message);
    return { allowed: true, hits: 0, limit: cfg.limit, resetAt: null };
  }

  const v = data as { allowed: boolean; hits: number; limit: number; reset_at: string };
  return { allowed: v.allowed, hits: v.hits, limit: v.limit, resetAt: v.reset_at };
}

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
