import type { ReactNode } from "react";

import { Failed, Quiet } from "@/components/admin/overview/parts";
import { Skeleton } from "@/components/ui/skeleton";
import { defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/admin/PanelState", {
  ar: {
    loading: "جارٍ التحميل",
    failed: "تعذّرت قراءة هذه اللوحة. الرقم غائب لا صفر.",
    retry: "أعد المحاولة",
  },
  en: {
    loading: "Loading",
    failed: "This panel could not be read. The figure is missing, not zero.",
    retry: "Try again",
  },
});

export type PanelShape = "rows" | "cards" | "block";

/** هيكلٌ بشكل اللوحة نفسها، فلا تقفز الصفحة حين تصل البيانات. */
export function PanelSkeleton({
  shape = "rows",
  count = 3,
  className,
}: {
  shape?: PanelShape | undefined;
  count?: number | undefined;
  className?: string;
}) {
  const t = useCopy(COPY);
  return (
    <div
      role="status"
      aria-label={t.loading}
      data-panel-state="loading"
      className={cn(
        shape === "cards" ? "grid gap-3 sm:grid-cols-2" : "space-y-2",
        shape === "block" && "rounded-3xl border border-border p-5",
        className,
      )}
    >
      {Array.from({ length: shape === "block" ? 1 : count }, (_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "rounded-2xl",
            shape === "rows" && "h-16",
            shape === "cards" && "h-32",
            shape === "block" && "h-48",
          )}
        />
      ))}
    </div>
  );
}

/**
 * حالات اللوحة الثلاث في موضعٍ واحد: تحميلٌ بهيكلها، وتعذّرٌ بإطار `Failed` وزرّ إعادة،
 * وفراغٌ يقول ما الخطوة التالية. وإلا فالمحتوى.
 */
export function PanelState({
  pending,
  failed,
  empty,
  onRetry,
  emptyTitle,
  emptyNext,
  shape,
  count,
  children,
}: {
  pending: boolean;
  failed?: boolean;
  empty?: boolean;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyNext?: string;
  shape?: PanelShape;
  count?: number;
  children: ReactNode;
}) {
  const t = useCopy(COPY);
  if (pending) return <PanelSkeleton shape={shape} count={count} />;
  if (failed)
    return onRetry ? (
      <Failed title={t.failed} retry={t.retry} onRetry={onRetry} />
    ) : (
      <Failed title={t.failed} />
    );
  if (empty && emptyTitle)
    return emptyNext ? <Quiet title={emptyTitle} text={emptyNext} /> : <Quiet title={emptyTitle} />;
  return <>{children}</>;
}
