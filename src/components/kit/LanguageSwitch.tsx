import { Languages } from "lucide-react";

import { switchLocale, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

/**
 * زرّ اللغة — يُكتب باسم اللغة الأخرى بلغتها («English» / «العربية»)،
 * فيعرفه من لا يقرأ اللغة الحالية.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const locale = useLocale();
  const next = locale === "ar" ? "en" : "ar";
  return (
    <button
      type="button"
      onClick={() => switchLocale(next)}
      lang={next}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        className,
      )}
    >
      <Languages className="size-4" aria-hidden="true" />
      {next === "en" ? "English" : "العربية"}
    </button>
  );
}
