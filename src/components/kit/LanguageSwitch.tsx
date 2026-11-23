import { lazy, Suspense } from "react";
import { Languages } from "lucide-react";

import { switchLocale, useAvailableLocales, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

// القائمة لا تلزم إلا بأكثر من لغتين: تُحمَّل حينها، ولا تدخل حزمة كلّ صفحة.
const LanguageMenu = lazy(() => import("./LanguageMenu"));

const BASE =
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

/**
 * زرّ اللغة. بلغتين: زرٌّ واحد باسم الأخرى بلغتها («English» / «العربية»)
 * فيعرفه من لا يقرأ الحالية. وبأكثر: قائمةٌ كل لغةٍ فيها باسمها بلغتها.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const locale = useLocale();
  const all = useAvailableLocales();

  if (all.length <= 2) {
    const next = all.find((l) => l.code !== locale) ?? all[0]!;
    return (
      <button
        type="button"
        onClick={() => switchLocale(next.code)}
        lang={next.code}
        className={cn(BASE, className)}
      >
        <Languages className="size-4" aria-hidden="true" />
        {next.name}
      </button>
    );
  }

  const current = all.find((l) => l.code === locale) ?? all[0]!;
  return (
    <Suspense
      fallback={
        <span className={cn(BASE, className)} lang={current.code}>
          <Languages className="size-4" aria-hidden="true" />
          {current.name}
        </span>
      }
    >
      <LanguageMenu className={className} base={BASE} />
    </Suspense>
  );
}
