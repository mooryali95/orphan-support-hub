import { useQuery } from "@tanstack/react-query";
import { Download, Info } from "lucide-react";
import { useState } from "react";

import { useDataFn, useDataKey } from "@/lib/data-port";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useCopy, useLocale } from "@/lib/locale";
import { shareOf, weeklyCsv, type TrustWeekly } from "@/lib/trust-center";
import { getTrustWeekly } from "@/lib/trust-center.functions";
import { cn } from "@/lib/utils";

import { TRUST_COPY } from "./copy";
import { CARD, Loadable, NUM, SectionHead, TD, TH, useCountryLabel } from "./ui";

/**
 * التقرير الأسبوعي لدولة: ما يُعاد بناؤه حقّاً من الطوابع وحده. حصّة الموثَّق
 * لا تُخزَّن أسبوعاً بأسبوع، فتظهر بقيمة اليوم وحدها ولا يُرسم لها خطّ.
 */
export function WeeklyReport({
  countries,
}: {
  countries: Array<{ code: string; name_ar: string }>;
}) {
  const c = useCopy(TRUST_COPY);
  const label = useCountryLabel();
  const fetch = useDataFn("trust.weekly", getTrustWeekly);
  const [picked, setPicked] = useState("");
  const country = countries.some((k) => k.code === picked) ? picked : (countries[0]?.code ?? "");
  const query = useQuery({
    queryKey: useDataKey(["trust-weekly", country]),
    queryFn: () => fetch({ data: { country } }),
    enabled: country !== "",
  });

  return (
    <section aria-labelledby="trust-weekly">
      <SectionHead id="trust-weekly" title={c.weeklyTitle} hint={c.weeklyHint} />
      <div role="tablist" aria-label={c.filterCountry} className="mb-4 flex flex-wrap gap-2">
        {countries.map((k) => (
          <button
            key={k.code}
            type="button"
            role="tab"
            aria-selected={k.code === country}
            onClick={() => setPicked(k.code)}
            className={cn(
              "focus-visible:ring-ring inline-flex min-h-11 max-w-full items-center rounded-full border px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none active:scale-[0.97]",
              k.code === country
                ? "border-primary bg-primary text-primary-foreground font-bold"
                : "border-border bg-card text-muted-foreground hover:text-foreground font-medium",
            )}
          >
            <bdi className="truncate">{label(k.code, k.name_ar)}</bdi>
          </button>
        ))}
      </div>
      {country !== "" && (
        <Loadable query={query}>
          {(w) => (
            <WeeklyBody
              w={w}
              name={label(w.country, countries.find((k) => k.code === w.country)?.name_ar)}
            />
          )}
        </Loadable>
      )}
    </section>
  );
}

function WeeklyBody({ w, name }: { w: TrustWeekly; name: string }) {
  const c = useCopy(TRUST_COPY);
  const locale = useLocale();
  const share = shareOf(w.verified_now, w.files);
  const quiet = w.weeks.every((r) => r.opened === 0 && r.settled === 0);

  function download() {
    const csv = weeklyCsv(w, {
      week: c.colWeek,
      opened: c.colOpened,
      openedCritical: c.colOpenedCritical,
      settled: c.colSettled,
      openAtEnd: c.colOpenAtEnd,
      filesObserved: c.colObserved,
    });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `trust-weekly-${w.country}-${w.weeks[w.weeks.length - 1]?.week ?? "report"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div className={cn(CARD, "p-4")}>
          <p className="text-muted-foreground text-xs font-bold">
            {c.verifiedToday} · <bdi>{name}</bdi>
          </p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums">
            {share === null ? c.none : c.percent(share)}
          </p>
          <p className="text-muted-foreground text-sm tabular-nums">
            {c.verifiedOf(w.verified_now, w.files)}
          </p>
        </div>
        <p className="border-bridge/40 bg-bridge/10 flex gap-2 rounded-2xl border p-4 text-sm leading-7">
          <Info
            className="text-bridge-ink mt-1 size-4 shrink-0"
            strokeWidth={2}
            aria-hidden="true"
          />
          <span>{c.weeklyHonest}</span>
        </p>
      </div>

      <div className={cn(CARD, "relative overflow-x-auto")}>
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-border border-b">
            <tr>
              <th scope="col" className={TH}>
                {c.colWeek}
              </th>
              <th scope="col" className={cn(TH, "text-end")}>
                {c.colOpened}
              </th>
              <th scope="col" className={cn(TH, "text-end")}>
                {c.colOpenedCritical}
              </th>
              <th scope="col" className={cn(TH, "text-end")}>
                {c.colSettled}
              </th>
              <th scope="col" className={cn(TH, "text-end")}>
                {c.colOpenAtEnd}
              </th>
              <th scope="col" className={cn(TH, "text-end")}>
                {c.colObserved}
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {w.weeks.map((r) => (
              <tr key={r.week}>
                <th scope="row" className={cn(TD, "text-start font-medium whitespace-nowrap")}>
                  {formatDate(r.week, locale)}
                </th>
                <td className={cn(TD, NUM)}>{r.opened}</td>
                <td className={cn(TD, NUM, r.opened_critical > 0 && "text-destructive font-bold")}>
                  {r.opened_critical}
                </td>
                <td className={cn(TD, NUM)}>{r.settled}</td>
                <td className={cn(TD, NUM, "font-bold")}>{r.open_at_end}</td>
                <td className={cn(TD, NUM)}>{r.files_observed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{quiet ? c.weeklyQuiet : ""}</p>
        <Button type="button" variant="outline" onClick={download}>
          <Download className="size-4" strokeWidth={2} aria-hidden="true" />
          {c.exportCsv}
        </Button>
      </div>
    </div>
  );
}
