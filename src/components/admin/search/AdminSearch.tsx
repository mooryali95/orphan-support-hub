import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Baby, Banknote, HandHeart, Loader2, Search, UserRound } from "lucide-react";
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  flattenHits,
  NO_RESULTS,
  SEARCH_MIN,
  type SearchHit,
  type SearchResults,
} from "@/lib/admin-tools";
import { adminSearch } from "@/lib/admin-tools.functions";
import { countryName } from "@/lib/countries";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/admin/search", {
  ar: {
    field: "ابحث في الإدارة",
    placeholder: "رمز طفل أو اسمه، بريد كافل، مرجع تحويل…",
    title: "بحثٌ في الإدارة",
    hint: "أطفال، وكفلاء، وكفالات، وتحويلات — بنطاق صلاحيتك. الأسهم للتنقّل وEnter للفتح.",
    short: "اكتب حرفين على الأقلّ.",
    none: "لا نتائج.",
    failed: "تعذّر البحث. أعد المحاولة.",
    groups: {
      child: "الأطفال",
      sponsor: "الكفلاء",
      sponsorship: "الكفالات",
      transfer: "التحويلات",
    },
    ref: "مرجع",
  },
  en: {
    field: "Search administration",
    placeholder: "Child code or name, sponsor email, transfer reference…",
    title: "Search administration",
    hint: "Children, sponsors, sponsorships and transfers, within your access. Arrow keys to move, Enter to open.",
    short: "Type at least two characters.",
    none: "No results.",
    failed: "Search failed. Try again.",
    groups: {
      child: "Children",
      sponsor: "Sponsors",
      sponsorship: "Sponsorships",
      transfer: "Transfers",
    },
    ref: "Ref",
  },
});

const ICONS = { child: Baby, sponsor: UserRound, sponsorship: HandHeart, transfer: Banknote };

/**
 * البحث الموحّد للإدارة: حقلٌ في رأس اللوحة، وCtrl/⌘+K من أيّ مكان. النتائج من
 * `admin_search` (الإدارة كاملة، وفريق الدولة أطفال دوله وحدهم) بحقول القوائم وحدها.
 * الاختيار يُسلَّم للمضيف (`onPick`) ليفتح الشاشة المناسبة.
 */
export function AdminSearch({ onPick }: { onPick: (hit: SearchHit) => void }) {
  const t = useCopy(COPY);
  const [open, setOpen] = useState(false);
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
        className="border-border bg-card text-muted-foreground hover:border-primary/50 focus-visible:ring-ring flex min-h-11 w-full items-center gap-2 rounded-xl border px-3 text-start text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none sm:max-w-md"
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{t.field}</span>
        <kbd className="border-border bg-secondary hidden rounded-md border px-1.5 py-0.5 font-mono text-[11px] sm:inline">
          <bdi dir="ltr">{mac ? "⌘K" : "Ctrl K"}</bdi>
        </kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
          {open && (
            <Panel
              onPick={(h) => {
                setOpen(false);
                onPick(h);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Panel({ onPick }: { onPick: (hit: SearchHit) => void }) {
  const t = useCopy(COPY);
  const locale = useLocale();
  const listId = useId();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 220);
    return () => clearTimeout(id);
  }, [text]);
  const search = useDataFn("admin.search", adminSearch);
  const res = useQuery({
    queryKey: useDataKey(["admin-search", q]),
    queryFn: () => search({ data: { q } }),
    enabled: q.length >= SEARCH_MIN,
    placeholderData: keepPreviousData,
  });
  const results: SearchResults = res.data?.ok ? res.data.data : NO_RESULTS;
  const hits = useMemo(() => flattenHits(results), [results]);
  useEffect(() => setActive(0), [hits]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!hits.length) return;
      const d = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + d + hits.length) % hits.length);
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      onPick(hits[active]);
    }
  };

  let i = -1;
  const groups = (["child", "sponsor", "sponsorship", "transfer"] as const)
    .map((kind) => ({ kind, hits: hits.filter((h) => h.kind === kind) }))
    .filter((g) => g.hits.length > 0);

  return (
    <>
      <DialogTitle className="sr-only">{t.title}</DialogTitle>
      <DialogDescription className="sr-only">{t.hint}</DialogDescription>
      <div className="border-border flex items-center gap-2 border-b px-4">
        <Search className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <input
          autoFocus
          type="text"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls={listId}
          aria-activedescendant={hits.length ? `${listId}-${active}` : undefined}
          aria-label={t.field}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={t.placeholder}
          className="min-h-14 w-full min-w-0 bg-transparent pe-8 text-base outline-none md:text-sm"
        />
        {res.isFetching && (
          <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden="true" />
        )}
      </div>
      <div className="max-h-[60vh] overflow-y-auto overscroll-contain p-2" aria-live="polite">
        {q.length < SEARCH_MIN ? (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">{t.short}</p>
        ) : res.data && !res.data.ok ? (
          <p className="text-destructive px-3 py-6 text-center text-sm">{t.failed}</p>
        ) : res.isPending ? null : hits.length === 0 ? (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">{t.none}</p>
        ) : (
          <ul id={listId} role="listbox" aria-label={t.title}>
            {groups.map((g) => (
              <li key={g.kind} role="presentation" className="mb-2 last:mb-0">
                <p className="text-muted-foreground px-3 pt-2 pb-1 text-[11px] font-bold">
                  {t.groups[g.kind]}
                </p>
                <ul role="presentation">
                  {g.hits.map((h) => {
                    i++;
                    const n = i;
                    const Icon = ICONS[h.kind];
                    const [title, sub] = describe(h, locale, t.ref);
                    return (
                      <li
                        key={`${h.kind}-${h.item.id}`}
                        id={`${listId}-${n}`}
                        role="option"
                        aria-selected={n === active}
                        onMouseMove={() => setActive(n)}
                        onClick={() => onPick(h)}
                        className={cn(
                          "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5",
                          n === active ? "bg-primary/10" : "hover:bg-secondary/60",
                        )}
                      >
                        <Icon
                          className="text-muted-foreground size-4 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">
                            <bdi>{title}</bdi>
                          </span>
                          {sub && (
                            <span className="text-muted-foreground block truncate text-xs">
                              <bdi>{sub}</bdi>
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function describe(h: SearchHit, locale: string, ref: string): [string, string] {
  switch (h.kind) {
    case "child":
      return [
        `${h.item.code} · ${h.item.name}`,
        h.item.country ? countryName(h.item.country, locale) : "",
      ];
    case "sponsor":
      return [h.item.name || h.item.email || h.item.id.slice(0, 8), h.item.email ?? ""];
    case "sponsorship":
      return [
        `${h.item.code} · ${h.item.child}`,
        `${h.item.amount} ${h.item.currency} · ${h.item.sponsor ?? ""}`,
      ];
    case "transfer":
      return [
        `${ref} ${h.item.ref}`,
        `${h.item.amount} ${h.item.currency} · ${h.item.code}${h.item.bank_reference ? ` · ${h.item.bank_reference}` : ""}`,
      ];
  }
}
