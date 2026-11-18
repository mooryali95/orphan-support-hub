import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * the partner's mark, still: a static file (public/brand/partner-mark.svg, generated from the
 * approved vector shapes in hall-mark.ts) so the header carries no path data in every page's JS.
 */
export function PartnerMark({
  className,
  title,
}: {
  className?: string;
  title?: string | undefined;
}) {
  return (
    <img
      src="/brand/partner-mark.svg"
      alt={title ?? ""}
      width={30}
      height={33}
      decoding="async"
      className={cn("h-8 w-auto", className)}
    />
  );
}

/** «بالشراكة مع الأهلية للأيتام» with the mark; `compact` keeps only the mark (narrow screens) */
export function PartnerLockup({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const p = BRAND.partner;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <PartnerMark className="h-8" title={compact ? `${p.with} ${p.name}` : undefined} />
      {!compact && (
        <span className="flex flex-col text-start leading-tight">
          <span className="text-[11px] text-muted-foreground">{p.with}</span>
          <span className="text-sm font-bold text-foreground">{p.name}</span>
        </span>
      )}
    </span>
  );
}
