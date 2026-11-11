import type { PaymentEvent, PaymentProvider } from "./types";

/**
 * معالجة webhook المزوّد — مفصولةٌ عن المسار لتُختبر بقاعدةٍ مزيّفة.
 *
 * ثلاثة عقود (APP-03 / ARC-03):
 *   1. كل كتابةٍ يُفحص خطؤها. supabase-js لا يرمي، فخطأٌ مُهمَل كان يُعلَّم
 *      «عولج» ويُرجع 200 فلا يعيد المزوّد الإرسال، وتضيع الدفعة.
 *   2. الحدث لا يُعلَّم معالَجاً إلا بعد نجاح تطبيقه؛ وإلا 500 فيعيد المزوّد.
 *   3. الإعادة بلا أثر: حدثٌ مسجَّل لم يُعالَج يُطبَّق من جديد، والمعالَج
 *      يُجاب بـ200. والقيد نفسه ذرّيّ في القاعدة (record_provider_charge)
 *      فتطبيقه مرّتين لا يقيّد دفعتين.
 */

type DbError = { message: string; code?: string } | null;
type DbResult<T = unknown> = { data: T | null; error: DbError };

/** ما تحتاجه المعالجة من عميل Supabase — بلا أنواع القاعدة المولَّدة. */
export type WebhookDb = {
  from(table: "payment_events"): {
    insert(row: Record<string, unknown>): {
      select(cols: string): { single(): PromiseLike<DbResult<{ id: string }>> };
    };
    select(cols: string): {
      eq(
        col: string,
        value: string,
      ): {
        eq(
          col: string,
          value: string,
        ): { maybeSingle(): PromiseLike<DbResult<{ id: string; processed_at: string | null }>> };
      };
    };
    update(row: Record<string, unknown>): { eq(col: string, value: string): PromiseLike<DbResult> };
  };
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<DbResult>;
};

export type WebhookResult = { status: number; body: string };

export class WebhookApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookApplyError";
  }
}

function must<T>(res: DbResult<T>, what: string): T | null {
  if (res.error) throw new WebhookApplyError(`${what}: ${res.error.message}`);
  return res.data;
}

export async function handlePaymentWebhook(
  raw: string,
  headers: Headers,
  provider: PaymentProvider,
  db: WebhookDb,
): Promise<WebhookResult> {
  if (!provider.verifyWebhook(raw, headers)) {
    console.warn("[payments] رُفض webhook: توقيع غير صالح");
    return { status: 401, body: "invalid signature" };
  }

  let event: PaymentEvent;
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
    event = provider.parseEvent(raw);
  } catch (error) {
    console.error("[payments] تعذّر تفسير الحدث", error);
    return { status: 400, body: "unparseable" };
  }
  if (!event.providerEventId) return { status: 400, body: "missing event id" };

  // التسجيل أولاً: القيد الفريد على (provider, provider_event_id) يكشف الإعادة.
  let eventRowId: string;
  const stored = await db
    .from("payment_events")
    .insert({
      provider: provider.id,
      provider_event_id: event.providerEventId,
      event_type: event.kind,
      sponsorship_id: event.sponsorshipId,
      payload,
      signature_verified: true,
    })
    .select("id")
    .single();

  if (stored.error) {
    if (stored.error.code !== "23505") {
      console.error("[payments] تعذّر تسجيل الحدث", stored.error.message);
      return { status: 500, body: "storage error" };
    }
    // سُجّل سابقاً: إن عولج فالإعادة بلا أثر؛ وإلا فمحاولةٌ سابقة فشلت ويُعاد تطبيقه.
    const prior = await db
      .from("payment_events")
      .select("id, processed_at")
      .eq("provider", provider.id)
      .eq("provider_event_id", event.providerEventId)
      .maybeSingle();
    if (prior.error || !prior.data) {
      console.error("[payments] تعذّر قراءة الحدث المسجَّل", prior.error?.message);
      return { status: 500, body: "storage error" };
    }
    if (prior.data.processed_at) return { status: 200, body: "already processed" };
    eventRowId = prior.data.id;
  } else if (stored.data) {
    eventRowId = stored.data.id;
  } else {
    return { status: 500, body: "storage error" };
  }

  try {
    await applyEvent(db, event, provider);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[payments] فشل تطبيق الحدث", message);
    const marked = await db
      .from("payment_events")
      .update({ error: message.slice(0, 1000) })
      .eq("id", eventRowId);
    if (marked.error) console.error("[payments] تعذّر تسجيل الخطأ", marked.error.message);
    // 500 يدفع المزوّد لإعادة المحاولة، والحدث مسجَّلٌ بخطئه للتدقيق.
    return { status: 500, body: "apply failed" };
  }

  const done = await db
    .from("payment_events")
    .update({ processed_at: new Date().toISOString(), error: null })
    .eq("id", eventRowId);
  if (done.error) {
    // التطبيق نجح والقيد ذرّيّ: الإعادة ستُجاب «replay». فـ500 آمنٌ هنا.
    console.error("[payments] تعذّر تعليم الحدث معالَجاً", done.error.message);
    return { status: 500, body: "storage error" };
  }
  return { status: 200, body: "ok" };
}

