import type { LucideIcon } from "lucide-react";

import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TimelineItem = {
  id: string;
  at: string;
  title: string;
  text?: string | null;
  icon: LucideIcon;
  tone?: "done" | "progress" | "muted";
};

/**
 * خطّ الأثر الزمني: الأحدث أولاً، ونقطةٌ لكل حدث بلون حالته. يُستعمل في
 * «رحلتي» ولوحة الوليّ وسجلّ الكفالة.
 */
export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cn("relative space-y-5 border-s border-border ps-6", className)}>
      {items.map((it) => (
        <li key={it.id} className="relative">
          <span
            className={cn(
              "absolute -start-[34px] flex size-7 items-center justify-center rounded-full border-2 border-background",
              it.tone === "done" && "bg-primary text-primary-foreground",
              it.tone === "progress" && "bg-bridge text-white",
              (!it.tone || it.tone === "muted") && "bg-secondary text-muted-foreground",
            )}
            aria-hidden="true"
          >
            <it.icon className="size-3.5" />
          </span>
          <p className="text-sm font-medium">{it.title}</p>
          <p className="text-xs text-muted-foreground">{formatDate(it.at)}</p>
          {it.text && <p className="mt-1 text-sm text-muted-foreground">{it.text}</p>}
        </li>
      ))}
    </ol>
  );
}
