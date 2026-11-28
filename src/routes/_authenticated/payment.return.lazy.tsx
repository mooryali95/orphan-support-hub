import { createLazyFileRoute } from "@tanstack/react-router";

import { DashboardShell } from "@/components/DashboardShell";
import { PaymentReturnView } from "@/components/payment/PaymentReturnView";
import { useCopy } from "@/lib/locale";
import { RETURN_COPY } from "./payment.return";

export const Route = createLazyFileRoute("/_authenticated/payment/return")({
  component: PaymentReturnPage,
});

/** معرّفٌ لا يطابق كفالةً قط: رابطٌ بلا معرّف صالح يعرض «منتهية» من الخادم كغيره. */
const NONE = "00000000-0000-0000-0000-000000000000";

function PaymentReturnPage() {
  const { s } = Route.useSearch();
  const t = useCopy(RETURN_COPY);
  return (
    <DashboardShell title={t.title}>
      <div className="max-w-2xl">
        <PaymentReturnView sponsorshipId={s ?? NONE} nextTo="/dashboard" />
      </div>
    </DashboardShell>
  );
}
