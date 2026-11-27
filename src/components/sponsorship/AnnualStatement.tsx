import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Printer } from "lucide-react";

import { KahataynMark } from "@/components/brand/KahataynMark";
import { Name } from "@/components/kit/Name";
import { useLedgers } from "@/components/sponsorship/ledger-query";
import { hijriLabel, monthLabel } from "@/components/sponsorship/sponsor-format";
import { Button } from "@/components/ui/button";
import { brandFor } from "@/config/brand";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { formatDate, formatMoneyExact as exactMoney } from "@/lib/format";
import type { SponsorshipLedger } from "@/lib/ledger.functions";
import { defineCopy, dirOf, useCopy, useLocale } from "@/lib/locale";
import { statementFor, statementYears } from "@/lib/sponsor-center";
import { listMySponsorships } from "@/lib/sponsorships.functions";

const COPY = defineCopy("components/sponsorship/AnnualStatement", {
  ar: {
    title: "سجلّ التبرّعات",
    titleYear: (year: number) => `سجلّ التبرّعات لعام ${year}`,
    lead: "كلّ فاتورةٍ مدفوعة في السنة الميلادية عبر كفالاتك، مجموعةً بالطفل، ومجاميعها بكلّ عملةٍ وحدها.",
    back: "العودة إلى أثري",
    year: "السنة",
    print: "طباعة أو حفظ PDF",
    loading: "يُحمَّل السجلّ…",
    loadFailed: "تعذّر تحميل كفالاتك. حاول مرّةً أخرى.",
    retry: "إعادة المحاولة",
    partial: "تعذّر تحميل سجلّ بعض الكفالات، فهذا السجلّ ناقص. أعد المحاولة قبل حفظه.",
    empty: (year: number) => `لا فواتير مدفوعة في ${year}.`,
    file: (code: string) => `ملفّ ${code}`,
    month: "الشهر",
    invoice: "الفاتورة",
    paidOn: "تاريخ الدفع",
    amount: "المبلغ",
    providerReceipt: "إيصال المزوّد",
    refundedTitle: "مبالغ رُدّت إليك (تُطرح)",
    totals: "المجموع بكلّ عملة",
    currency: "العملة",
    received: "ما دُفع",
    refunded: "ما رُدّ",
    net: "الصافي",
    issued: (date: string) => `صدر في ${date}.`,
    note: "يضمّ السجلّ الفواتير المدفوعة وحدها؛ والمردودة تُسرد وتُطرح، والمعلّقة والمتعثّرة لا تدخل. لا تُجمع عملتان في رقمٍ واحد.",
    zakat:
      "أهلية الزكاة تتبع السياسة التي تنشرها الندوة. هذا السجلّ لا يصنّف التبرّعات زكاةً ولا يذكر خصماً ضريبياً.",
    sample: "بيانات نموذجية · محاكاة",
    sampleNote: "سجلٌّ محاكى من التجربة: الفواتير نموذجية (DEMO-INV-) ولم يُدفع شيءٌ حقيقي.",
    child: "الطفل",
  },
  en: {
    title: "Record of donations",
    titleYear: (year: number) => `Record of donations for ${year}`,
    lead: "Every paid invoice in the calendar year across your sponsorships, grouped by child, with totals in each currency on its own.",
    back: "Back to my impact",
    year: "Year",
    print: "Print or save as PDF",
    loading: "Loading the record…",
    loadFailed: "Your sponsorships couldn't load. Please try again.",
    retry: "Try again",
    partial:
      "Some sponsorship records couldn't load, so this record is incomplete. Try again before saving it.",
    empty: (year: number) => `No paid invoices in ${year}.`,
    file: (code: string) => `File ${code}`,
    month: "Month",
    invoice: "Invoice",
    paidOn: "Paid on",
    amount: "Amount",
    providerReceipt: "Provider receipt",
    refundedTitle: "Amounts refunded to you (subtracted)",
    totals: "Totals by currency",
    currency: "Currency",
    received: "Paid",
    refunded: "Refunded",
    net: "Net",
    issued: (date: string) => `Issued on ${date}.`,
    note: "This record includes paid invoices only; refunded ones are listed and subtracted, and pending or failed ones are left out. Two currencies are never added into one figure.",
    zakat:
      "Zakat eligibility follows the policy WAMY publishes. This record does not classify donations as zakat and makes no claim of tax deductibility.",
    sample: "Sample data · simulated",
    sampleNote:
      "A simulated record from the trial: the invoices are sample data (DEMO-INV-) and nothing real was paid.",
    child: "Child",
  },
});

