import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { useState } from "react";

import { listMySponsorships } from "@/lib/sponsorships.functions";
import { defineCopy, useCopy } from "@/lib/locale";
import { isolate } from "@/lib/format";

const COPY = defineCopy("components/support/PendingPaymentBar", {
  ar: {
    one: (name: string) => `كفالة ${name} تنتظر إتمام الدفع لتبدأ.`,
    many: (n: number) => `${n} كفالات تنتظر إتمام الدفع لتبدأ.`,
    go: "أكمل الدفع",
    close: "إخفاء التذكير",
  },
  en: {
    one: (name: string) => `${name}'s sponsorship is waiting for payment to begin.`,
    many: (n: number) => `${n} sponsorships are waiting for payment to begin.`,
    go: "Complete payment",
    close: "Hide the reminder",
  },
});

/**
 * تذكيرٌ لطيف واحد: شريطٌ رفيع تحت الرأس حين تنتظر كفالةٌ الدفع، في كل صفحة عدا «أثري»
 * (حيث الدفع في أعلاها). يُخفى بنقرة لبقية الجلسة، ولا يعود بإلحاح.
 */
export function PendingPaymentBar() {
  const c = useCopy(COPY);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const fetchList = useServerFn(listMySponsorships);
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem("pending-bar") === "hidden";
    } catch {
      return false;
    }
  });
  const { data } = useQuery({
    queryKey: ["my-sponsorships"],
    queryFn: () => fetchList(),
    staleTime: 60_000,
  });
  const pending = (data?.sponsorships ?? []).filter((s) => s.status === "pending_payment");
  if (hidden || pending.length === 0 || path.startsWith("/dashboard")) return null;
  const first = pending[0]!.orphan?.display_name;
  return (
    <div role="status" className="border-b border-bridge/25 bg-bridge/8">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 text-sm">
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-bridge" />
        <p className="flex-1 leading-6 text-foreground">
          {pending.length === 1 && first ? c.one(isolate(first)) : c.many(pending.length)}
        </p>
        <Link
          to="/dashboard"
          className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground"
        >
          {c.go}
        </Link>
        <button
          type="button"
          aria-label={c.close}
          onClick={() => {
            setHidden(true);
            try {
              sessionStorage.setItem("pending-bar", "hidden");
            } catch {
              /* private mode: hidden for this page only */
            }
          }}
          className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
