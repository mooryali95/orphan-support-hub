import { createFileRoute } from "@tanstack/react-router";

import type { PaymentsClient } from "@/integrations/supabase/types.extra";
import type { PaymentEvent } from "@/lib/payments/types";

/**
 * webhook المزوّد — المسار الوحيد الذي يُفعّل كفالة.
 *
 * العميل لا يستطيع كتابة سجلّ المدفوعات ولا تفعيل عقد (إصلاحا C2 و C3)،
 * فالتفعيل يمرّ من هنا حصراً عبر service_role.
 *
 * ثلاثة شروط لا يُتنازل عنها:
 *   1. التحقّق من التوقيع قبل أي قراءة للحمولة — حمولة غير موثّقة لا تُفسَّر.
 *   2. منع تكرار المعالجة: البوابات تُعيد الإرسال عند أي شكّ في التسليم،
 *      وقيد التفرّد على (provider, provider_event_id) يجعل ذلك بلا أثر.
 *   3. تسجيل كل حدث خاماً قبل تطبيقه، فيبقى أثر للتدقيق حتى عند الفشل.
 */

export const Route = createFileRoute("/api/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { paymentProvider } = await import("@/lib/payments");
        const provider = paymentProvider();

        // النصّ الخام مطلوب كما وصل: أي إعادة تسلسل تُبطل التوقيع.
        const raw = await request.text();

        if (!provider.verifyWebhook(raw, request.headers)) {
          console.warn("[payments] رُفض webhook: توقيع غير صالح");
          return new Response("invalid signature", { status: 401 });
        }

        let event;
        try {
          event = provider.parseEvent(raw);
        } catch (error) {
          console.error("[payments] تعذّر تفسير الحدث", error);
          return new Response("unparseable", { status: 400 });
        }

        if (!event.providerEventId) {
          return new Response("missing event id", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { withPayments } = await import("@/integrations/supabase/types.extra");
        // الجداول الجديدة موجودة في القاعدة وينقصها التوليد لا الوجود.
        const db = withPayments(supabaseAdmin);

        // التسجيل أولاً: القيد الفريد يجعل إعادة الإرسال بلا أثر.
        const { data: stored, error: storeError } = await db
          .from("payment_events")
          .insert({
            provider: provider.id,
            provider_event_id: event.providerEventId,
            event_type: event.kind,
            sponsorship_id: event.sponsorshipId,
            payload: JSON.parse(raw),
            signature_verified: true,
          })
          .select("id")
          .single();

        if (storeError) {
          // 23505 = تعارض تفرّد: حدث عولج سابقاً. النجاح هنا يوقف إعادة الإرسال.
          if (storeError.code === "23505") {
            return new Response("already processed", { status: 200 });
          }
          console.error("[payments] تعذّر تسجيل الحدث", storeError);
          return new Response("storage error", { status: 500 });
        }

        try {
          await applyEvent(db, event, provider.id);
          await db
            .from("payment_events")
            .update({ processed_at: new Date().toISOString() })
            .eq("id", stored.id);
          return new Response("ok", { status: 200 });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[payments] فشل تطبيق الحدث", message);
          await db.from("payment_events").update({ error: message }).eq("id", stored.id);
          // 500 يدفع المزوّد لإعادة المحاولة، والحدث مسجَّل بخطئه للتدقيق.
          return new Response("apply failed", { status: 500 });
        }
      },
    },
  },
});

/**
 * إعلان الدفعة للكافل.
 *
 * فشل الإعلان لا يُسقط تسجيل الدفعة: المال وصل فعلاً، وإرجاع 500 هنا
 * يجعل المزوّد يُعيد إرسال الحدث ويُعالَج مرّتين. فيُسجَّل الخطأ ويمضي.
 */
async function announce(
  supabase: PaymentsClient,
  sponsorshipId: string,
  succeeded: boolean,
  amount: number,
  currency: string,
) {
  const { withPhase4 } = await import("@/integrations/supabase/types.extra");
  const { error } = await withPhase4(supabase).rpc("announce_payment", {
    _sponsorship: sponsorshipId,
    _succeeded: succeeded,
    _amount: amount,
    _currency: currency,
  });
  if (error) console.error("[payments] تعذّر إشعار الكافل", error.message);
}

/**
 * الردّ والمنازعة يُطابَقان بمعاملة المزوّد أولاً (الدقيق)، ثم بالمرجع
 * القديم لما سُجّل قبل حفظ المعاملة. الحالة وحدها تتغيّر؛ حقائق الفاتورة
 * مجمّدة في القاعدة.
 */
async function markPayment(
  supabase: PaymentsClient,
  sponsorshipId: string,
  event: PaymentEvent,
  status: "refunded" | "disputed",
) {
  if (event.providerPaymentId) {
    const { data } = await supabase
      .from("sponsorship_payments")
      .update({ status })
      .eq("sponsorship_id", sponsorshipId)
      .eq("provider_payment_id", event.providerPaymentId)
      .select("id");
    if (data && data.length > 0) return;
  }
  await supabase
    .from("sponsorship_payments")
    .update({ status })
    .eq("sponsorship_id", sponsorshipId)
    .eq("provider_ref", event.providerCheckoutId ?? "");
}

