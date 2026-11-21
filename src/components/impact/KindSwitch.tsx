import type { KeyboardEvent } from "react";

import { dirOf, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

export type KindTab<K extends string> = {
  key: K;
  label: string;
  /** how many of the donor's gifts are of this kind */
  count: number;
};

/**
 * مبدّل نوع العطاء فوق «أثري»: ثلاثة ألسنةٍ متساوية، لكلٍّ عدده. اللوحة ذات اللسان تحمل
 * `id` هو `${idBase}-panel-${key}`. الأسهم تنقل بين الألسنة باتجاه اللغة.
 */
export function KindSwitch<K extends string>({
  tabs,
  value,
  onChange,
  label,
  idBase,
  className,
}: {
  tabs: ReadonlyArray<KindTab<K>>;
  value: K;
  onChange: (key: K) => void;
  /** the tab list's accessible name */
  label: string;
  idBase: string;
  className?: string;
}) {
  const rtl = dirOf(useLocale()) === "rtl";
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const at = Math.max(
      0,
      tabs.findIndex((t) => t.key === value),
    );
    const forward = e.key === (rtl ? "ArrowLeft" : "ArrowRight");
    const next =
      e.key === "Home"
        ? tabs[0]!
        : e.key === "End"
          ? tabs[tabs.length - 1]!
          : tabs[(at + (forward ? 1 : tabs.length - 1)) % tabs.length]!;
    onChange(next.key);
    e.currentTarget.querySelector<HTMLElement>(`[data-kind="${next.key}"]`)?.focus();
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKey}
      className={cn("grid gap-1 rounded-2xl border border-border bg-secondary p-1", className)}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`${idBase}-tab-${t.key}`}
            aria-selected={on}
            aria-controls={`${idBase}-panel-${t.key}`}
            tabIndex={on ? 0 : -1}
            data-kind={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              "flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-center transition-[color,background-color,box-shadow] duration-[var(--dur-2)] motion-reduce:transition-none",
              on
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="text-sm font-bold leading-tight text-balance">{t.label}</span>
            <span
              className={cn(
                "text-xs tabular-nums leading-4",
                on && t.count > 0 ? "font-bold text-primary" : "",
              )}
            >
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
