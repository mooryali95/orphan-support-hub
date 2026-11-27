import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Landmark, Loader2 } from "lucide-react";

import { SampleBadge } from "@/components/impact/SupportImpactParts";
import { Button } from "@/components/ui/button";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { useDemo } from "@/lib/demo-mode";
import { formatMoney } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { listMySponsorships } from "@/lib/sponsorships.functions";
import { trialRoute } from "@/lib/trial-gate";

const SUPPORT_EMAIL = "support@ioso.app";

const COPY = defineCopy("components/sponsorship/TransferInstructions", {
  ar: {
    loadError: "تعذّر تحميل كفالتك الآن. كفالتك محفوظة، فأعد المحاولة.",
    retry: "إعادة المحاولة",
    back: "العودة إلى كفالاتي",
    backTrial: "العودة إلى أثري",
    notFound: "لم نجد هذه الكفالة ضمن كفالاتك",
    details: "تفاصيل الكفالة",
    file: "الملفّ",
    amount: "المبلغ",
    monthly: "شهرياً",
    once: "لمرة واحدة",
    reference: "رقم المرجع",
    status: "الحالة",
    awaiting: "بانتظار تأكيد التحويل",
    awaitingTrial: "محاكاة: لا تحويل ولا تأكيد في التجربة",
    steps: "خطوات الإتمام",
    step1: (a: string) => `حوّل مبلغ ${a} إلى حساب المنصّة البنكي المعتمد.`,
    step2: (r: string) =>
      `اكتب رقم المرجع ${r} في خانة البيان أو الملاحظات، فبه تُربط دفعتك بكفالتك.`,
    step3: "أرسل صورة إشعار التحويل إلى بريد الدعم مع رقم المرجع:",
    step4: "تؤكّد الإدارة الاستلام، فتُفعَّل كفالتك ويصلك إشعار، وتبدأ تقارير الأثر.",
    bankNote:
      "بيانات الحساب البنكي تُرسل إليك مع رسالة التأكيد إن لم تكن قد استلمتها بعد. لأي استفسار تواصل معنا على البريد أعلاه.",
    trialNote:
      "هذه خطواتٌ محاكاة على كفالةٍ نموذجية. لا تحوّل أيّ مبلغ؛ التجربة لا تؤكّد تحويلاً ولا تفعّل كفالة.",
  },
  en: {
    loadError: "Could not load your sponsorship right now. It is saved, so try again.",
    retry: "Try again",
    back: "Back to my sponsorships",
    backTrial: "Back to my impact",
    notFound: "We did not find this sponsorship among yours",
    details: "Sponsorship details",
    file: "File",
    amount: "Amount",
    monthly: "monthly",
    once: "one time",
    reference: "Reference number",
    status: "Status",
    awaiting: "Awaiting transfer confirmation",
    awaitingTrial: "Simulated: no transfer and no confirmation in the trial",
    steps: "Steps to complete",
    step1: (a: string) => `Transfer ${a} to the platform's approved bank account.`,
    step2: (r: string) =>
      `Write the reference number ${r} in the transfer description, so your payment is matched to your sponsorship.`,
    step3:
      "Send a picture of the transfer notice to the support address with the reference number:",
    step4:
      "The administration confirms receipt, your sponsorship is activated, you are notified, and impact reports begin.",
    bankNote:
      "The bank account details are sent with your confirmation message if you have not received them yet. For any question, write to the address above.",
    trialNote:
      "These are simulated steps on a sample sponsorship. Do not transfer any money; the trial confirms no transfer and activates no sponsorship.",
  },
});

/**
 * تعليمات التحويل البنكي لكفالةٍ تنتظر الدفع. مزوّد الدفع اليدوي يحوّل الكافل إلى هنا.
 * في التجربة تُقرأ الكفالة النموذجية من منفذ البيانات، والمرجع يبدأ بـDEMO-، ولا يُسوّى شيء.
 */
export function TransferInstructions({ sponsorshipId }: { sponsorshipId: string }) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const demo = useDemo();
  const fetchList = useDataFn("sponsor.manage.list", listMySponsorships);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: useDataKey(["my-sponsorships"]),
    queryFn: () => fetchList(),
  });

  const sponsorship = (data?.sponsorships ?? []).find((s) => s.id === sponsorshipId);
  const short = sponsorshipId.slice(0, 8).toUpperCase();
  const reference = demo ? `DEMO-${short}` : short;
  const backTo = demo ? trialRoute("/try/impact") : "/dashboard";
  const backLabel = demo ? c.backTrial : c.back;

  if (isLoading) {
    return (
      <div role="status" className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }
  if (isError || data?.error) {
    return (
      <div
        role="alert"
        className="rounded-3xl border border-dashed border-border bg-card p-8 text-center sm:p-12"
      >
        <p className="font-medium">{c.loadError}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button className="min-h-11" onClick={() => void refetch()}>
            {c.retry}
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to={backTo}>{backLabel}</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (!sponsorship) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center sm:p-12">
        <p className="font-medium">{c.notFound}</p>
        <Button asChild className="mt-6 min-h-11">
          <Link to={backTo}>{backLabel}</Link>
        </Button>
      </div>
    );
  }

  const amount = formatMoney(sponsorship.amount, sponsorship.currency, locale);
  return (
    <div className="space-y-6">
      {demo && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-bridge/40 bg-bridge/8 p-3 text-sm leading-7">
          <SampleBadge />
          <span className="min-w-0 flex-1 basis-56">{c.trialNote}</span>
        </p>
      )}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <Landmark className="size-5 text-bridge-ink" aria-hidden="true" />
          <h2 className="font-bold">{c.details}</h2>
          {demo && <SampleBadge />}
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <Row label={c.file} value={sponsorship.orphan?.display_name ?? ""} />
          <Row
            label={c.amount}
            value={`${amount} ${sponsorship.type === "monthly" ? c.monthly : c.once}`}
          />
          <Row label={c.reference} value={reference} ltr />
          <Row label={c.status} value={demo ? c.awaitingTrial : c.awaiting} />
        </dl>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 text-sm leading-8">
        <h2 className="font-bold">{c.steps}</h2>
        <ol className="mt-3 list-decimal space-y-2 ps-5">
          <li>{c.step1(amount)}</li>
          <li>{c.step2(reference)}</li>
          <li>
            {c.step3}{" "}
            {demo ? (
              <bdi dir="ltr" className="font-mono">
                {SUPPORT_EMAIL}
              </bdi>
            ) : (
              <a className="text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>
                <bdi dir="ltr">{SUPPORT_EMAIL}</bdi>
              </a>
            )}
          </li>
          <li>{c.step4}</li>
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">{c.bankNote}</p>
      </div>

      <Button asChild variant="outline" className="min-h-11">
        <Link to={backTo}>{backLabel}</Link>
      </Button>
    </div>
  );
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{ltr ? <bdi dir="ltr">{value}</bdi> : value}</dd>
    </div>
  );
}
