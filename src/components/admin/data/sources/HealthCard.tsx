import { flagOf } from "@/lib/countries";
import { verifiedShare, type CountryHealth, type TrustState } from "@/lib/golden-record";
import { useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { CARD, Pill } from "../shared";
import { SOURCES_COPY } from "../sources-copy";
import { useWhen } from "./shared";

const BAR: Array<{ key: TrustState; cls: string }> = [
  { key: "verified", cls: "bg-shore-thrive" },
  { key: "single_source", cls: "bg-bridge" },
  { key: "stale", cls: "bg-muted-foreground/40" },
  { key: "conflict", cls: "bg-primary" },
  { key: "flagged", cls: "bg-destructive" },
];

export function HealthCard({
  row,
  active,
  onPick,
}: {
  row: CountryHealth;
  active: boolean;
  onPick: () => void;
}) {
  const c = useCopy(SOURCES_COPY);
  const when = useWhen();
  const share = verifiedShare(row.trust);
  const total = BAR.reduce((n, b) => n + row.trust[b.key], 0);
  const critical = row.alerts.critical + row.conflicts.critical;
  const other = row.alerts.warning + row.conflicts.other + row.link_pending;
  const last = row.office_mode === "none" ? row.last_wamy : (row.last_office ?? row.last_wamy);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={cn(
        CARD,
        "block min-h-11 w-full p-4 text-start transition-[box-shadow,transform] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "ring-2 ring-primary",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-bold">
          {flagOf(row.code)} {row.name_ar}
        </span>
        <Pill
          tone={
            row.office_mode === "active" ? "wine" : row.office_mode === "shadow" ? "gold" : "quiet"
          }
        >
          {c.modesShort[row.office_mode]}
        </Pill>
      </div>
      {share === null ? (
        <p className="mt-4 text-sm text-muted-foreground">{c.noManaged}</p>
      ) : (
        <>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tabular-nums">{share}%</span>
            <span className="text-sm text-muted-foreground">{c.verifiedOf(total)}</span>
          </p>
          <div
            className="mt-3 flex h-2 overflow-hidden rounded-full bg-secondary"
            role="img"
            aria-label={BAR.filter((b) => row.trust[b.key] > 0)
              .map((b) => `${c.trust[b.key]} ${row.trust[b.key]}`)
              .join("، ")}
          >
            {BAR.map((b) =>
              row.trust[b.key] > 0 ? (
                <span
                  key={b.key}
                  className={b.cls}
                  style={{ width: `${(row.trust[b.key] / total) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {BAR.filter((b) => b.key !== "verified" && row.trust[b.key] > 0).map((b) => (
              <li key={b.key} className="inline-flex items-center gap-1" title={c.trustHint[b.key]}>
                <span aria-hidden="true" className={cn("size-2 rounded-full", b.cls)} />
                {c.trust[b.key]}
                <span className="tabular-nums text-foreground">{row.trust[b.key]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p
        className={cn(
          "mt-3 text-sm",
          critical > 0 ? "font-bold text-destructive" : "text-muted-foreground",
        )}
      >
        {critical > 0 ? c.needsDecision(critical) : other > 0 ? c.openItems(other) : c.allClear}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {c.lastSync}: {when(last) ?? c.never}
      </p>
    </button>
  );
}
