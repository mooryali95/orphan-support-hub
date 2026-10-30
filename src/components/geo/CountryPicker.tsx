import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Globe2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CONTINENT_LABEL,
  CONTINENT_ORDER,
  COUNTRY_CODES,
  continentOf,
  countryKeywords,
  countryName,
  flagOf,
  resolveCountry,
  type Continent,
} from "@/lib/countries";
import { cn } from "@/lib/utils";

type Option = { value: string; code: string | null; label: string; count?: number | undefined };

/**
 * اختيار دولة من العالم كلّه — بحثٌ بأي لغة (عربية، إنجليزية، محلية، رمز)،
 * ومجمّعةٌ بالقارّات.
 *
 * `values`: إن مُرِّرت فهي الدول المتاحة فعلاً (كما في القاعدة، نصّاً حرّاً)
 * ولا يُعرض غيرها — فلا يختار الزائر دولةً تُرجع صفحةً فارغة. وبدونها
 * تُعرض دول العالم كلّها (للإدارة حين تضيف دولة).
 */
export function CountryPicker({
  id,
  value,
  onChange,
  values,
  counts,
  allLabel = "كل البلدان",
  placeholder = "اختر دولة",
  lang = "ar",
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  values?: string[];
  counts?: Record<string, number>;
  allLabel?: string | null;
  placeholder?: string;
  lang?: "ar" | "sq" | "en";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const options = useMemo<Option[]>(() => {
    const source = values ?? COUNTRY_CODES;
    return source.map((v) => {
      const code = resolveCountry(v);
      return {
        value: v,
        code,
        label: code ? countryName(code, lang) : v,
        count: counts?.[v],
      };
    });
  }, [values, counts, lang]);

  const groups = useMemo(() => {
    const by = new Map<Continent | "other", Option[]>();
    for (const o of options) {
      const k = (o.code && continentOf(o.code)) || "other";
      by.set(k, [...(by.get(k) ?? []), o]);
    }
    for (const list of by.values()) list.sort((a, b) => a.label.localeCompare(b.label, lang));
    return [...CONTINENT_ORDER, "other" as const]
      .filter((k) => by.has(k))
      .map((k) => ({
        key: k,
        label: k === "other" ? (lang === "ar" ? "أخرى" : "Other") : CONTINENT_LABEL[k][lang],
        items: by.get(k)!,
      }));
  }, [options, lang]);

  // القيمة قد لا تكون بين المتاح (رابطٌ قديم مثلاً): تُعرض باسمها لا برمزها.
  const selected =
    options.find((o) => o.value === value) ??
    (value ? { value, code: resolveCountry(value), label: "" } : undefined);
  if (selected && !selected.label)
    selected.label = selected.code ? countryName(selected.code, lang) : value;
  // مجموعة واحدة لا تحتاج عنواناً — قائمة قصيرة تُقرأ بلا تقسيم.
  const showHeadings = groups.length > 1 && options.length > 8;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={`البلد: ${selected?.label ?? (value || (allLabel ?? placeholder))}`}
          className={cn(
            "h-9 w-full min-w-44 justify-between font-normal active:scale-100",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected?.code ? (
              <span aria-hidden="true">{flagOf(selected.code)}</span>
            ) : (
              <Globe2 className="text-muted-foreground" aria-hidden="true" />
            )}
            <span className="truncate">
              {selected?.label ?? (value || (allLabel ?? placeholder))}
            </span>
          </span>
          <ChevronsUpDown className="opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(20rem,calc(100vw-2rem))] origin-[var(--radix-popover-content-transform-origin)] p-0"
      >
        <Command>
          <CommandInput placeholder={lang === "ar" ? "ابحث بأي لغة أو بالرمز…" : "Search…"} />
          <CommandList className="max-h-72">
            <CommandEmpty>{lang === "ar" ? "لا دولة بهذا الاسم" : "No match"}</CommandEmpty>
            {allLabel !== null && (
              <CommandGroup>
                <CommandItem
                  value="__all__"
                  keywords={[allLabel ?? ""]}
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  <Globe2 aria-hidden="true" />
                  {allLabel}
                  <Check className={cn("ms-auto", value ? "opacity-0" : "opacity-100")} />
                </CommandItem>
              </CommandGroup>
            )}
            {groups.map((g) => (
              <CommandGroup key={g.key} heading={showHeadings ? g.label : undefined}>
                {g.items.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={o.value}
                    keywords={o.code ? countryKeywords(o.code) : [o.value]}
                    onSelect={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    <span aria-hidden="true" className="w-5 text-center">
                      {o.code ? flagOf(o.code) : ""}
                    </span>
                    <span className="truncate">{o.label}</span>
                    {o.count !== undefined && (
                      <span className="ms-auto text-xs tabular-nums text-muted-foreground">
                        {o.count}
                      </span>
                    )}
                    <Check
                      className={cn(
                        o.count !== undefined ? "" : "ms-auto",
                        value === o.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
