import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

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
import { defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

/**
 * A topic is a public card cut down to the two allowlisted fields the assistant may show:
 * the file code and its published display name. Nothing else of the card reaches this list.
 */
export type AskTopic = { id: string; code: string; name: string };

export const TOPIC_COPY = defineCopy("components/ask/TopicCombobox", {
  ar: {
    general: "خطوات الكفالة",
    chosen: "الملفّ المحدد",
    search: "ابحث برمز الملفّ أو الاسم المنشور",
    empty: "لا ملفّ منشور بهذا الرمز أو الاسم.",
    files: "الملفّات المنشورة",
  },
  en: {
    general: "Sponsorship steps",
    chosen: "The selected file",
    search: "Search by file code or published name",
    empty: "No published file matches that code or name.",
    files: "Published files",
  },
});

/** Searchable topic picker for the supporter assistant: general steps, or one published file. */
export default function TopicCombobox({
  id,
  value,
  onChange,
  topics,
  extra,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  topics: AskTopic[];
  /** a file asked for in the link that is not among the loaded cards */
  extra?: string | undefined;
}) {
  const c = useCopy(TOPIC_COPY);
  const [open, setOpen] = useState(false);
  const current = topics.find((t) => t.id === value);
  const label =
    value === "general" ? c.general : current ? `${current.code} · ${current.name}` : c.chosen;
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="min-h-11 w-full justify-between font-normal"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={c.search} aria-label={c.search} />
          <CommandList>
            <CommandEmpty>{c.empty}</CommandEmpty>
            <CommandGroup>
              <Item value="general" selected={value === "general"} onSelect={() => pick("general")}>
                {c.general}
              </Item>
              {extra && !topics.some((t) => t.id === extra) && (
                <Item value={extra} selected={value === extra} onSelect={() => pick(extra)}>
                  {c.chosen}
                </Item>
              )}
            </CommandGroup>
            {topics.length > 0 && (
              <CommandGroup heading={c.files}>
                {topics.map((t) => (
                  <Item
                    key={t.id}
                    value={t.id}
                    keywords={[t.code, t.name]}
                    selected={value === t.id}
                    onSelect={() => pick(t.id)}
                  >
                    <bdi className="font-mono text-xs text-muted-foreground">{t.code}</bdi>
                    <span className="truncate">{t.name}</span>
                  </Item>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Item({
  value,
  selected,
  onSelect,
  keywords,
  children,
}: {
  value: string;
  selected: boolean;
  onSelect: () => void;
  keywords?: string[];
  children: React.ReactNode;
}) {
  return (
    <CommandItem
      value={value}
      onSelect={onSelect}
      {...(keywords ? { keywords } : {})}
      className="min-h-11 gap-2"
    >
      <Check
        className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")}
        aria-hidden="true"
      />
      {children}
    </CommandItem>
  );
}
