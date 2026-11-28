import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Loader2, Printer } from "lucide-react";

import { KahataynMark } from "@/components/brand/KahataynMark";
import { SampleBadge } from "@/components/impact/SupportImpactParts";
import { Name } from "@/components/kit/Name";
import { useLedger } from "@/components/sponsorship/ledger-query";
import { Button } from "@/components/ui/button";
import { brandFor } from "@/config/brand";
import { useDemo } from "@/lib/demo-mode";
import { formatDate, formatMoney } from "@/lib/format";
import { monthState } from "@/lib/ledger.functions";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { trialRoute } from "@/lib/trial-gate";

const COPY = defineCopy("components/sponsorship/SponsorshipReport", {
  ar: {
    loadError: "تعذّر تحميل الكفالة.",
    dashboard: "لوحتي",
    back: "العودة إلى الكفالة",
    year: "السنة",
    print: "طباعة أو حفظ PDF",
    title: (y: string) => `تقرير الكفالة لعام ${y}`,
    sponsorshipOf: "كفالة",
    file: "ملفّ",
    monthly: (m: string) => `${m} شهرياً`,
    paidYear: "المدفوع في السنة",
    paidMonths: "أشهرٌ مدفوعة",
    delivered: "أشهرٌ وصلت موثّقة",
    month: "الشهر",
    paid: "المدفوع",
    status: "الحالة",
    receipt: "الإيصال",
    none: "لا أشهر في هذه السنة.",
    notPaid: "لم يُدفع",
    noReceipt: "لا إيصال",
    issued: (d: string) => `صدر في ${d}.`,
    footer:
      "«الوصول الموثّق» يعني أن الجهة الميدانية سجّلت التسليم ورفعت مستند استلامه؛ المستند محفوظ في المنصّة ولا يمرّ بمراجعةٍ مستقلّة قبل وسمه. ولكل شهرٍ إيصالٌ يُحسب من حقائقه: احفظ هذا التقرير، وتحقّق من أيّ إيصالٍ فيه لاحقاً من صفحة الكفالة. إن تغيّرت حقيقةٌ تغيّر رقمها.",
    watermark: "نموذجٌ محاكى للتجربة، وليس مستنداً رسمياً.",
  },
  en: {
    loadError: "Could not load the sponsorship.",
    dashboard: "My dashboard",
    back: "Back to the sponsorship",
    year: "Year",
    print: "Print or save as PDF",
    title: (y: string) => `Sponsorship report for ${y}`,
    sponsorshipOf: "Sponsorship of",
    file: "file",
    monthly: (m: string) => `${m} a month`,
    paidYear: "Paid this year",
    paidMonths: "Months paid",
    delivered: "Months delivered with proof",
    month: "Month",
    paid: "Paid",
    status: "Status",
    receipt: "Receipt",
    none: "No months in this year.",
    notPaid: "Not paid",
    noReceipt: "No receipt",
    issued: (d: string) => `Issued on ${d}.`,
    footer:
      "“Delivered with proof” means the field organization recorded the handover and uploaded its receipt document; the document is kept on the platform and is not independently reviewed before it is marked. Each month has a receipt computed from its facts: keep this report, and check any receipt in it later from the sponsorship page. If a fact changes, its number changes.",
    watermark: "A simulated sample for the trial, not an official document.",
  },
});

/**
 * تقرير الكفالة السنوي للطباعة أو الحفظ من المتصفّح. لا يحمل إلا ما في سجلّ الكفالة: الاسم
 * المعروض والأشهر وحالاتها. في التجربة يحمل علامة «بيانات نموذجية» وعلامةً مائية.
 */
