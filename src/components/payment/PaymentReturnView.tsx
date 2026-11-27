import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Clock, Hourglass, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { SampleBadge } from "@/components/impact/SupportImpactParts";
import { Button } from "@/components/ui/button";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { formatMoney } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { getMyPaymentReturn } from "@/lib/payment-return.functions";
import { POLL_DELAYS_MS, type PaymentReturnState } from "@/lib/payment-return";

const COPY = defineCopy("components/payment/PaymentReturnView", {
  ar: {
    loading: "نقرأ حال دفعتك من سجلّنا…",
    loadError: "تعذّرت قراءة حال الدفعة. لم يُخصم شيءٌ بسبب هذه الصفحة.",
    retry: "أعد المحاولة",
    refresh: "حدّث الحال الآن",
    checking: "نتحقّق…",
    stopped: "ما زالت معلّقة. توقّفنا عن التحديث التلقائي؛ حدّثها متى شئت.",
    reference: "مرجع الدفعة",
    child: (n: string) => `الكفالة: ${n}`,
    simulated: "هذه عودةٌ محاكاة من بوابة دفعٍ تجريبية. لم يُدفع شيء.",
    states: {
      success: {
        title: "وصلت دفعتك",
        label: "تمّت",
        text: "سُجّلت الدفعة في سجلّنا، وتبدأ الكفالة من هذا الشهر.",
        next: "اذهب إلى كفالاتي",
      },
      pending: {
        title: "دفعتك قيد التأكيد",
        label: "قيد التأكيد",
        text: "وصلنا خبر البوابة ولم يصل تأكيدها بعد. يحدث هذا عادةً خلال دقائق، ونحدّث الحال هنا تلقائياً.",
        next: "اذهب إلى كفالاتي",
      },
      failed: {
        title: "لم تتمّ الدفعة",
        label: "لم تتمّ",
        text: "رفضت البوابة الدفعة أو أُلغيت. كفالتك محفوظة تنتظر الدفع، ولم يُخصم منك شيء.",
        next: "أكمل الدفع من كفالاتي",
      },
      expired: {
        title: "انتهت جلسة الدفع",
        label: "منتهية",
        text: "لم نجد دفعةً قائمة لهذه الكفالة، أو انتهت مهلتها. ابدأ الدفع من جديد إن أردت.",
        next: "ابدأ من كفالاتي",
      },
    } satisfies Record<PaymentReturnState, Record<string, string>>,
  },
  en: {
    loading: "Reading your payment status from our records…",
    loadError: "Could not read the payment status. Nothing was charged because of this page.",
    retry: "Try again",
    refresh: "Refresh status now",
    checking: "Checking…",
    stopped: "Still pending. Automatic refresh has stopped; refresh whenever you like.",
    reference: "Payment reference",
    child: (n: string) => `Sponsorship: ${n}`,
    simulated: "This is a simulated return from a sample payment gateway. Nothing was paid.",
    states: {
      success: {
        title: "Your payment arrived",
        label: "Completed",
        text: "The payment is recorded, and the sponsorship starts this month.",
        next: "Go to my sponsorships",
      },
      pending: {
        title: "Your payment is being confirmed",
        label: "Being confirmed",
        text: "The gateway sent you back but its confirmation has not reached us yet. This usually takes a few minutes, and the status here refreshes on its own.",
        next: "Go to my sponsorships",
      },
      failed: {
        title: "The payment did not go through",
        label: "Not completed",
        text: "The gateway declined or cancelled the payment. Your sponsorship is saved and waits for payment, and nothing was charged.",
        next: "Complete payment from my sponsorships",
      },
      expired: {
        title: "The payment session ended",
        label: "Ended",
        text: "We found no open payment for this sponsorship, or its time ran out. Start the payment again if you wish.",
        next: "Start again from my sponsorships",
      },
    } satisfies Record<PaymentReturnState, Record<string, string>>,
  },
});

const ICON: Record<PaymentReturnState, ReactNode> = {
  success: <CircleCheck className="size-6" aria-hidden="true" />,
  pending: <Clock className="size-6" aria-hidden="true" />,
  failed: <CircleAlert className="size-6" aria-hidden="true" />,
  expired: <Hourglass className="size-6" aria-hidden="true" />,
};

const TONE: Record<PaymentReturnState, string> = {
  success: "bg-primary/10 text-primary",
  pending: "bg-bridge/10 text-bridge-ink",
  failed: "bg-destructive/10 text-destructive",
  expired: "bg-secondary text-foreground",
};

