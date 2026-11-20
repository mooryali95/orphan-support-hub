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
        "rounded-2xl border border-border bg-card/60 px-6 py-14 text-center",
        className,
      )}
    >
      <KahataynMark compact tone="current" className="mx-auto h-11 w-auto text-primary/25" />
      <span aria-hidden="true" className="rule-champagne mx-auto mt-5 block w-24" />
      <p className="mt-5 text-lg font-bold">{title}</p>
      {text && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">{text}</p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