type ChargeOutcome = {
  outcome: "recorded" | "replay" | "refused";
  reason?: string;
  cancel_subscription?: string | null;
};

/** نتيجة إلغاء الاشتراك تُسجَّل؛ فشلها لا يُفشل الحدث (المجدول يعيد المحاولة). */
async function cancelNow(
  db: WebhookDb,
  provider: PaymentProvider,
  sponsorshipId: string,
  sub: string,
) {
  let ok = true;
  let message: string | null = null;
  try {
    await provider.cancelSubscription(sub, "immediate");
  } catch (error) {
    ok = false;
    message = error instanceof Error ? error.message : String(error);
    console.error("[payments] تعذّر إلغاء الاشتراك لدى المزوّد", message);
  }
  must(
    await db.rpc("mark_provider_cancel_result", {
      _sponsorship: sponsorshipId,
      _ok: ok,
      _error: message,
    }),
    "mark_provider_cancel_result",
  );
}

export async function applyEvent(db: WebhookDb, event: PaymentEvent, provider: PaymentProvider) {
  // حدثٌ معروف لا فعل له عندنا: سُجّل خاماً، وهذا كل المطلوب.
  if (event.kind === "unknown") return;
  if (!event.sponsorshipId) throw new WebhookApplyError("الحدث بلا مرجع كفالة");
  const id = event.sponsorshipId;

  switch (event.kind) {
    case "payment.succeeded":
    case "subscription.charged": {
      const result = must(
        await db.rpc("record_provider_charge", {
          _sponsorship: id,
          _provider: provider.id,
          _event_id: event.providerEventId,
          _payment_ref: event.providerPaymentId,
          _checkout_id: event.providerCheckoutId,
          _subscription_id: event.providerSubscriptionId,
          _amount: event.amount,
          _currency: event.currency,
          _paid_at: event.occurredAt,
        }),
        "record_provider_charge",
      ) as ChargeOutcome | null;
      // تحصيلٌ على كفالةٍ منتهية: لم يُقيَّد ورُفع للردّ؛ والاشتراك يُلغى الآن.
      if (result?.outcome === "refused" && result.cancel_subscription) {
        await cancelNow(db, provider, id, result.cancel_subscription);
      }
      return;
    }
    case "payment.failed": {
      must(
        await db.rpc("record_provider_failure", {
          _sponsorship: id,
          _provider: provider.id,
          _event_id: event.providerEventId,
          _payment_ref: event.providerPaymentId,
          _checkout_id: event.providerCheckoutId,
          _amount: event.amount,
          _currency: event.currency,
          _reason: event.failureReason,
        }),
        "record_provider_failure",
      );
      return;
    }
    case "payment.refunded":
    case "payment.disputed": {
      must(
        await db.rpc("mark_provider_payment", {
          _sponsorship: id,
          _provider: provider.id,
          _payment_ref: event.providerPaymentId,
          _checkout_id: event.providerCheckoutId,
          _status: event.kind === "payment.refunded" ? "refunded" : "disputed",
        }),
        "mark_provider_payment",
      );
      return;
    }
    case "subscription.cancelled":
    case "subscription.paused": {
      must(
        await db.rpc("record_provider_subscription_state", {
          _sponsorship: id,
          _state: event.kind === "subscription.cancelled" ? "cancelled" : "paused",
          _subscription_id: event.providerSubscriptionId,
        }),
        "record_provider_subscription_state",
      );
      return;
    }
    default:
      throw new WebhookApplyError(`نوع حدث غير معروف: ${event.kind as string}`);
  }
}
