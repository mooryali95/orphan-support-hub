import { HandHeart } from "lucide-react";

import { OFFERING } from "@/config/offering";
import { useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

/** ما تقدّمه المنصّة الآن — كفالةٌ ودعمٌ للتأهيل، لا تبرّعٌ عام. */
export function OfferingNote({ className }: { className?: string }) {
  const locale = useLocale();
  if (OFFERING.donations) return null;
  const o = locale === "en" ? OFFERING.en : OFFERING;
  return (
    <aside
      className={cn(
        "flex items-start gap-3 rounded-2xl bg-secondary/60 p-4 text-sm leading-7",
        className,
      )}
      aria-label={o.title}
    >
      <HandHeart
        className="mt-1 size-5 shrink-0 text-primary"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <p>
        <strong className="block">{o.title}</strong>
        {o.text} <span className="text-muted-foreground">{o.later}</span>
      </p>
    </aside>
  );
}
