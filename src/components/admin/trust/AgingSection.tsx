import { useCopy } from "@/lib/locale";
import { AGING_KEYS, agingTotal, verificationHref, type TrustAging } from "@/lib/trust-center";
import { cn } from "@/lib/utils";

import { SOURCES_COPY } from "../data/sources-copy";
import { TRUST_COPY } from "./copy";
import {
  CARD,
  CountryCell,
  daysSince,
  Empty,
  InnerLink,
  NUM,
  SectionHead,
  TD,
  TH,
  useCountryLabel,
  useWhen,
} from "./ui";

/** عمر المفتوح الحرج بأربع فئات لكل دولة، ثم الأقدم أوّلاً بروابطه. */
export function AgingSection({
  data,
  openCountry,
}: {
  data: TrustAging;
  openCountry: (code: string) => void;
}) {
  const c = useCopy(TRUST_COPY);
  const s = useCopy(SOURCES_COPY);
  const when = useWhen();
  const label = useCountryLabel();
  const fields = s.fields as Record<string, string>;
  const signals = s.signals as Record<string, string>;
  const names = new Map(data.buckets.map((b) => [b.code, b.name_ar]));

  return (
    <section aria-labelledby="trust-aging">
      <SectionHead id="trust-aging" title={c.agingTitle} hint={c.agingHint} />
      {data.buckets.length === 0 ? (
        <Empty>{c.noCountries}</Empty>
      ) : (
        <div className={cn(CARD, "relative overflow-x-auto")}>
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="border-border border-b">
              <tr>
                <th scope="col" className={TH}>
                  {c.colCountry}
                </th>
                {AGING_KEYS.map((k) => (
                  <th key={k} scope="col" className={cn(TH, "text-end")}>
                    {c.buckets[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {data.buckets.map((b) => (
                <tr key={b.code}>
                  <th scope="row" className={cn(TD, "text-start")}>
                    {agingTotal(b) > 0 ? (
                      <InnerLink
                        href={verificationHref(b.code)}
                        onOpen={() => openCountry(b.code)}
                        className="focus-visible:ring-ring inline-flex min-h-10 items-center rounded-md hover:underline focus-visible:ring-2 focus-visible:outline-none"
                      >
                        <CountryCell code={b.code} nameAr={b.name_ar} />
                      </InnerLink>
                    ) : (
                      <CountryCell code={b.code} nameAr={b.name_ar} />
                    )}
                  </th>
                  {AGING_KEYS.map((k) => (
                    <td
                      key={k}
                      className={cn(
                        TD,
                        NUM,
                        b[k] === 0 && "text-muted-foreground",
                        b[k] > 0 && k === "gt7" && "text-destructive font-bold",
                        b[k] > 0 && k === "d3_7" && "text-bridge-ink font-bold",
                      )}
                    >
                      {b[k]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4 className="mt-8 mb-3 text-base font-bold">{c.oldestTitle}</h4>
      {data.oldest.length === 0 ? (
        <Empty>{c.agingNone}</Empty>
      ) : (
        <>
          <ol className={cn(CARD, "divide-border divide-y")}>
            {data.oldest.map((it) => {
              const days = daysSince(it.created_at);
              return (
                <li
                  key={`${it.kind}-${it.id}`}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold",
                        it.kind === "alert"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-bridge/15 text-bridge-ink",
                      )}
                    >
                      {c.kinds[it.kind]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold break-words">
                        {it.signal
                          ? (signals[it.signal] ?? it.signal)
                          : (fields[it.field] ?? it.field)}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        <bdi>{label(it.country, names.get(it.country))}</bdi>
                        {" · "}
                        {it.file_code ? (
                          <bdi dir="ltr" className="font-mono">
                            {it.file_code}
                          </bdi>
                        ) : (
                          c.countryWide
                        )}
                        {" · "}
                        {when(it.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 ps-0 sm:justify-end">
                    <span
                      className={cn(
                        "text-sm tabular-nums",
                        days > 7 ? "text-destructive font-bold" : "text-muted-foreground",
                      )}
                    >
                      {c.daysWaiting(days)}
                    </span>
                    <InnerLink
                      href={verificationHref(it.country)}
                      onOpen={() => openCountry(it.country)}
                    >
                      {c.openIn}
                    </InnerLink>
                  </div>
                </li>
              );
            })}
          </ol>
          {data.total > data.oldest.length && (
            <p className="text-muted-foreground mt-3 text-sm">
              {c.moreWaiting(data.total - data.oldest.length)}
            </p>
          )}
        </>
      )}
    </section>
  );
}
