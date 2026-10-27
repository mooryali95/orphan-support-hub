import type { ReactNode } from "react";

import { KahataynMark } from "@/components/brand/KahataynMark";
import { cn } from "@/lib/utils";

/**
 * حالة الفراغ: العلامة باهتةً، وجملةٌ تقول ما يحدث هنا عادةً، وفعلٌ واحد
 * يملؤه. الفراغ يدلّ على الخطوة التالية ولا يُترك صامتاً.
 */
export function EmptyState({
  title,
  text,
  action,
  className,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-border bg-card/60 px-6 py-10 text-center",
        className,
      )}
    >
      <KahataynMark
        compact
        tone="current"
        className="mx-auto h-10 w-auto text-muted-foreground/30"
      />
      <p className="mt-4 font-medium">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
