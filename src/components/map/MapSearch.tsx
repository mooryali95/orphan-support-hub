import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { rankSearch, type SearchItem } from "./map-search";

export type { SearchItem };

/**
 * بحثٌ سريع على الخارطة: حقلٌ يتّسع من زرّ، ونتائج تُختار بالأسهم وEnter،
 * والاختيار يطير إلى موضعه. «/» يفتحه من أيّ مكان في الصفحة.
 */
export function MapSearch({
  items,
  copy,
}: {
  items: SearchItem[];
  copy: { open: string; placeholder: string; none: string; close: string };
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo(() => rankSearch(items, q), [items, q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || t?.closest("input,textarea,[contenteditable=true]")) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => {
    setOpen(false);
    setQ("");
  };
  const choose = (it: SearchItem | undefined) => {
    if (!it) return;
    it.go();
    close();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-keyshortcuts="/"
        className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full bg-card/85 px-3 text-sm shadow-sm backdrop-blur transition-[background-color,scale] hover:bg-card active:scale-[0.97]"
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="max-sm:sr-only">{copy.open}</span>
        <kbd className="hidden rounded border border-border px-1.5 text-[10px] text-muted-foreground md:inline">
          /
        </kbd>
      </button>
    );
  }

  return (
    <div className="map-search relative w-full md:w-80">
      <div className="flex min-h-10 items-center gap-2 rounded-full bg-card/95 ps-3 pe-1 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_8px_24px_-8px_rgb(0_0_0/0.25)] backdrop-blur">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          aria-label={copy.placeholder}
          placeholder={copy.placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={(e) => {
            // الضغط على نتيجةٍ لا يُغلق قبل أن تُختار.
            if (!e.relatedTarget?.closest?.(`[data-search="${listId}"]`)) close();
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(results[active]);
            } else if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          aria-label={copy.close}
          onClick={close}
          className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-secondary"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <ul
        id={listId}
        role="listbox"
        data-search={listId}
        className="map-rise absolute inset-x-0 top-12 z-20 max-h-80 overflow-y-auto rounded-2xl bg-card/95 p-1.5 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_12px_32px_-8px_rgb(0_0_0/0.25)] backdrop-blur"
      >
        {results.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">{copy.none}</li>
        ) : (
          results.map((it, i) => (
            <li
              key={it.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              onPointerEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(it)}
              className={cn(
                "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-sm transition-colors",
                i === active && "bg-secondary",
              )}
            >
              <MapPin
                className={cn(
                  "size-4 shrink-0",
                  it.kind === "region" ? "text-bridge" : "text-primary",
                )}
                aria-hidden="true"
              />
              <span className="flex-1 truncate">{it.label}</span>
              {it.sub && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {it.sub}
                </span>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
