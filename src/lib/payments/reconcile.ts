import type { CancelMode, PaymentProvider } from "./types";

/**
 * المطابقة الدورية للمال — يشغّلها المجدول عبر /api/payments/reconcile،
 * ويشغّل الإلغاءَ لدى المزوّد منها أيضاً مسارُ إلغاء الكافل فوراً.
 *
 *   • الإلغاء المجدول عند موعده، والإيقاف المؤقّت عند انقضائه (القاعدة).
 *   • الإشعار الثاني بعد خروج الطفل (GAP-05).
 *   • جلسات الدفع الإلكتروني المهجورة تنقضي ويتحرّر مفتاحها (APP-07).
 *   • ما ينتظر إلغاءً لدى المزوّد يُلغى، وتُسجَّل نتيجته؛ والفاشل يُعاد في
 *     الدورة التالية، وبعد ثلاث محاولات يصير بنداً في صندوق القرارات.
 */

type DbResult = { data: unknown; error: { message: string } | null };
export type ReconcileDb = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<DbResult>;
};

type DueCancellation = {
  sponsorship_id: string;
  provider: string | null;
  provider_subscription_id: string;
  mode: CancelMode;
};

async function call(db: ReconcileDb, fn: string, args?: Record<string, unknown>) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

export async function processProviderCancellations(
  db: ReconcileDb,
  provider: PaymentProvider,
  onlySponsorship?: string,
) {
  const due = ((await call(db, "provider_cancellations_due", { _limit: 100 })) ??
    []) as DueCancellation[];
  let done = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of due) {
    if (onlySponsorship && row.sponsorship_id !== onlySponsorship) continue;
    // اشتراكٌ لدى مزوّدٍ غير المضبوط الآن لا يُلغى بمفتاحٍ آخر: يبقى منتظراً.
    if (row.provider && row.provider !== provider.id) {
      skipped += 1;
      continue;
    }
    let ok = true;
    let message: string | null = null;
    try {
      await provider.cancelSubscription(row.provider_subscription_id, row.mode);
    } catch (error) {
      ok = false;
      message = error instanceof Error ? error.message : String(error);
    }
    await call(db, "mark_provider_cancel_result", {
      _sponsorship: row.sponsorship_id,
      _ok: ok,
      _error: message,
    });
    if (ok) done += 1;
    else failed += 1;
  }
  return { done, failed, skipped };
}

export async function runMoneyReconcile(db: ReconcileDb, provider: PaymentProvider) {
  const transitions = (await call(db, "apply_due_sponsorship_transitions")) as {
    cancelled: number;
    resumed: number;
  };
  const followups = Number(await call(db, "send_due_exit_followups"));
  const expired = Number(await call(db, "expire_stale_checkouts", { _older_than: "24 hours" }));
  const cancellations = await processProviderCancellations(db, provider);
  return { transitions, followups, expired, cancellations };
}
