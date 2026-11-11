import { createFileRoute } from "@tanstack/react-router";

/**
 * webhook المزوّد — المسار الوحيد الذي يُفعّل كفالةً بدفعٍ إلكتروني.
 *
 * العميل لا يستطيع كتابة سجلّ المدفوعات ولا تفعيل عقد (إصلاحا C2 و C3)،
 * فالتفعيل يمرّ من هنا حصراً عبر service_role، وفي القاعدة بدالّةٍ ذرّية
 * (record_provider_charge) لا بكتاباتٍ متفرّقة.
 *
 * المعالجة كلّها في `@/lib/payments/webhook-handler` (مختبَرة): التوقيع
 * قبل أي قراءة، وتسجيل الحدث خاماً، وفحص كل كتابة، و500 عند أي فشل كي
 * يعيد المزوّد — والإعادة بلا أثر.
 */
export const Route = createFileRoute("/api/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { paymentProvider } = await import("@/lib/payments");
        const { handlePaymentWebhook } = await import("@/lib/payments/webhook-handler");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        type Db = Parameters<typeof handlePaymentWebhook>[3];

        // النصّ الخام مطلوب كما وصل: أي إعادة تسلسل تُبطل التوقيع.
        const raw = await request.text();
        const result = await handlePaymentWebhook(
          raw,
          request.headers,
          paymentProvider(),
          supabaseAdmin as unknown as Db,
        );
        return new Response(result.body, { status: result.status });
      },
    },
  },
});
