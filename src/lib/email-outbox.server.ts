import type { ClaimedEmail } from "@/integrations/supabase/types.extra";
import { normalizeBase, unsubscribeUrl } from "@/lib/email-templates/links";
import { localizeNotification } from "@/lib/notification-text";

/**
 * مُصرِّف طابور البريد — الطريق الوحيد لإرسال الإشعارات بريداً (ARC-02/APP-05).
 *
 * يناديه مساران: زرّ الإدارة (drainEmailOutbox) والمجدول
 * (/api/notifications/dispatch). وكلاهما يمرّ بالضمانات نفسها:
 *
 *   ١. claim_email_batch في القاعدة تكنس أوّلاً (sweep_email_outbox): ما ألغى
 *      صاحبه اشتراكه، أو كتم نوعه، أو حُجب بريد المنصّة كلّه — يخرج من
 *      الطابور **لحظة الإرسال** لا لحظة الإنشاء وحدها.
 *   ٢. المطالبة بـSKIP LOCKED ومهلة، فمُصرِّفان متوازيان لا يرسلان مرّتين.
 *   ٣. كلّ رسالةٍ تحمل رابط إلغاء الاشتراك، وبلا عنوان أصلٍ لا يُرسل شيء.
 *   ٤. بلا مفتاح إرسال يتوقّف قبل المطالبة، فلا تُستهلك محاولات.
 */

export const MAX_ATTEMPTS = 5;
/** ما مضى على حجزه أكثر منها يُعاد للطابور — إنقاذاً من مُصرِّف مات. */
export const LEASE_SECONDS = 300;

export type DrainSummary = {
  claimed: number;
  sent: number;
  suppressed: number;
  failed: number;
  /** لماذا لم يجرِ شيء، إن لم يجرِ. */
  halted: "base_url_missing" | "email_unconfigured" | "claim_failed" | null;
};

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

export type OutboxDeps = {
  rpc: Rpc;
  /** يرسل قالب «notification»؛ sent:false = مستلمٌ مرفوض عند المزوّد. */
  send: (
    to: string,
    templateData: Record<string, unknown>,
    idempotencyKey: string,
  ) => Promise<{ sent: boolean }>;
  baseUrl: string | null;
  configured: boolean;
  siteName: string;
  onError?: (event: string, error: unknown) => void;
};

const EMPTY: DrainSummary = { claimed: 0, sent: 0, suppressed: 0, failed: 0, halted: null };

export async function drainOutbox(deps: OutboxDeps, limit = 25): Promise<DrainSummary> {
  const base = deps.baseUrl ? normalizeBase(deps.baseUrl) : "";
  // رسالةٌ بلا رابط إلغاء مخالفة، فالغياب يوقف الإرسال ولا يُرسل نصف رسالة.
  if (!base) return { ...EMPTY, halted: "base_url_missing" };
  if (!deps.configured) return { ...EMPTY, halted: "email_unconfigured" };

  const { data: rows, error } = await deps.rpc("claim_email_batch", {
    _limit: limit,
    _lease_seconds: LEASE_SECONDS,
    _max_attempts: MAX_ATTEMPTS,
  });
  if (error) {
    deps.onError?.("email.claim_failed", error);
    return { ...EMPTY, halted: "claim_failed" };
  }

  const claimed = (rows ?? []) as ClaimedEmail[];
  const sentIds: string[] = [];
  let suppressed = 0;
  let failed = 0;

  // بالتتابع لا بالتوازي: المزوّد يحدّ المعدّل، ودفعةٌ متوازية تصطدم
  // بالحدّ فتفشل كلها معاً بدل أن تمرّ واحدةً واحدة.
  for (const claimedRow of claimed) {
    // المحتوى بلغة المستلم كالغلاف: القاعدة تكتبه بالعربية، فيُعرض للإنجليزي نصّ نوعه بلغته.
    const row = localizeNotification(claimedRow, claimedRow.locale ?? "ar");
    try {
      const res = await deps.send(
        row.recipient,
        {
          siteName: deps.siteName,
          siteUrl: base,
          kind: row.kind,
          title: row.title,
          body: row.body ?? undefined,
          link: row.link ?? undefined,
          unsubscribeUrl: unsubscribeUrl(base, row.unsubscribe_token),
          // لغة المستلم: الغلاف والزرّ بلغته (NotificationEmail).
          locale: row.locale ?? "ar",
        },
        // معرّف الإشعار مفتاحَ تفرّد: إعادة المحاولة بعد انقطاع لا تُنتج
        // رسالةً ثانية — التكرار يُطرح عند المزوّد.
        row.id,
      );
      if (res.sent) {
        sentIds.push(row.id);
      } else {
        // مستلمٌ مرفوض عند المزوّد ليس فشلاً يُعاد: إعادته إهدار.
        await deps.rpc("mark_email_suppressed", { _id: row.id });
        suppressed += 1;
      }
    } catch (err) {
      failed += 1;
      deps.onError?.("email.send_failed", err);
      await deps.rpc("mark_email_failed", {
        _id: row.id,
        _error: err instanceof Error ? err.message : String(err),
        _max_attempts: MAX_ATTEMPTS,
      });
    }
  }

  if (sentIds.length > 0) await deps.rpc("mark_email_sent", { _ids: sentIds });

  return { claimed: claimed.length, sent: sentIds.length, suppressed, failed, halted: null };
}

/** الاعتماديات الحقيقية: مفتاح الخدمة، وقالب Lovable، والإعداد الموحّد. */
export async function liveOutboxDeps(): Promise<OutboxDeps> {
  const [{ supabaseAdmin }, { sendTemplateEmail }, env, { BRAND }, log] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/lib/email-templates/send-email"),
    import("@/lib/env.server"),
    import("@/config/brand"),
    import("@/lib/server-log"),
  ]);
  const client = supabaseAdmin as unknown as { rpc: Rpc };
  return {
    rpc: (fn, args) => client.rpc(fn, args),
    send: (to, templateData, idempotencyKey) =>
      sendTemplateEmail("notification", to, { templateData, idempotencyKey }),
    baseUrl: env.appBaseUrl(),
    configured: Boolean(env.serverConfig().env.LOVABLE_API_KEY),
    siteName: BRAND.name,
    onError: (event, error) => void log.logServerError(event, error),
  };
}
