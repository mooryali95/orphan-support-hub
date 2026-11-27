import type { ReactNode } from "react";
import { CloudOff, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/kit/LoadFailed", {
  ar: {
    title: "تعذّر التحميل الآن",
    text: "قد يكون الاتصال منقطعاً أو الطلبات كثيرة. أعد المحاولة بعد قليل.",
    retry: "أعد المحاولة",
  },
  en: {
    title: "This could not be loaded right now",
    text: "The connection may be down, or there are too many requests. Try again shortly.",
    retry: "Try again",
  },
});

/**
 * تعذّر الجلب ليس «لا نتائج»: قائمةٌ عامّة لم تصل من الخادم تقول ذلك كما هو، ومعها إعادة
 * المحاولة إن أمكنت. نصوصها هنا لا في ملفّات المسارات، فلا تدخل حزمة الدخول.
 */
export function LoadFailed({
  onRetry,
  busy,
  action,
  className,
}: {
  onRetry?: () => void;
  busy?: boolean;
  action?: ReactNode;
  className?: string;
}) {
  const c = useCopy(COPY);
  return (
    <div
      role="alert"
      className={cn(
        "rounded-2xl border border-border bg-card/60 px-6 py-12 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground">
        <CloudOff className="size-6" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <p className="mt-4 text-lg font-bold text-foreground">{c.title}</p>
      <p className="mx-auto mt-2 max-w-md leading-7">{c.text}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {onRetry && (
          <Button type="button" variant="outline" disabled={busy} onClick={onRetry}>
            <RotateCw className={cn(busy && "animate-spin")} aria-hidden="true" />
            {c.retry}
          </Button>
        )}
        {action}
      </div>
    </div>
  );
}
