import { HandHeart } from "lucide-react";

import { OFFERING } from "@/config/offering";
import { cn } from "@/lib/utils";

/** ما تقدّمه المنصّة الآن — كفالةٌ ودعمٌ للتأهيل، لا تبرّعٌ عام. */
export function OfferingNote({ className }: { className?: string }) {
  if (OFFERING.donations) return null;
  return (
    <aside
      className={cn(
        "flex items-start gap-3 rounded-2xl bg-secondary/60 p-4 text-sm leading-7",
        className,
      )}
      aria-label={OFFERING.title}
    >
      <HandHeart
        className="mt-1 size-5 shrink-0 text-primary"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <p>
        <strong className="block">{OFFERING.title}</strong>
        {OFFERING.text} <span className="text-muted-foreground">{OFFERING.later}</span>
      </p>
    </aside>
  );
}
