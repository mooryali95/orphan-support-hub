import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderMonthlyDigest, type MonthlyDigest } from "@/lib/email/templates";
import { isSponsorVisible } from "@/lib/event-labels";

/**
 * «رحلتي» ورسالة الشهر.
 *
 * الخطّ الزمني يُجمع في القاعدة (my_journey_feed) لأن كل مصدرٍ فيه محكومٌ
 * بنطاقه؛ جمعه هنا كان يعني قراءة ما لا يحقّ ثم إخفاءه.
 */

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
const rpc = (client: unknown) => client as RpcClient;

export type FeedItem = {
  kind: "timeline" | "pledge" | "unit" | "trait";
  type: string;
  at: string;
  orphan: string | null;
  orphan_id: string | null;
  text: string | null;
};

export const getMyJourneyFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await rpc(context.supabase).rpc("my_journey_feed", { _limit: 40 });
    if (error) return [] as FeedItem[];
    // ما هو عملٌ داخلي (رفع تقريرٍ لم يُراجَع، إعادةٌ للتصحيح) لا يصل الكافل.
    return ((data ?? []) as FeedItem[]).filter((f) => isSponsorVisible(f.type));
  });

/** معاينة رسالة الشهر كما ستصل — الإرسال معلّقٌ حتى يُرفع تعليق البريد. */
export const previewMonthlyDigest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await rpc(context.supabase).rpc("my_monthly_digest");
    if (error) return { ok: false as const, html: null, subject: null };
    const base = process.env["PUBLIC_BASE_URL"] ?? "";
    const mail = renderMonthlyDigest("", data as MonthlyDigest, base);
    return { ok: true as const, html: mail.html, subject: mail.subject };
  });