/**
 * صفحة العودة من الدفع: الحال من الخادم لدفعة المتّصل نفسه، لا من الرابط. في التجربة
 * تأتي الحال من نسختها التجريبية عبر منفذ البيانات، وتحمل علامة «بيانات نموذجية».
 */
export function PaymentReturnView({
  sponsorshipId,
  nextTo,
  nextSearch,
  sample = false,
}: {
  sponsorshipId: string;
  /** وجهة الخطوة التالية: «كفالاتي» في المنصّة، و«أثري» في التجربة */
  nextTo: "/dashboard" | "/try/impact";
  nextSearch?: Record<string, string>;
  sample?: boolean;
}) {
  const t = useCopy(COPY);
  const locale = useLocale();
  const read = useDataFn("payments.return", getMyPaymentReturn);
  const [tries, setTries] = useState(0);
  const q = useQuery({
    queryKey: useDataKey(["payment-return", sponsorshipId]),
    queryFn: () => read({ data: { sponsorshipId } }),
    retry: 1,
    staleTime: 0,
  });

  const state = q.data?.state;
  // المعلّقة تُقرأ من جديد بفتراتٍ تتضاعف، ثم تتوقّف ويبقى زرّ التحديث.
  const exhausted = tries >= POLL_DELAYS_MS.length;
  useEffect(() => {
    if (state !== "pending" || exhausted || q.isFetching) return;
    const id = window.setTimeout(() => {
      setTries((n) => n + 1);
      void q.refetch();
    }, POLL_DELAYS_MS[tries]);
    return () => window.clearTimeout(id);
  }, [state, tries, exhausted, q]);

  // تغيّر الحال يركّز عنوانها، فيسمعه قارئ الشاشة ويراه المبصر في موضعه.
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef<PaymentReturnState | undefined>(undefined);
  useEffect(() => {
    if (state && shown.current && shown.current !== state) heading.current?.focus();
    shown.current = state;
  }, [state]);

  if (q.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {t.loading}
      </p>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <p className="leading-7">{t.loadError}</p>
        <Button variant="outline" className="mt-3 min-h-11" onClick={() => void q.refetch()}>
          {t.retry}
        </Button>
      </div>
    );
  }

  const s = t.states[q.data.state];
  const d = q.data;
  return (
    <section
      aria-labelledby="pay-return-h"
      className="rounded-3xl bg-card p-6 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] sm:p-8"
    >
      {sample && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SampleBadge />
          <p className="min-w-0 flex-1 basis-56 text-sm leading-6 text-muted-foreground">
            {t.simulated}
          </p>
        </div>
      )}
      <div aria-live="polite" aria-atomic="true">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${TONE[d.state]}`}
        >
          {ICON[d.state]}
          {s.label}
        </span>
        <h2
          id="pay-return-h"
          ref={heading}
          tabIndex={-1}
          className="mt-4 text-2xl leading-[1.3] font-bold outline-none md:text-3xl"
        >
          {s.title}
        </h2>
        <p className="mt-3 max-w-prose text-base leading-8 text-muted-foreground">{s.text}</p>
      </div>

      {(d.childName || d.reference || d.amount != null) && (
        <dl className="mt-5 space-y-1 text-sm">
          {d.childName && <dd className="font-semibold">{t.child(d.childName)}</dd>}
          {d.amount != null && d.currency && <dd>{formatMoney(d.amount, d.currency, locale)}</dd>}
          {d.reference && (
            <div className="flex flex-wrap gap-2">
              <dt className="text-muted-foreground">{t.reference}</dt>
              <dd>
                <bdi dir="ltr" className="font-mono">
                  {d.reference}
                </bdi>
              </dd>
            </div>
          )}
        </dl>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button asChild size="lg" className="min-h-12">
          <Link to={nextTo} search={(nextSearch ?? {}) as never}>
            {s.next}
          </Link>
        </Button>
        {d.state === "pending" && (
          <Button
            variant="outline"
            className="min-h-11"
            disabled={q.isFetching}
            onClick={() => {
              setTries(0);
              void q.refetch();
            }}
          >
            {q.isFetching ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-4" aria-hidden="true" />
            )}
            {q.isFetching ? t.checking : t.refresh}
          </Button>
        )}
      </div>
      {d.state === "pending" && exhausted && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {t.stopped}
        </p>
      )}
    </section>
  );
}
