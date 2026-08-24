import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { withOutbox, type ClaimedEmail } from "@/integrations/supabase/types.extra";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { normalizeBase, unsubscribeUrl } from "@/lib/email-templates/links";

/**
 * مُصرِّف طابور البريد.
 *
 * الطابور يعيش في `notifications.email_state`، والإرسال هنا لا في
 * القاعدة: نداء HTTP داخل معاملة قاعدة بيانات يُبقي المعاملة مفتوحة
 * بطول الشبكة، ويجعل تراجعها بعد الإرسال كذبةً — الرسالة خرجت ولا
 * تعود.
 *
 * فالقاعدة تُطالِب وتَسِم، والخادم يُرسل بينهما.
 */

const MAX_ATTEMPTS = 5;

/** المهلة: ما مضى على حجزه أكثر منها يُعاد للطابور — إنقاذاً من مُصرِّف مات. */
const LEASE_SECONDS = 300;

function baseUrl(): string {
  return normalizeBase(process.env["PUBLIC_BASE_URL"] ?? "");
}

export type DrainSummary = {
  claimed: number;
  sent: number;
  suppressed: number;
  failed: number;
  /** لماذا لم يجرِ شيء، إن لم يجرِ. */
  halted: string | null;
};

export const drainEmailOutbox = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).default(25) }).parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<DrainSummary> => {
    const empty: DrainSummary = {
      claimed: 0,
      sent: 0,
      suppressed: 0,
      failed: 0,
      halted: null,
    };

    // بلا عنوان أساس لا يمكن بناء رابط الإلغاء، ورسالةٌ بلا رابط إلغاء
    // مخالفة. فالغياب يوقف الإرسال ولا يُرسل نصف رسالة.
    if (!baseUrl()) {
      return { ...empty, halted: "PUBLIC_BASE_URL غير مضبوط" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = withOutbox(supabaseAdmin);

    const { data: rows, error } = await db.rpc("claim_email_batch", {
      _limit: data.limit,
      _lease_seconds: LEASE_SECONDS,
      _max_attempts: MAX_ATTEMPTS,
    });
    if (error) return { ...empty, halted: error.message };

    const claimed = (rows ?? []) as ClaimedEmail[];
    if (claimed.length === 0) return empty;

    const sentIds: string[] = [];
    let suppressed = 0;
    let failed = 0;

    // بالتتابع لا بالتوازي: المزوّد يحدّ المعدّل، ودفعةٌ متوازية تصطدم
    // بالحدّ فتفشل كلها معاً بدل أن تمرّ واحدةً واحدة.
    for (const row of claimed) {
      try {
        const res = await sendTemplateEmail("notification", row.recipient, {
          // معرّف الإشعار مفتاحَ تفرّد: إعادة المحاولة بعد انقطاع لا
          // تُنتج رسالةً ثانية — التكرار يُطرح عند المزوّد.
          idempotencyKey: row.id,
          templateData: {
            siteName: "IOCO",
            siteUrl: baseUrl(),
            kind: row.kind,
            title: row.title,
            body: row.body ?? undefined,
            link: row.link ?? undefined,
            unsubscribeUrl: unsubscribeUrl(baseUrl(), row.unsubscribe_token),
          },
        });

        if (res.sent) {
          sentIds.push(row.id);
        } else {
          // مستلمٌ مرفوض عند المزوّد ليس فشلاً يُعاد: إعادته إهدار.
          await db.rpc("mark_email_suppressed", { _id: row.id });
          suppressed += 1;
        }
      } catch (err) {
        failed += 1;
        await db.rpc("mark_email_failed", {
          _id: row.id,
          _error: err instanceof Error ? err.message : String(err),
          _max_attempts: MAX_ATTEMPTS,
        });
      }
    }

    if (sentIds.length > 0) {
      await db.rpc("mark_email_sent", { _ids: sentIds });
    }

    return {
      claimed: claimed.length,
      sent: sentIds.length,
      suppressed,
      failed,
      halted: null,
    };
  });
