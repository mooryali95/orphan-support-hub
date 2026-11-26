import { AlertTriangle, CheckCircle2, UserX } from "lucide-react";

import { useCopy } from "@/lib/locale";
import { teamFlag, verificationHref, type TeamRow } from "@/lib/trust-center";
import { cn } from "@/lib/utils";

import { TRUST_COPY } from "./copy";
import { CARD, CountryCell, Empty, InnerLink, NUM, SectionHead, TD, TH } from "./ui";

/** فريق كل دولة بأدواره، والعينان: أقلّ من مشرفَين داخلَين يُعلَّم بأيقونةٍ ونصّ. */
export function TeamSection({
  rows,
  openCountry,
}: {
  rows: TeamRow[];
  openCountry: (code: string) => void;
}) {
  const c = useCopy(TRUST_COPY);
  if (rows.length === 0) return <Empty>{c.noCountries}</Empty>;
  return (
    <section aria-labelledby="trust-team">
      <SectionHead id="trust-team" title={c.teamTitle} hint={c.teamHint} />
      <div className={cn(CARD, "relative overflow-x-auto")}>
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="border-border border-b">
            <tr>
              <th scope="col" className={TH}>
                {c.colCountry}
              </th>
              <th scope="col" className={cn(TH, "text-end")}>
                {c.colSupervisors}
              </th>
              <th scope="col" className={cn(TH, "text-end")}>
                {c.colEntry}
              </th>
              <th scope="col" className={cn(TH, "text-end")}>
                {c.colViewers}
              </th>
              <th scope="col" className={cn(TH, "text-end")}>
                {c.colPending}
              </th>
              <th scope="col" className={TH}>
                {c.colStatus}
              </th>
              <th scope="col" className={TH}>
                <span className="sr-only">{c.manageTeam}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {rows.map((r) => {
              const flag = teamFlag(r);
              const Icon =
                flag === "ok" ? CheckCircle2 : flag === "no_team" ? UserX : AlertTriangle;
              return (
                <tr key={r.code}>
                  <th scope="row" className={cn(TD, "text-start")}>
                    <CountryCell code={r.code} nameAr={r.name_ar} />
                  </th>
                  <td className={cn(TD, NUM, r.supervisors < 2 && "text-destructive font-bold")}>
                    {r.supervisors}
                  </td>
                  <td className={cn(TD, NUM)}>{r.data_entry}</td>
                  <td className={cn(TD, NUM)}>{r.viewers}</td>
                  <td className={cn(TD, NUM, r.pending === 0 && "text-muted-foreground")}>
                    {r.pending}
                  </td>
                  <td className={TD}>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-bold whitespace-nowrap",
                        flag === "ok"
                          ? "text-success"
                          : flag === "invited_only"
                            ? "text-bridge-ink"
                            : "text-destructive",
                      )}
                    >
                      <Icon className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                      {c.flags[flag]}
                    </span>
                  </td>
                  <td className={cn(TD, "text-end")}>
                    <InnerLink href={verificationHref(r.code)} onOpen={() => openCountry(r.code)}>
                      {c.manageTeam}
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
