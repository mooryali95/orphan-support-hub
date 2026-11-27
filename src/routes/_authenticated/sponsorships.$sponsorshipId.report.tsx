import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Printer } from "lucide-react";

import { KahataynMark } from "@/components/brand/KahataynMark";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/config/brand";
import { formatDate, formatMoney } from "@/lib/format";
import { monthState } from "@/lib/ledger.functions";
import { useLedger } from "@/components/sponsorship/ledger-query";
import { Name } from "@/components/kit/Name";

export const Route = createFileRoute("/_authenticated/sponsorships/$sponsorshipId/report")({
  head: () => ({
    meta: [{ title: `تقرير الكفالة — ${BRAND.name}` }, { name: "robots", content: "noindex" }],
  }),
  component: ReportPage,
});

/**
 * تقرير الكفالة السنوي — صفحةٌ للطباعة أو الحفظ PDF من المتصفّح.
 * لا يحمل إلا ما في جدول الكفالة: الاسم المستعار والأشهر وحالاتها.
 */
function ReportPage() {
  const { sponsorshipId } = Route.useParams();
  const { data, isPending } = useLedger(sponsorshipId);
  const thisYear = String(new Date().getFullYear());
  const [year, setYear] = useState(thisYear);

  if (isPending) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const l = data?.ledger;
  if (!l) {
    return (
      <p className="p-10 text-center text-sm">
        تعذّر تحميل الكفالة.{" "}
        <Link to="/dashboard" className="underline">
          لوحتي
        </Link>
      </p>
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
    <main className="mx-auto max-w-3xl bg-background px-6 py-10 print:max-w-none print:p-0">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to="/sponsorships/$sponsorshipId"
          params={{ sponsorshipId }}
          className="text-sm underline"
        >
          → العودة إلى الكفالة
        </Link>
        <div className="flex items-center gap-2">
          <select
            aria-label="السنة"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {(years.length ? years : [thisYear]).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> طباعة / حفظ PDF
          </Button>
        </div>
      </div>

      <header className="flex items-center justify-between border-b-2 border-primary pb-4">
        <div>
          <p className="font-serif text-2xl font-bold text-primary">{BRAND.name}</p>
          <p className="text-xs text-bridge-ink">{BRAND.tagline}</p>
        </div>
        <KahataynMark className="h-14 w-auto" />
      </header>

      <h1 className="mt-8 text-2xl font-extrabold">تقرير الكفالة لعام {year}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        كفالة <Name>{l.orphan.display_name}</Name> · ملفّ <Name>{l.orphan.code}</Name> ·{" "}
        {formatMoney(l.sponsorship.amount, cur)} شهرياً
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          ["المدفوع في السنة", formatMoney(paid, cur)],
          ["أشهرٌ مدفوعة", String(months.filter((m) => Number(m.paid) > 0).length)],
          ["أشهرٌ وصلت موثّقة", String(delivered)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border p-4">
            <p className="text-xl font-extrabold tabular-nums text-primary">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <table className="mt-8 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="py-2 text-start font-medium">الشهر</th>
            <th className="py-2 text-start font-medium">المدفوع</th>
            <th className="py-2 text-start font-medium">الحالة</th>
            <th className="py-2 text-start font-medium">الإيصال</th>
          </tr>
        </thead>
        <tbody>
          {months.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-6 text-center text-muted-foreground">
                لا أشهر في هذه السنة.
              </td>
            </tr>
          ) : (
            months.map((m) => (
              <tr key={m.month} className="border-b border-border/60">
                <td className="py-2">{m.month}</td>
                <td className="py-2 tabular-nums">
                  {Number(m.paid) > 0 ? formatMoney(m.paid, cur) : "—"}
                </td>
                <td className="py-2">{monthState(m).label}</td>
                <td className="py-2">
                  <bdi dir="ltr" className="font-mono text-xs">
                    {m.receipt ?? "—"}
                  </bdi>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <footer className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
        صدر في {formatDate(new Date().toISOString())}. «الوصول الموثّق» يعني أن الجهة الميدانية
        سجّلت التسليم ورفعت مستند استلامه؛ المستند محفوظ في المنصّة ولا يمرّ بمراجعةٍ مستقلّة قبل
        وسمه. ولكل شهرٍ إيصالٌ يُحسب من حقائقه: احفظ هذا التقرير، وتحقّق من أيّ إيصالٍ فيه لاحقاً من
        صفحة الكفالة — إن تغيّرت حقيقةٌ تغيّر رقمها. «{BRAND.tagline}».
      </footer>
    </main>
  );
}
