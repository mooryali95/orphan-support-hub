import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { defineCopy, useCopy } from "@/lib/locale";
import { applyTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/kit/ThemeSwitch", {
  ar: { toDark: "المظهر الداكن", toLight: "المظهر الفاتح" },
  en: { toDark: "Dark appearance", toLight: "Light appearance" },
});

/** زرّ المظهر: الشمس والقمر يتبادلان بدورانٍ قصير، والحالة في الكعكة. */
export function ThemeSwitch({ className }: { className?: string }) {
  const c = useCopy(COPY);
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);
  const dark = theme === "dark";
  return (
    <button
      type="button"
      aria-label={dark ? c.toLight : c.toDark}
      aria-pressed={dark}
      title={dark ? c.toLight : c.toDark}
      onClick={() => {
        const next: Theme = dark ? "light" : "dark";
        applyTheme(next);
        setTheme(next);
      }}
      className={cn(
        "relative inline-grid size-9 place-items-center rounded-lg text-muted-foreground transition-[background-color,color,scale] duration-200 hover:bg-secondary hover:text-foreground active:scale-[0.94]",
        className,
      )}
    >
      <Sun
        aria-hidden="true"
        className={cn(
          "col-start-1 row-start-1 size-[1.15rem] transition-[opacity,rotate,scale] duration-300 ease-[var(--ease-out)]",
          dark ? "scale-50 -rotate-90 opacity-0" : "opacity-100",
        )}
      />
      <Moon
        aria-hidden="true"
        className={cn(
          "col-start-1 row-start-1 size-[1.1rem] transition-[opacity,rotate,scale] duration-300 ease-[var(--ease-out)]",
          dark ? "opacity-100" : "scale-50 rotate-90 opacity-0",
        )}
      />
    </button>
  );
}
