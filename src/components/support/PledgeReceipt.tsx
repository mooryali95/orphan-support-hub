import { formatDate } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/support/PledgeReceipt", {
  ar: { date: "التاريخ", ref: "رقم المرجع" },
  en: { date: "Date", ref: "Reference" },
});

/**
 * ملخّص ما سُجّل بعد التعهّد: الصفوف التي اختارها الداعم، والتاريخ، ورقم
 * مرجع قصير من معرّف التعهّد. ليس إيصال دفع — التعهّد لا يُخصم منه شيء.
 */
export function PledgeReceipt({
  rows,
  id,
  at,
  compact = false,
  className,
}: {
  rows: Array<[string, string]>;
  id?: string | null | undefined;
  at?: Date | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  const t = useCopy(COPY);
  const locale = useLocale();
  const all: Array<[string, React.ReactNode]> = [...rows];
  if (at)
    all.push([
      t.date,
      <span className="tabular-nums">{formatDate(at.toISOString(), locale)}</span>,
    ]);
  if (id)
    all.push([
      t.ref,
      <span dir="ltr" className="font-mono text-xs tracking-wider">
        {id.slice(0, 8).toUpperCase()}
      </span>,
    ]);
  return (
    <dl
      className={cn(
        "border-bridge/40 bg-background divide-border divide-y rounded-2xl border text-start",
        compact ? "text-xs" : "text-sm",
        className,
      )}
    >
      {all.map(([k, v]) => (
        <div
          key={k}
          className={cn(
            "flex items-center justify-between gap-4",
            compact ? "px-3 py-2" : "px-4 py-3",
          )}
        >
          <dt className="text-muted-foreground shrink-0">{k}</dt>
          <dd className="min-w-0 truncate font-bold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