async function applyEvent(supabase: PaymentsClient, event: PaymentEvent, providerId: string) {
  // حدث معروف للمزوّد لا فعل له عندنا: سُجّل خاماً قبل الوصول إلى هنا،
  // وهذا كل المطلوب. رفضه كان يعني إعادة إرسال لا تنتهي — والمزوّد
  // يرسل ثلاثة عشر نوعاً أكثرها وصفٌ لدورة حياة الاشتراك لا مال.
  if (event.kind === "unknown") return;

  if (!event.sponsorshipId) {
    throw new Error("الحدث بلا مرجع كفالة");
  }

  const { data: sponsorship, error } = await supabase
    .from("sponsorships")
    .select("id, sponsor_id, amount, currency, status")
    .eq("id", event.sponsorshipId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!sponsorship) throw new Error(`لا كفالة بالمعرّف ${event.sponsorshipId}`);

  const now = new Date().toISOString();
  const paidAt = event.occurredAt ?? now;

  switch (event.kind) {
    case "payment.succeeded":
    case "subscription.charged": {
      const { data: settings } = await supabase
        .from("platform_settings")
        .select("fee_percent")
        .maybeSingle();

      const amount = event.amount ?? Number(sponsorship.amount);
      const fee = Math.round(amount * (Number(settings?.fee_percent ?? 0) / 100) * 100) / 100;

      await supabase.from("sponsorship_payments").insert({
        sponsorship_id: sponsorship.id,
        sponsor_id: sponsorship.sponsor_id,
        amount,
        currency: event.currency ?? sponsorship.currency,
        status: "paid",
        provider: providerId,
        provider_ref: event.providerCheckoutId,
        provider_checkout_id: event.providerCheckoutId,
        // المعاملة الحقيقية لدى المزوّد: تُربط بها الفاتورة (تُصدرها القاعدة
        // عند «مدفوع»)، وفهرسٌ فريد يمنع معاملةً واحدة من فاتورتين.
        provider_payment_id: event.providerPaymentId ?? event.providerCheckoutId,
        provider_event_id: event.providerEventId,
        fee_amount: fee,
        net_amount: amount - fee,
        paid_at: paidAt,
      });

      // التفعيل هنا فقط. المُشغِّل يُعيد احتساب funded_monthly تلقائياً.
      // started_at يُضبط عند أول دفعة ولا يُلمس في التجديدات.
      await supabase
        .from("sponsorships")
        .update({
          status: "active",
          provider: providerId,
          provider_subscription_id: event.providerSubscriptionId,
          ...(sponsorship.status === "active" ? {} : { started_at: paidAt }),
        })
        .eq("id", sponsorship.id);

      // الكافل يُخبَر بأن ماله وصل. بعد تسجيل الدفعة لا قبله، لأن
      // الدالة تُفرّق بين البداية والتجديد بعدّ الدفعات المدفوعة.
      await announce(
        supabase,
        sponsorship.id,
        true,
        amount,
        event.currency ?? sponsorship.currency,
      );
      return;
    }

    case "payment.failed": {
      await supabase.from("sponsorship_payments").insert({
        sponsorship_id: sponsorship.id,
        sponsor_id: sponsorship.sponsor_id,
        amount: event.amount ?? Number(sponsorship.amount),
        currency: event.currency ?? sponsorship.currency,
        status: "failed",
        provider: providerId,
        provider_ref: event.providerCheckoutId,
        provider_payment_id: event.providerPaymentId,
        provider_event_id: event.providerEventId,
        failure_reason: event.failureReason,
      });
      // الكفالة لا تُلغى عند فشل دفعة واحدة؛ المزوّد يعيد المحاولة.
      await announce(
        supabase,
        sponsorship.id,
        false,
        event.amount ?? Number(sponsorship.amount),
        event.currency ?? sponsorship.currency,
      );
      return;
    }

    case "payment.refunded": {
      await markPayment(supabase, sponsorship.id, event, "refunded");
      return;
    }

    case "subscription.paused": {
      await supabase.from("sponsorships").update({ status: "paused" }).eq("id", sponsorship.id);
      return;
    }

    // المنازعة مال مسحوب فعلاً وبلاغ احتيال محتمل. لا تُلغى الكفالة
    // تلقائياً — القرار إداري — لكن الدفعة تُوسم فتظهر في لوحة الإدارة.
    case "payment.disputed": {
      await markPayment(supabase, sponsorship.id, event, "disputed");
      return;
    }

    case "subscription.cancelled": {
      await supabase
        .from("sponsorships")
        .update({ status: "cancelled", ended_at: now })
        .eq("id", sponsorship.id);
      return;
    }

    default:
      throw new Error(`نوع حدث غير معروف: ${event.kind}`);
  }
}
