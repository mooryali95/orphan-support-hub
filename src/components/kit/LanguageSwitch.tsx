import { Check, Languages } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchLocale, useAvailableLocales, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

/**
 * زرّ اللغة. بلغتين: زرٌّ واحد باسم الأخرى بلغتها («English» / «العربية»)
 * فيعرفه من لا يقرأ الحالية. وبأكثر: قائمةٌ كل لغةٍ فيها باسمها بلغتها.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const locale = useLocale();
  const all = useAvailableLocales();
  const base =
    "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

  if (all.length <= 2) {
    const next = all.find((l) => l.code !== locale) ?? all[0]!;
    return (
      <button
        type="button"
        onClick={() => switchLocale(next.code)}
        lang={next.code}
        className={cn(base, className)}
      >
        <Languages className="size-4" aria-hidden="true" />
        {next.name}
      </button>
    );
  }

  const current = all.find((l) => l.code === locale) ?? all[0]!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(base, className)} aria-label="Language / اللغة">
        <Languages className="size-4" aria-hidden="true" />
        <span lang={current.code}>{current.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {all.map((l) => (
          <DropdownMenuItem
            key={l.code}
            lang={l.code}
            dir={l.dir}
            onSelect={() => l.code !== locale && switchLocale(l.code)}
            className="justify-between gap-6"
          >
            {l.name}
            {l.code === locale && <Check className="size-4" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
