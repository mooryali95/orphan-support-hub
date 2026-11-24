import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * قالب قسم الصفحة: عنوانٌ وسطرُ شرحٍ اختياري وفعلٌ في طرفه، ثم المحتوى.
 * القوالب الأربعة (لوحة، ملفّ، معالج، قائمة) تُبنى من هذا القسم.
 */
export function PageSection({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section className={cn("mt-10 first:mt-0", className)} aria-labelledby={headingId}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={headingId} className="text-xl font-bold">
            {title}
          </h2>
          {description && (
            <p className="mt-1 max-w-2xl text-sm leading-7 text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
