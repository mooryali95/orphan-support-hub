import { cn } from "@/lib/utils";

/**
 * مؤشّرٌ واحد: رقمٌ كبير وتسميةٌ تحته. موحّدٌ في كل اللوحات كي يُقرأ
 * المؤشّر بالعين نفسها أينما ظهر.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "primary",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "primary" | "gold" | "muted";
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      <p
        className={cn(
          "text-2xl font-extrabold tabular-nums",
          tone === "primary" && "text-primary",
          tone === "gold" && "text-bridge-ink",
          tone === "muted" && "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      {hint && <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function StatRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>{children}</div>
  );
}
