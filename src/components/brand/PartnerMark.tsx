import { BRAND } from "@/config/brand";
import {
  MARK_BACKING,
  MARK_CALLIGRAPHY,
  MARK_COLORS,
  MARK_CRESCENT,
  MARK_DISC,
  MARK_VIEWBOX,
} from "@/components/hall/hall-mark";
import { cn } from "@/lib/utils";

/** the partner's mark, still, from the approved vector file (no wordmark) */
export function PartnerMark({
  className,
  title,
}: {
  className?: string;
  title?: string | undefined;
}) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      className={cn("h-8 w-auto", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path d={MARK_BACKING} fill={MARK_COLORS.paper} />
      <path d={MARK_DISC} fill={MARK_COLORS.disc} />
      <path d={MARK_CRESCENT} fill={MARK_COLORS.crescent} />
      <path d={MARK_CALLIGRAPHY} fillRule="evenodd" fill={MARK_COLORS.paper} />
    </svg>
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
