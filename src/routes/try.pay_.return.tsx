import { createFileRoute } from "@tanstack/react-router";

import { PaymentReturnView } from "@/components/payment/PaymentReturnView";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";
import { registerPaymentReturnDemo } from "@/lib/try-payment-return";
import { trialRoute } from "@/lib/trial-gate";

// صريحٌ لا استيرادٌ مجرّد: الحزمة معلنة بلا آثار جانبية.
registerPaymentReturnDemo();

const COPY = defineCopy("routes/try.pay.return", {
  ar: { pageTitle: "حال الدفعة · جرّب المنصّة", title: "حال الدفعة" },
  en: { pageTitle: "Payment status · Try the platform", title: "Payment status" },
});

export const Route = createFileRoute("/try/pay_/return")({
  validateSearch: (raw: Record<string, unknown>): { child: string } => ({
    child: typeof raw["child"] === "string" ? raw["child"].slice(0, 40) : "",
  }),
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return { meta: [{ title: pageTitle(copyOf(COPY, l).pageTitle, false, l) }] };
  },
  component: TryPaymentReturn,
});

function TryPaymentReturn() {
  const { child } = Route.useSearch();
  const c = useCopy(COPY);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-3xl leading-[1.3] font-bold md:text-4xl">{c.title}</h1>
      <PaymentReturnView
        sponsorshipId={child}
        nextTo={trialRoute("/try/impact")}
        nextSearch={{ done: child }}
        sample
      />
    </div>
  );
}
