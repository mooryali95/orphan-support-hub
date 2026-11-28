import { createFileRoute } from "@tanstack/react-router";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy } from "@/lib/locale";

/**
 * العودة من بوابة الدفع. الرابط لا يحمل إلا معرّف الكفالة مفتاحاً للقراءة؛ الحال نفسها
 * يقرؤها الخادم لدفعة المتّصل (`getMyPaymentReturn`). المكوّن في payment.return.lazy.tsx.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const RETURN_COPY = defineCopy("routes/payment.return", {
  ar: { title: "حال الدفعة" },
  en: { title: "Payment status" },
});

export const Route = createFileRoute("/_authenticated/payment/return")({
  validateSearch: (raw: Record<string, unknown>): { s?: string } =>
    typeof raw["s"] === "string" && UUID.test(raw["s"]) ? { s: raw["s"] } : {},
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(RETURN_COPY, l).title, false, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
});