export function SponsorshipReport({ sponsorshipId }: { sponsorshipId: string }) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const brand = brandFor(locale);
  const demo = useDemo();
  const { data, isPending } = useLedger(sponsorshipId);
  const thisYear = String(new Date().getFullYear());
  const [year, setYear] = useState(thisYear);
  const backLink = demo
    ? { to: trialRoute(`/try/sponsorships/${encodeURIComponent(sponsorshipId)}`) }
    : { to: "/sponsorships/$sponsorshipId" as const, params: { sponsorshipId } };

  if (isPending) {
    return (
      <div role="status" className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }
  const l = data?.ledger;
  if (!l) {
    return (
      <div role="alert">
        <h1 className="p-10 text-center text-sm font-normal">
          {c.loadError}{" "}
          <Link to={demo ? trialRoute("/try/impact") : "/dashboard"} className="underline">
            {c.dashboard}
          </Link>
        </h1>
      </div>
    );
  }
  const years = Array.from(new Set(l.months.map((m) => m.month.slice(0, 4))))
    .sort()
    .reverse();
  const months = l.months.filter((m) => m.month.startsWith(year) && !m.upcoming).reverse();
  const paid = months.reduce((a, m) => a + Number(m.paid), 0);
  const delivered = months.filter((m) => m.delivery_status === "delivered").length;
  const cur = l.sponsorship.currency;

  return (
    <div className="print-doc relative mx-auto max-w-3xl bg-background px-4 py-10 sm:px-6 print:max-w-none print:p-0">
      {demo && (
        <div className="print-watermark" aria-hidden="true">
          <span>{c.watermark}</span>
        </div>
      )}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link {...backLink} className="inline-flex min-h-11 items-center gap-1 text-sm underline">
          <ArrowRight className="size-4 ltr:-scale-x-100" aria-hidden="true" />
          {c.back}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={c.year}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="h-11 rounded-md border border-input bg-background px-3 text-sm"
          >
            {(years.length ? years : [thisYear]).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <Button className="min-h-11" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden="true" /> {c.print}
          </Button>
        </div>
      </div>

      {demo && (
        <p className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-bridge/40 bg-bridge/8 p-3 text-sm font-bold print:border-2">
          <SampleBadge />
          {c.watermark}
        </p>
      )}

      <header className="flex items-center justify-between gap-4 border-b-2 border-primary pb-4">
        <div className="min-w-0">
          <p className="font-serif text-2xl font-bold text-primary">{brand.name}</p>
          <p className="text-xs text-bridge-ink">{brand.tagline}</p>
        </div>
        <KahataynMark className="h-14 w-auto shrink-0" />
      </header>

      <h1 className="mt-8 text-2xl font-extrabold">{c.title(year)}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {c.sponsorshipOf} <Name>{l.orphan.display_name}</Name> · {c.file}{" "}
        <Name>{l.orphan.code}</Name> · {c.monthly(formatMoney(l.sponsorship.amount, cur, locale))}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          [c.paidYear, formatMoney(paid, cur, locale)],
          [c.paidMonths, String(months.filter((m) => Number(m.paid) > 0).length)],
          [c.delivered, String(delivered)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border p-4">
            <p className="text-xl font-extrabold tabular-nums text-primary">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-2 text-start font-medium">{c.month}</th>
              <th className="py-2 text-start font-medium">{c.paid}</th>
              <th className="py-2 text-start font-medium">{c.status}</th>
              <th className="py-2 text-start font-medium">{c.receipt}</th>
            </tr>
          </thead>
          <tbody>
            {months.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted-foreground">
                  {c.none}
                </td>
              </tr>
            ) : (
              months.map((m) => (
                <tr key={m.month} className="border-b border-border/60">
                  <td className="py-2">{m.month}</td>
                  <td className="py-2 tabular-nums">
                    {Number(m.paid) > 0 ? formatMoney(m.paid, cur, locale) : c.notPaid}
                  </td>
                  <td className="py-2">{monthState(m, locale).label}</td>
                  <td className="py-2">
                    <bdi dir="ltr" className="font-mono text-xs">
                      {m.receipt ?? c.noReceipt}
                    </bdi>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="mt-10 border-t border-border pt-4 text-xs leading-6 text-muted-foreground">
        {c.issued(formatDate(new Date().toISOString(), locale))} {c.footer} «{brand.tagline}».
      </footer>
    </div>
  );
}
