import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/locale";
import { DECISION_ACTIONS, type Decision, type DecisionAction } from "@/lib/trust-center";
import { getTrustDecisions } from "@/lib/trust-center.functions";
import { cn } from "@/lib/utils";

import { SOURCES_COPY } from "../data/sources-copy";
import { TRUST_COPY } from "./copy";
import { CARD, Empty, Loadable, SectionHead, TD, TH, useCountryLabel, useWhen } from "./ui";

const SELECT =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm";

type Cursor = { at: string; id: string } | null;

/** سجلّ القرارات بصفحاتٍ بالمؤشّر: «الأقدم» يحفظ موضعه، و«الأحدث» يعود إليه. */
export function DecisionLog({
  countries,
}: {
  countries: Array<{ code: string; name_ar: string }>;
}) {
  const c = useCopy(TRUST_COPY);
  const label = useCountryLabel();
  const fetch = useServerFn(getTrustDecisions);
  const [country, setCountry] = useState<string>("");
  const [action, setAction] = useState<DecisionAction | "">("");
  const [stack, setStack] = useState<Cursor[]>([null]);
  const cursor = stack[stack.length - 1] ?? null;
  const query = useQuery({
    queryKey: ["trust-decisions", country, action, cursor?.at ?? null, cursor?.id ?? null],
    queryFn: () =>
      fetch({
        data: {
          country: country || null,
          action: action || null,
          beforeAt: cursor?.at ?? null,
          beforeId: cursor?.id ?? null,
        },
      }),
    placeholderData: keepPreviousData,
  });
  const reset = () => setStack([null]);

  return (
    <section aria-labelledby="trust-decisions">
      <SectionHead id="trust-decisions" title={c.decisionsTitle} hint={c.decisionsHint} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
        <label className="block">
          <span className="text-muted-foreground mb-1.5 block text-xs font-bold">
            {c.filterCountry}
          </span>
          <select
            className={SELECT}
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              reset();
            }}
          >
            <option value="">{c.allCountries}</option>
            {countries.map((k) => (
              <option key={k.code} value={k.code}>
                {label(k.code, k.name_ar)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-muted-foreground mb-1.5 block text-xs font-bold">
            {c.filterAction}
          </span>
          <select
            className={SELECT}
            value={action}
            onChange={(e) => {
              setAction(e.target.value as DecisionAction | "");
              reset();
            }}
          >
            <option value="">{c.allActions}</option>
            {DECISION_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {c.actions[a]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Loadable query={query}>
        {(page) =>
          page.rows.length === 0 ? (
            <Empty>{c.noDecisions}</Empty>
          ) : (
            <>
              <div
                className={cn(
                  CARD,
                  "relative overflow-x-auto transition-opacity",
                  query.isPlaceholderData && "opacity-60",
                )}
                aria-busy={query.isPlaceholderData}
              >
                <table className="w-full min-w-[44rem] text-sm">
                  <thead className="border-border border-b">
                    <tr>
                      <th scope="col" className={TH}>
                        {c.colWhen}
                      </th>
                      <th scope="col" className={TH}>
                        {c.colAction}
                      </th>
                      <th scope="col" className={TH}>
                        {c.colCountry}
                      </th>
                      <th scope="col" className={TH}>
                        {c.colActor}
                      </th>
                      <th scope="col" className={TH}>
                        {c.colDetail}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {page.rows.map((d) => (
                      <DecisionRow key={d.id} d={d} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-muted-foreground text-sm tabular-nums">
                  {c.page(stack.length)}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={stack.length === 1}
                    onClick={() => setStack((s) => s.slice(0, -1))}
                  >
                    {c.newer}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!page.has_more || query.isPlaceholderData}
                    onClick={() => {
                      const last = page.rows[page.rows.length - 1]!;
                      setStack((s) => [...s, { at: last.created_at, id: last.id }]);
                    }}
                  >
                    {c.older}
                  </Button>
                </div>
              </div>
            </>
          )
        }
      </Loadable>
    </section>
  );
}

function DecisionRow({ d }: { d: Decision }) {
  const c = useCopy(TRUST_COPY);
  const s = useCopy(SOURCES_COPY);
  const when = useWhen();
  const label = useCountryLabel();
  return (
    <tr>
      <td className={cn(TD, "whitespace-nowrap")}>{when(d.created_at)}</td>
      <td className={cn(TD, "font-bold whitespace-nowrap")}>{c.actions[d.action] ?? d.action}</td>
      <td className={TD}>{d.country ? <bdi>{label(d.country)}</bdi> : c.none}</td>
      <td className={cn(TD, "max-w-[16rem]")}>
        {d.actor_email ? (
          <bdi dir="ltr" className="block truncate" title={d.actor_email}>
            {d.actor_email}
          </bdi>
        ) : (
          <span className="text-muted-foreground">{c.unknownActor}</span>
        )}
      </td>
      <td className={cn(TD, "text-muted-foreground min-w-[18rem]")}>
        <Detail
          d={d}
          fields={s.fields as Record<string, string>}
          signals={s.signals as Record<string, string>}
          modes={s.modes}
        />
      </td>
    </tr>
  );
}

function Detail({
  d,
  fields,
  signals,
  modes,
}: {
  d: Decision;
  fields: Record<string, string>;
  signals: Record<string, string>;
  modes: Record<string, string>;
}) {
  const c = useCopy(TRUST_COPY);
  const x = d.detail;
  const str = (k: string) => (typeof x[k] === "string" ? (x[k] as string) : null);
  const file = d.file_code ? (
    <bdi dir="ltr" className="font-mono text-xs">
      {d.file_code}
    </bdi>
  ) : null;
  const parts: ReactNode[] = [];
  switch (d.action) {
    case "golden_conflict_resolve": {
      const f = str("field");
      const ch = str("choice");
      if (f) parts.push(fields[f] ?? f);
      if (ch) parts.push((c.choices as Record<string, string>)[ch] ?? ch);
      break;
    }
    case "golden_alert_resolve": {
      const sg = str("signal");
      const st = str("status");
      if (sg) parts.push(signals[sg] ?? sg);
      if (st) parts.push((c.alertStatuses as Record<string, string>)[st] ?? st);
      break;
    }
    case "country_staff_set": {
      const roles = c.roles as Record<string, string>;
      const from = str("from");
      const to = str("to");
      parts.push(
        `${from ? (roles[from] ?? from) : c.none} ${c.arrow} ${to ? (roles[to] ?? to) : roles["removed"]}`,
      );
      break;
    }
    case "country_source_mode": {
      parts.push(
        `${modes[str("from") ?? ""] ?? c.none} ${c.arrow} ${modes[str("to") ?? ""] ?? c.none}`,
      );
      break;
    }
    case "golden_ingest": {
      const n = typeof x["records"] === "number" ? x["records"] : Number(x["records"] ?? 0);
      parts.push(c.records(n));
      break;
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
      {file}
      {parts.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </span>
  );
}
