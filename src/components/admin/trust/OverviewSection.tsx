import { useState } from "react";

import { useCopy } from "@/lib/locale";
import { shareOf, verificationHref, type TrustCountry } from "@/lib/trust-center";
import { cn } from "@/lib/utils";

import { SOURCES_COPY } from "../data/sources-copy";
import { TRUST_COPY } from "./copy";
import {
  CARD,
  CountryCell,
  Empty,
  InnerLink,
  NUM,
  SectionHead,
  TD,
  TH,
  useCountryLabel,
  useWhen,
} from "./ui";

/**
 * النظرة عبر الدول: رسمٌ واحد (حصّة الموثَّق، سلسلةٌ واحدة بلون الهوية) فوق
 * جدولٍ مضغوط يُمسح بالعين. الرسم بلا مفتاح لأنه سلسلةٌ واحدة يسمّيها عنوانه،
 * وكلّ قيمةٍ مكتوبةٌ بجانب شريطها، والجدول هو عرضه النصّي.
 */
export function OverviewSection({
  rows,
  openCountry,
}: {
  rows: TrustCountry[];
  openCountry: (code: string) => void;
}) {
  const c = useCopy(TRUST_COPY);
  const s = useCopy(SOURCES_COPY);
  const when = useWhen();
  if (rows.length === 0) return <Empty>{c.noCountries}</Empty>;

  return (
    <section aria-labelledby="trust-overview">
      <SectionHead id="trust-overview" title={c.overviewTitle} hint={c.overviewHint} />
      <ShareChart rows={rows} />

      <div className={cn(CARD, "relative mt-6 overflow-x-auto")}>
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-border border-b">
            <tr>
              <th scope="col" className={TH}>
                {c.colCountry}
              </th>
              <th scope="col" className={cn(TH, "text-end")}>
                {c.colVerified}
              </th>
              <th scope="col" className={cn(TH, "text-end")}>
                {c.colCritical}
              </th>
              <th scope="col" className={cn(TH, "text-end")}>
                {c.colOther}
              </th>
              <th scope="col" className={cn(TH, "text-end")}>
                {c.colLinks}
              </th>
              <th scope="col" className={TH}>
                {c.colWamy}
              </th>
              <th scope="col" className={TH}>
                {c.colOffice}
              </th>
              <th scope="col" className={TH}>
                {c.colMode}
              </th>
              <th scope="col" className={TH}>
                <span className="sr-only">{c.openIn}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {rows.map((r) => {
              const share = shareOf(r.verified, r.files);
              return (
                <tr key={r.code}>
                  <th scope="row" className={cn(TD, "min-w-[10rem] text-start")}>
                    <CountryCell code={r.code} nameAr={r.name_ar} />
                  </th>
                  <td className={cn(TD, NUM)}>
                    <span className="font-bold">{share === null ? c.none : c.percent(share)}</span>
                    <span className="text-muted-foreground block text-xs whitespace-nowrap">
                      {c.verifiedOf(r.verified, r.files)}
                    </span>
                  </td>
                  <td className={cn(TD, NUM, r.critical > 0 && "text-destructive font-bold")}>
                    {r.critical}
                  </td>
                  <td className={cn(TD, NUM)}>{r.other}</td>
                  <td className={cn(TD, NUM)}>{r.link_pending}</td>
                  <td className={cn(TD, "whitespace-nowrap")}>
                    {when(r.last_wamy) ?? <span className="text-muted-foreground">{c.never}</span>}
                  </td>
                  <td className={cn(TD, "whitespace-nowrap")}>
                    {r.office_mode === "none" ? (
                      <span className="text-muted-foreground">{c.none}</span>
                    ) : (
                      (when(r.last_office) ?? (
                        <span className="text-muted-foreground">{c.never}</span>
                      ))
                    )}
                  </td>
                  <td className={TD}>
                    <span
                      className={cn(
                        "inline-block rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap",
                        r.office_mode === "active"
                          ? "bg-success/12 text-success"
                          : r.office_mode === "shadow"
                            ? "bg-bridge/15 text-bridge-ink"
                            : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {s.modes[r.office_mode]}
                    </span>
                    {r.office_source && (
                      <bdi dir="ltr" className="text-muted-foreground mt-1 block text-xs">
                        {r.office_source}
                      </bdi>
                    )}
                  </td>
                  <td className={cn(TD, "text-end")}>
                    <InnerLink href={verificationHref(r.code)} onOpen={() => openCountry(r.code)}>
                      {c.openIn}
                    </InnerLink>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** شريطٌ أفقيّ لكل دولة من خطّ الأساس (البداية المنطقية)، والقيمة بجانبه. */
function ShareChart({ rows }: { rows: TrustCountry[] }) {
  const c = useCopy(TRUST_COPY);
  const label = useCountryLabel();
  const [hover, setHover] = useState<string | null>(null);
  return (
    <figure className={cn(CARD, "p-4 sm:p-5")}>
      <figcaption className="text-sm font-bold">{c.chartTitle}</figcaption>
      <ul className="mt-4 space-y-2.5">
        {rows.map((r) => {
          const share = shareOf(r.verified, r.files);
          const on = hover === r.code;
          return (
            <li
              key={r.code}
              className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_4.5rem] items-center gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_5.5rem]"
              onPointerEnter={() => setHover(r.code)}
              onPointerLeave={() => setHover(null)}
            >
              <bdi className="truncate text-sm" title={label(r.code, r.name_ar)}>
                {label(r.code, r.name_ar)}
              </bdi>
              <div
                className="bg-secondary relative h-3 rounded-full"
                role="img"
                aria-label={`${label(r.code, r.name_ar)}: ${share === null ? c.chartEmpty : `${c.percent(share)} (${c.verifiedOf(r.verified, r.files)})`}`}
              >
                {share !== null && share > 0 && (
                  <div
                    className={cn(
                      "bg-primary absolute inset-y-0 start-0 rounded-full transition-opacity duration-150",
                      hover && !on && "opacity-50",
                    )}
                    style={{ width: `${Math.max(share, 2)}%` }}
                  />
                )}
                {on && (
                  <div
                    role="tooltip"
                    className="bg-foreground text-background pointer-events-none absolute -top-9 start-0 z-10 rounded-md px-2 py-1 text-xs whitespace-nowrap tabular-nums shadow"
                  >
                    {c.verifiedOf(r.verified, r.files)}
                  </div>
                )}
              </div>
              <span className="text-end text-sm font-bold tabular-nums">
                {share === null ? (
                  <span className="text-muted-foreground text-xs font-normal">{c.chartEmpty}</span>
                ) : (
                  c.percent(share)
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
