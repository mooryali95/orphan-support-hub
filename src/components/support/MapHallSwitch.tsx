import { useEffect, useState } from "react";
import { Box, Map as MapIcon } from "lucide-react";

import { defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/support/MapHallSwitch", {
  ar: {
    label: "طريقة العرض",
    map: "الخريطة",
    hall: "قاعة الأثر ثلاثية الأبعاد",
    hallShort: "القاعة",
  },
  en: {
    label: "View",
    map: "Map",
    hall: "3D impact hall",
    hallShort: "Hall",
  },
});

const seg = (on: boolean) =>
  cn(
    "inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition-colors",
    on ? "bg-primary text-primary-foreground shadow-soft" : "text-foreground hover:bg-muted",
  );

/**
 * منظران لمكانٍ واحد: الخريطة هنا، والقاعة ثلاثية الأبعاد على الدولة ونوع العطاء نفسيهما، ومنها
 * يعود الزائر إلى هذه الصفحة كما تركها (`from`). القاعة مشهدٌ كامل يُحمَّل عند الدخول وحده.
 */
export function MapHallSwitch({
  country,
  kind,
  trial,
  className,
}: {
  country?: string | null | undefined;
  kind?: "qualification" | "monthly" | "in_kind" | null | undefined;
  /** the hall on the trial catalogue (demo mode, try pages) */
  trial?: boolean;
  className?: string;
}) {
  const c = useCopy(COPY);
  // the page as the visitor sees it now (with its search), read in the browser: the hall returns here
  const [here, setHere] = useState<string | null>(null);
  useEffect(() => {
    setHere(window.location.pathname + window.location.search);
  }, [country, kind]);
  const q = new URLSearchParams();
  if (trial) q.set("try", "1");
  if (country && /^[A-Z]{2}$/.test(country)) q.set("c", country);
  if (kind) q.set("kind", kind);
  if (here) q.set("from", here);
  return (
    <div
      role="group"
      aria-label={c.label}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-card/90 p-1 shadow-soft backdrop-blur",
        className,
      )}
      data-view-switch
    >
      <span aria-current="true" className={seg(true)}>
        <MapIcon className="size-4" aria-hidden="true" />
        {c.map}
      </span>
      <a href={`/hall?${q.toString()}`} className={seg(false)} data-to-hall>
        <Box className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">{c.hall}</span>
        <span className="sm:hidden">{c.hallShort}</span>
      </a>
    </div>
  );
}
