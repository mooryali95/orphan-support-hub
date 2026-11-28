import { PanelSkeleton } from "@/components/admin/PanelState";
import { Failed, Quiet } from "@/components/admin/overview/parts";
import { Clock, Keyboard, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { LoadMore } from "@/components/admin/data/keyset";
import { ChildFileSheet } from "@/components/admin/data/WorkTools";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { countryName } from "@/lib/countries";
import { useDemo } from "@/lib/demo-mode";
import { matchesQuery, type CountryAccess } from "@/lib/golden-record";
import { dirOf, useCopy, useLocale } from "@/lib/locale";

import { TODAY_COPY } from "./copy";
import { TODAY_ROWS } from "@/lib/golden-record";

import { CountryTodayStrip } from "./CountryTodayStrip";
import { TodayTiles } from "./TodayTiles";
import {
  applyFilters,
  groupOf,
  GROUPS,
  KIND_GROUPS,
  NO_FILTERS,
  type Filters,
  type Group,
  type QueueItem,
} from "./queue";
import { useToday } from "./useToday";
import { FILTER_KEYS } from "./useUrlFilters";
import { Detail, useSettle } from "./TodayDetail";
import { directSettle, Row, Select } from "./TodayRow";

export type WorkTab = "alerts" | "conflicts" | "links" | "updates";
export type FullScreen = "orphan" | "access" | "integrity";

/**
 * طابور «اليوم»: قائمةٌ واحدة لكل ما ينتظر قراراً، ولوحٌ جانبي للقرار. الإدارة ترى
 * الصندوق وطوابير الدول كلّها؛ فريق الدولة يرى بنود دوله وحدها (`scope="country"`).
 * لوحة المفاتيح: j/k للتنقّل، Enter للفتح، a للحسم، r للرفض، / للبحث، ? للمساعدة.
 */
export function TodayQueue({
  access,
  scope,
  filters,
  setFilters,
  onOpenCountry,
  onOpenFull,
  onOpenTrust,
}: {
  access: CountryAccess;
  scope: "admin" | "country";
  filters: Filters;
  setFilters: (patch: Partial<Filters>) => void;
  onOpenCountry: (code: string, tab: WorkTab) => void;
  onOpenFull?: (screen: FullScreen) => void;
  /** يعرض مؤشّرات «اليوم» الأربعة (للإدارة: `getTrustOverview` لها وحدها). */
  onOpenTrust?: () => void;
}) {
  const t = useCopy(TODAY_COPY);
  const locale = useLocale();
  const demo = useDemo();
  const Heading = scope === "country" ? "h2" : "h3";
  const GroupHeading = scope === "country" ? "h3" : "h4";
  const {
    items,
    total,
    queueTotal,
    hasMore: serverMore,
    loadMore: serverLoad,
    loadingMore,
    pending,
    failed,
    refetch,
  } = useToday(access);
  // عشرون صفاً في كلّ دفعة، مجموعةً عبر الطوابير؛ «عرض المزيد» يكشف ما وصل ثمّ يطلب ما بعده.
  const [rows, setRows] = useState(TODAY_ROWS);
  const [now] = useState(() => Date.now());
  const shown = useMemo(
    () => applyFilters(items, filters, matchesQuery, now),
    [items, filters, now],
  );
  const grouped = useMemo(() => {
    const all: Record<Group, QueueItem[]> = { overdue: [], today: [], waiting: [] };
    for (const it of shown) all[groupOf(it, now)].push(it);
    const g: Record<Group, QueueItem[]> = { overdue: [], today: [], waiting: [] };
    let left = rows;
    for (const k of GROUPS) {
      g[k] = all[k].slice(0, Math.max(left, 0));
      left -= g[k].length;
    }
    return g;
  }, [shown, now, rows]);
  const ordered = useMemo(() => GROUPS.flatMap((g) => grouped[g]), [grouped]);
  const hasMore = shown.length > ordered.length || serverMore;
  const loadMore = () => {
    if (shown.length <= rows + TODAY_ROWS && serverMore) serverLoad();
    setRows((r) => r + TODAY_ROWS);
  };

  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<{ item: QueueItem; reject: boolean } | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [live, setLive] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const refocus = useRef<number | null>(null);

  const settle = useSettle();

  const focusRow = (i: number) => {
    const rows = listRef.current?.querySelectorAll<HTMLElement>("[data-row]");
    const el = rows?.[Math.min(Math.max(i, 0), rows.length - 1)];
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  };

  // بعد القرار يعود التركيز إلى الصفّ الذي حلّ محلّ المحسوم: التالي في القائمة.
  useEffect(() => {
    if (refocus.current === null) return;
    const i = Math.min(refocus.current, ordered.length - 1);
    refocus.current = null;
    setActive(Math.max(i, 0));
    if (i >= 0) requestAnimationFrame(() => focusRow(i));
  }, [ordered]);

  const done = (idx: number) => {
    refocus.current = idx;
    setLive(idx < ordered.length - 1 ? t.settled : t.settledLast);
    setOpen(null);
  };

  const trySettle = (it: QueueItem, idx: number) => {
    if (!it.can_settle) {
      toast.info(it.settle_block_reason === "own_upload" ? t.ownHint : t.scopeHint);
      return;
    }
    if (!directSettle(it)) return setOpen({ item: it, reject: false });
    settle.mutate(
      it.source === "alert"
        ? { kind: "alert", id: it.id, status: "reviewed" }
        : { kind: "conflict", id: it.id, choice: "accept" },
      { onSuccess: (res) => void (res.ok && done(idx)) },
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    if (typing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "/") {
      e.preventDefault();
      searchRef.current?.focus();
      return;
    }
    if (e.key === "?") {
      e.preventDefault();
      setHelp((h) => !h);
      return;
    }
    const row = target.closest<HTMLElement>("[data-row]");
    if (!row || row !== target) return;
    const idx = Number(row.dataset["idx"]);
    const it = ordered[idx];
    if (!it) return;
    if (e.key === "j" || e.key === "ArrowDown" || e.key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = idx + (e.key === "j" || e.key === "ArrowDown" ? 1 : -1);
      const i = Math.min(Math.max(next, 0), ordered.length - 1);
      setActive(i);
      focusRow(i);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const i = e.key === "Home" ? 0 : ordered.length - 1;
      setActive(i);
      focusRow(i);
    } else if (e.key === "Enter") {
      e.preventDefault();
      setOpen({ item: it, reject: false });
    } else if (e.key === "a") {
      e.preventDefault();
      trySettle(it, idx);
    } else if (e.key === "r") {
      e.preventDefault();
      if (!it.can_settle) trySettle(it, idx);
      else setOpen({ item: it, reject: true });
    }
  };

  const countries = useMemo(
    () => [...new Set(items.map((i) => i.country_code).filter((c): c is string => !!c))].sort(),
    [items],
  );
  const kinds = useMemo(() => [...new Set(items.map((i) => i.kind))], [items]);
  const filtered = FILTER_KEYS.some((k) => filters[k] !== NO_FILTERS[k]);
  let idx = 0;

  return (
    <section aria-labelledby="today-title" onKeyDown={onKeyDown}>
      {scope === "admin" && onOpenTrust && (
        <TodayTiles items={items} onFilter={setFilters} onOpenTrust={onOpenTrust} />
      )}
      {scope === "country" && (
        <CountryTodayStrip items={items} access={access} now={now} onFilter={setFilters} />
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          {/* بوّابة الدولة لا عنوانَ ثانياً فوقها، فاليوم فيها h2 (ترتيب العناوين) */}
          <Heading id="today-title" className="font-display text-xl font-bold">
            {t.title}
            <span className="text-muted-foreground ms-2 text-sm font-medium tabular-nums">
              {t.items(total)}
            </span>
          </Heading>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-7 text-pretty">
            {scope === "admin" ? t.lead : t.leadCountry}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          aria-expanded={help}
          onClick={() => setHelp((h) => !h)}
        >
          <Keyboard className="size-4" aria-hidden="true" />
          {t.help}
        </Button>
      </div>
      {help && (
        <ul className="bg-secondary/60 mt-3 grid gap-1 rounded-xl p-3 text-xs sm:grid-cols-2">
          {Object.values(t.keys).map((k) => (
            <li key={k}>
              <bdi>{k}</bdi>
            </li>
          ))}
        </ul>
      )}

      <div
        role="group"
        aria-label={t.filters}
        className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-2"
      >
        <label className="min-w-0 flex-1 basis-56">
          <span className="sr-only">{t.search}</span>
          <input
            ref={searchRef}
            type="search"
            value={filters.q}
            placeholder={t.search}
            onChange={(e) => setFilters({ q: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Escape" || (e.key === "Enter" && ordered.length)) {
                e.preventDefault();
                focusRow(0);
              }
            }}
            className="border-border bg-background focus-visible:ring-ring min-h-11 w-full rounded-xl border px-3 text-base focus-visible:ring-2 focus-visible:outline-none md:text-sm"
          />
        </label>
        <Select
          label={t.kind}
          value={filters.kind}
          onChange={(v) => setFilters({ kind: v })}
          all={t.allKinds}
          options={[
            ...kinds.map((k) => ({ value: k, label: t.kinds[k] })),
            ...Object.keys(KIND_GROUPS)
              .filter((g) => KIND_GROUPS[g]!.some((k) => kinds.includes(k)) || filters.kind === g)
              .map((g) => ({ value: g, label: t.kindGroups[g as keyof typeof t.kindGroups] })),
          ]}
        />
        {countries.length > 1 && (
          <Select
            label={t.country}
            value={filters.country}
            onChange={(v) => setFilters({ country: v })}
            all={t.allCountries}
            options={countries.map((c) => ({ value: c, label: countryName(c, locale) }))}
          />
        )}
        <Select
          label={t.severity}
          value={filters.sev}
          onChange={(v) => setFilters({ sev: v })}
          all={t.allSeverities}
          options={[
            { value: "critical", label: t.critical },
            { value: "normal", label: t.normal },
          ]}
        />
        <Select
          label={t.age}
          value={filters.age}
          onChange={(v) => setFilters({ age: v })}
          all={t.allAges}
          options={(["overdue", "lt1", "d1_3", "d3_7", "gt7"] as const).map((a) => ({
            value: a,
            label: t.ages[a],
          }))}
        />
        <label className="border-border bg-background inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm">
          <input
            type="checkbox"
            checked={filters.settle}
            onChange={(e) => setFilters({ settle: e.target.checked })}
            className="size-4"
            style={{ accentColor: "var(--primary)" }}
          />
          {t.settleable}
        </label>
        {filtered && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11"
            onClick={() => setFilters(NO_FILTERS)}
          >
            {t.clear}
          </Button>
        )}
      </div>

      {failed && (
        <div className="mt-3">
          <Failed
            title={scope === "country" ? t.failedCountry : t.failed}
            retry={t.retry}
            onRetry={refetch}
          />
        </div>
      )}

      <p className="text-muted-foreground mt-4 text-xs tabular-nums" aria-live="polite">
        {pending
          ? scope === "country"
            ? t.loadingCountry
            : t.loading
          : t.shown.replace("{0}", String(shown.length)).replace("{1}", String(items.length))}
      </p>

      <div ref={listRef} className="mt-2 space-y-6">
        {pending && items.length === 0 && <PanelSkeleton shape="rows" count={4} />}
        {!pending && !failed && shown.length === 0 && (
          <Quiet
            title={filtered ? t.emptyFiltered : scope === "country" ? t.emptyCountry : t.empty}
            text={
              filtered
                ? t.emptyFilteredNext
                : scope !== "country"
                  ? t.emptyNext
                  : access.countries.some((k) => k.role !== "viewer")
                    ? t.emptyCountryNext
                    : t.emptyViewer
            }
          />
        )}
        {GROUPS.map((g) =>
          grouped[g].length === 0 ? null : (
            <section key={g} aria-labelledby={`today-g-${g}`}>
              <GroupHeading
                id={`today-g-${g}`}
                className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold"
              >
                {g === "overdue" && (
                  <Clock className="text-destructive size-4 self-center" aria-hidden="true" />
                )}
                {g === "waiting" && (
                  <Users className="text-muted-foreground size-4 self-center" aria-hidden="true" />
                )}
                {t.groups[g]}
                <span className="text-muted-foreground font-medium tabular-nums">
                  {grouped[g].length}
                </span>
              </GroupHeading>
              <p className="text-muted-foreground mt-0.5 text-xs leading-6">{t.groupHint[g]}</p>
              <ul aria-label={t.groups[g]} className="mt-2 space-y-2">
                {grouped[g].map((it) => {
                  const i = idx++;
                  return (
                    <Row
                      key={it.key}
                      it={it}
                      idx={i}
                      active={i === active}
                      now={now}
                      busy={settle.isPending}
                      onFocus={() => setActive(i)}
                      onOpen={() => setOpen({ item: it, reject: false })}
                      onSettle={() => trySettle(it, i)}
                    />
                  );
                })}
              </ul>
            </section>
          ),
        )}
      </div>
      <LoadMore
        hasMore={hasMore}
        loadingMore={loadingMore}
        loadMore={loadMore}
        shown={ordered.length}
        total={total}
      />
      <p className="sr-only" aria-live="polite">
        {live}
      </p>

      <Sheet open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent
          side={dirOf(locale) === "rtl" ? "left" : "right"}
          className="w-full overflow-y-auto sm:max-w-xl"
        >
          {open && (
            <Detail
              item={open.item}
              reject={open.reject}
              demo={demo}
              busy={settle.isPending}
              onSettle={(v) =>
                settle.mutate(v, {
                  onSuccess: (res) => void (res.ok && done(ordered.indexOf(open.item))),
                })
              }
              onInboxDone={() => done(ordered.indexOf(open.item))}
              onOpenFile={(id) => setFileId(id)}
              onOpenCountry={(tab) => {
                const code = open.item.country_code;
                setOpen(null);
                if (code) onOpenCountry(code, tab);
              }}
              onOpenFull={
                onOpenFull
                  ? (s) => {
                      setOpen(null);
                      onOpenFull(s);
                    }
                  : undefined
              }
            />
          )}
        </SheetContent>
      </Sheet>
      <ChildFileSheet id={fileId} onClose={() => setFileId(null)} />
    </section>
  );
}
