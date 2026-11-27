import type { ReactNode } from "react";
import { Clock } from "lucide-react";

import { VerificationBadge } from "@/components/orphans/VerificationBadge";
import { SIMILAR_READY_ID } from "@/components/orphans/similar-ready";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The public sections of a child page, shared by the real page and the trial.
 * They take only public card fields as props and fetch nothing themselves: no
 * private photo, no location beyond the public place label. The verification
 * badge reads `public_verification` (level and month only).
 */
export function ChildPublicHeader({
  orphanId,
  name,
  code,
  badges,
  meta,
  className,
}: {
  orphanId: string;
  name: ReactNode;
  code?: ReactNode;
  badges?: ReactNode;
  meta: ReactNode[];
  className?: string;
}) {
  return (
    <div className={className}>
      {code && <p className="text-xs tabular-nums text-muted-foreground">{code}</p>}
      <div className={cn("flex flex-wrap items-center gap-3", code && "mt-2")}>
        <h1 className="text-[1.75rem] leading-tight font-extrabold md:text-[2.25rem]">{name}</h1>
        {badges}
      </div>
      <div className="mt-2">
        <VerificationBadge orphanId={orphanId} />
      </div>
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
        {meta.filter(Boolean).map((m, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            {m}
          </span>
        ))}
      </p>
    </div>
  );
}

/**
 * The sponsor call to action that stays at the bottom on phones. While the file
 * is under verification it offers the way to a ready child instead of a button
 * that would fail.
 */
export function SponsorCtaPanel({
  label,
  lead,
  verifying,
  verifyingText,
  similarLabel,
  hasSimilar,
  onSponsor,
  href = "#sponsor-form",
  className,
}: {
  label: string;
  lead?: ReactNode;
  verifying: boolean;
  verifyingText: string;
  similarLabel: string;
  hasSimilar: boolean;
  onSponsor?: () => void;
  href?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border bg-background/95 z-40 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {(verifying || lead) && (
          <div className="min-w-0 flex-1">
            {verifying ? (
              <p className="flex items-center gap-1.5 text-sm leading-6 font-semibold">
                <Clock className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                {verifyingText}
              </p>
            ) : (
              lead
            )}
          </div>
        )}
        {verifying ? (
          hasSimilar && (
            <Button asChild size="lg" variant="outline" className="h-11 min-h-11 shrink-0">
              <a href={`#${SIMILAR_READY_ID}`}>{similarLabel}</a>
            </Button>
          )
        ) : onSponsor ? (
          <Button
            type="button"
            size="lg"
            className="h-11 min-h-11 min-w-0 flex-1"
            onClick={onSponsor}
          >
            <span className="truncate">{label}</span>
          </Button>
        ) : (
          <Button asChild size="lg" className="h-11 min-h-11 min-w-0 flex-1">
            <a href={href} className="truncate">
              {label}
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
