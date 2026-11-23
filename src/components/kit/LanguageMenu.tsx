import { Check, Languages } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchLocale, useAvailableLocales, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

/** قائمة اللغات حين تزيد على اثنتين — في قطعتها، فلا تحمل كلّ صفحةٍ مكتبة القوائم. */
export default function LanguageMenu({ className, base }: { className?: string; base: string }) {
  const locale = useLocale();
  const all = useAvailableLocales();
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