/**
 * سجلّ التبرّعات السنوي — صفحةٌ للطباعة أو الحفظ PDF، بتخطيط تقرير الكفالة. يُبنى من
 * `listMySponsorships` ثم سجلّ كلّ كفالة عبر منفذ البيانات (`sponsor.ledger`)، فتعرضه التجربة
 * ببياناتها النموذجية. لا يسمّي شيئاً «زكاة»: لا حقل زكاةٍ في البيانات ولا سياسة منشورة هنا.
 */
export function AnnualStatement({
  year,
  sample = false,
  backTo,
  yearHref,
}: {
  year: number;
  /** التجربة: شارة «نموذجي · محاكاة» ظاهرة في الشاشة وفي المطبوع */
  sample?: boolean;
  backTo: string;
  /** مسار سنةٍ أخرى */
  yearHref: (y: number) => string;
}) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const brand = brandFor(locale);
  const navigate = useNavigate();
  const fetchList = useDataFn("sponsor.manage.list", listMySponsorships);
  const list = useQuery({ queryKey: useDataKey(["my-sponsorships"]), queryFn: () => fetchList() });
  const ids = (list.data?.sponsorships ?? [])
    .filter((s) => s.status !== "pending_payment")
    .map((s) => s.id);
  const results = useLedgers(ids);
  const ledgers = results.flatMap((r) =>
    r.data?.ok && r.data.ledger ? [r.data.ledger as SponsorshipLedger] : [],
  );
  const loading = list.isPending || results.some((r) => r.isLoading);
  const failed = list.isError || Boolean(list.data?.error);
  const partial = !loading && results.some((r) => r.isError || (r.data && !r.data.ok));
  const st = statementFor(year, ledgers);
  const thisYear = new Date().getUTCFullYear();
  const years = [...new Set([thisYear, year, ...statementYears(ledgers)])].sort((a, b) => b - a);

  return (
    <main
      dir={dirOf(locale)}
      className="mx-auto max-w-3xl bg-background px-4 py-8 sm:px-6 sm:py-10 print:max-w-none print:p-0"
    >
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={backTo as "/"} className="inline-flex min-h-11 items-center text-sm underline">
          {c.back}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={c.year}
            value={year}
            onChange={(e) => void navigate({ to: yearHref(Number(e.target.value)) as "/" })}
            className="h-11 rounded-md border border-input bg-background px-3 text-base md:text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <Button className="min-h-11" onClick={() => window.print()} disabled={loading}>
            <Printer className="size-4" aria-hidden="true" /> {c.print}
          </Button>
        </div>
      </div>

      <header className="flex items-center justify-between gap-4 border-b-2 border-primary pb-4">
        <div className="min-w-0">
          <p className="font-serif text-2xl font-bold text-primary">{brand.name}</p>
          <p className="text-xs text-foreground">{brand.ownerLine}</p>
          <p className="text-xs text-muted-foreground">{brand.ownerName}</p>
        </div>
        <KahataynMark className="h-14 w-auto shrink-0" />
      </header>

      {sample && (
        <p className="mt-6 rounded-xl border-2 border-dashed border-bridge/60 p-3 text-sm leading-7 font-semibold text-bridge-ink">
          {c.sample}. {c.sampleNote}
        </p>
      )}

      <h1 className="mt-8 text-2xl font-extrabold text-balance">{c.titleYear(year)}</h1>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{c.lead}</p>

      {failed ? (
        <div role="alert" className="mt-8 rounded-2xl border border-border p-6 text-center">
          <p className="text-destructive">{c.loadFailed}</p>
          <Button variant="outline" className="mt-3" onClick={() => void list.refetch()}>
            {c.retry}
          </Button>
        </div>
      ) : loading ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {c.loading}
        </p>
      ) : (
        <>
          {partial && (
            <p role="alert" className="mt-6 rounded-xl bg-destructive/8 p-3 text-sm leading-7">
              {c.partial}
            </p>
          )}
          {st.children.length === 0 ? (
            <p className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {c.empty(year)}
            </p>
          ) : (
            st.children.map((ch) => (
              <section key={ch.sponsorshipId} className="mt-8 break-inside-avoid">
                <h2 className="text-lg font-bold">
                  <Name>{ch.name}</Name>{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    · <bdi>{c.file(ch.code)}</bdi>
                  </span>
                </h2>
                <Lines lines={ch.paid} locale={locale} c={c} />
                {ch.refunded.length > 0 && (
                  <>
                    <h3 className="mt-4 text-sm font-bold">{c.refundedTitle}</h3>
                    <Lines lines={ch.refunded} locale={locale} c={c} negative />
                  </>
                )}
              </section>
            ))
          )}

          {st.totals.length > 0 && (
            <section className="mt-10 break-inside-avoid" aria-labelledby="st-totals">
              <h2 id="st-totals" className="text-lg font-bold">
                {c.totals}
              </h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="py-2 text-start font-medium">{c.currency}</th>
                      <th className="py-2 text-end font-medium">{c.received}</th>
                      <th className="py-2 text-end font-medium">{c.refunded}</th>
                      <th className="py-2 text-end font-medium">{c.net}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {st.totals.map((t) => (
                      <tr key={t.currency} className="border-b border-border/60">
                        <td className="py-2">
                          <bdi dir="ltr">{t.currency}</bdi>
                        </td>
                        <td className="py-2 text-end tabular-nums">
                          {exactMoney(t.received, t.currency, locale)}
                        </td>
                        <td className="py-2 text-end tabular-nums">
                          {t.refunded > 0 ? `−${exactMoney(t.refunded, t.currency, locale)}` : "—"}
                        </td>
                        <td className="py-2 text-end font-bold tabular-nums">
                          {exactMoney(t.net, t.currency, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <footer className="mt-10 space-y-2 border-t border-border pt-4 text-xs leading-6 text-muted-foreground">
        <p>
          {c.issued(formatDate(new Date().toISOString(), locale))} {c.note}
        </p>
        <p>{c.zakat}</p>
        {sample && <p className="font-semibold text-bridge-ink">{c.sample}</p>}
      </footer>
    </main>
  );
}

function Lines({
  lines,
  locale,
  c,
  negative = false,
}: {
  lines: ReturnType<typeof statementFor>["children"][number]["paid"];
  locale: string;
  c: (typeof COPY)["ar"];
  negative?: boolean;
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="py-2 text-start font-medium">{c.month}</th>
            <th className="py-2 text-start font-medium">{c.invoice}</th>
            <th className="hidden py-2 text-start font-medium sm:table-cell print:table-cell">
              {c.paidOn}
            </th>
            <th className="py-2 text-end font-medium">{c.amount}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((p) => (
            <tr key={p.invoice_no} className="border-b border-border/60 align-top">
              <td className="py-2 pe-2">
                {monthLabel(p.month, locale)}
                <span className="block text-xs text-muted-foreground">
                  {hijriLabel(p.month, locale)}
                </span>
              </td>
              <td className="py-2 pe-2">
                <bdi dir="ltr" className="font-mono text-xs break-all">
                  {p.invoice_no}
                </bdi>
                {p.receipt_url && (
                  <a
                    href={p.receipt_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block text-xs text-primary underline print:hidden"
                  >
                    {c.providerReceipt}
                  </a>
                )}
              </td>
              <td className="hidden py-2 pe-2 sm:table-cell print:table-cell">
                {formatDate(p.paid_at, locale)}
              </td>
              <td className="py-2 text-end tabular-nums whitespace-nowrap">
                {negative ? "−" : ""}
                {exactMoney(p.amount, p.currency, locale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
