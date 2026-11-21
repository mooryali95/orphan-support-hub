import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rpcFailure } from "@/lib/admin-overview";
import type { InboxKind } from "@/lib/inbox.functions";

/**
 * مصادر لوحة الإدارة التي ليست في دوالّ الإدارة القائمة.
 *
 * الدالّتان تُستدعيان بجلسة المستخدم نفسه — لا مفتاح خدمة — والقاعدة هي التي
 * ترفض غير الإدارة (`is_admin` داخل كلّ دالّة). الأنواع المولَّدة لا تعرف
 * `admin_support_summary` بعد (هجرتها لم تُطبَّق)، فتُستدعى عبر هذا الغلاف
 * الضيّق: اسمان لا غير، بمعاملاتهما.
 */
type RpcError = { code?: string | null; message?: string | null };
type RpcResult = PromiseLike<{ data: unknown; error: RpcError | null }>;
type OverviewRpc = {
  rpc(fn: "admin_support_summary", args: { _months: number }): RpcResult;
  rpc(fn: "admin_decision_inbox"): RpcResult;
};
const db = (client: unknown) => client as OverviewRpc;

/**
 * مجاميع الدعم من `admin_support_summary`. أربع نتائج لا تختلط:
 * `ready` بالمجاميع · `absent` الدالّة لم تُنشأ في هذه القاعدة بعد (اللوحة تعود
 * إلى سلوكها بلا المجاميع) · `denied` ليس مديراً · `failed` عطل.
 * الناتج نصٌّ JSON يُضبط شكله في `parseSupportSummary`.
 */
export const getSupportSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ months: z.number().int().min(1).max(24).default(12) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: summary, error } = await db(context.supabase).rpc("admin_support_summary", {
      _months: data.months,
    });
    if (error) return { state: rpcFailure(error) };
    return { state: "ready" as const, json: JSON.stringify(summary ?? null) };
  });

/**
 * طوابير القرار للّوحة: النوع والتاريخ وحدهما (لا عنوان ولا اسم يغادر الخادم)،
 * والخطأ يعود خطأً — `getDecisionInbox` تعيد قائمةً فارغة عند العطل، فلا يُفرَّق
 * هناك بين «لا شيء ينتظر» و«تعذّرت القراءة».
 */
export const getOverviewInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await db(context.supabase).rpc("admin_decision_inbox");
    if (error || (data != null && !Array.isArray(data))) return { ok: false as const };
    const rows = (data ?? []) as Array<{ kind?: unknown; created_at?: unknown }>;
    return {
      ok: true as const,
      items: rows.map((r) => ({
        kind: String(r.kind ?? "") as InboxKind,
        created_at: typeof r.created_at === "string" ? r.created_at : "",
      })),
    };
  });
