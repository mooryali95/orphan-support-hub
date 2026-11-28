import { FourEyesNote } from "@/components/admin/FourEyesNote";
import { PanelSkeleton } from "@/components/admin/PanelState";
import { Failed, Quiet } from "@/components/admin/overview/parts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, Clock, Keyboard, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { DecisionPanel } from "@/components/admin/DecisionInbox";
import { SELECT } from "@/components/admin/data/shared";
import { SOURCES_COPY } from "@/components/admin/data/sources-copy";
import { AlertDetail } from "@/components/admin/data/sources/Alerts";
import { V } from "@/components/admin/data/sources/shared";
import { LoadMore } from "@/components/admin/data/keyset";
import { ChildFileSheet, ROW_FOCUS, useWorkErr } from "@/components/admin/data/WorkTools";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { countryName, flagOf } from "@/lib/countries";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { useDemo } from "@/lib/demo-mode";
import { matchesQuery, type CountryAccess } from "@/lib/golden-record";
import { resolveAlert, resolveConflict } from "@/lib/golden-record.functions";
import { dirOf, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

import { TODAY_COPY } from "./copy";
import { TODAY_ROWS } from "@/lib/golden-record";

import { CountryTodayStrip } from "./CountryTodayStrip";
import { TodayTiles } from "./TodayTiles";
import {
  applyFilters,
  filtersFrom,
  groupOf,
  GROUPS,
  isOverdue,
  KIND_GROUPS,
  NO_FILTERS,
  type Filters,
  type Group,
  type QueueItem,
} from "./queue";
import { useToday } from "./useToday";
import { ChildUpdateReview } from "@/components/admin/data/sources/ChildUpdatesCard";
import { FILTER_KEYS } from "./useUrlFilters";

export type WorkTab = "alerts" | "conflicts" | "links" | "updates";
export type FullScreen = "orphan" | "access" | "integrity";

const DAY = 86_400_000;

/** الحسم المباشر لبندٍ: التنبيه «روجِع»، والتغيير الحرج «اعتمد المقترح». غيره يحتاج اختياراً. */
const directSettle = (it: QueueItem) =>
  it.source === "alert" || (it.source === "conflict" && it.conflict?.kind !== "disagreement");

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
        <CountryTodayStrip
          items={items}
          awaiting={queueTotal}
          partial={serverMore}
          now={now}
          onFilter={setFilters}
        />
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h3 id="today-title" className="font-display text-xl font-bold">
            {t.title}
            <span className="text-muted-foreground ms-2 text-sm font-medium tabular-nums">
              {t.items(total)}
            </span>
          </h3>
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
          <Failed title={t.failed} retry={t.retry} onRetry={refetch} />
        </div>
      )}

      <p className="text-muted-foreground mt-4 text-xs tabular-nums" aria-live="polite">
        {pending
          ? t.loading
          : t.shown.replace("{0}", String(shown.length)).replace("{1}", String(items.length))}
      </p>

      <div ref={listRef} className="mt-2 space-y-6">
        {pending && items.length === 0 && <PanelSkeleton shape="rows" count={4} />}
        {!pending && !failed && shown.length === 0 && (
          <Quiet
            title={filtered ? t.emptyFiltered : t.empty}
            text={filtered ? t.emptyFilteredNext : t.emptyNext}
          />
        )}
        {GROUPS.map((g) =>
          grouped[g].length === 0 ? null : (
            <section key={g} aria-labelledby={`today-g-${g}`}>
              <h4
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
              </h4>
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

function Select({
  label,
  value,
  onChange,
  all,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  all: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="text-muted-foreground mb-1 block text-xs font-bold">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(SELECT, "min-h-11")}
      >
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Row({
  it,
  idx,
  active,
  now,
  busy,
  onFocus,
  onOpen,
  onSettle,
}: {
  it: QueueItem;
  idx: number;
  active: boolean;
  now: number;
  busy: boolean;
  onFocus: () => void;
  onOpen: () => void;
  onSettle: () => void;
}) {
  const t = useCopy(TODAY_COPY);
  const locale = useLocale();
  const days = Math.max(0, Math.floor((now - Date.parse(it.created_at)) / DAY));
  const late = it.can_settle && isOverdue(it, now);
  const country = it.country_code ? countryName(it.country_code, locale) : null;
  return (
    <li
      data-row=""
      data-idx={idx}
      tabIndex={active ? 0 : -1}
      onFocus={onFocus}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        onOpen();
      }}
      aria-label={`${t.kinds[it.kind]} · ${it.title}`}
      className={cn(
        "border-border bg-card hover:bg-secondary/30 cursor-pointer rounded-2xl border p-4 transition-colors",
        ROW_FOCUS,
        it.severity === "critical" && "ring-destructive/40 ring-1",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="bg-secondary text-foreground rounded-full px-2.5 py-0.5 text-xs font-bold">
          {t.kinds[it.kind]}
        </span>
        {it.severity === "critical" && (
          <span className="text-destructive inline-flex items-center gap-1 text-xs font-bold">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            {t.critical}
          </span>
        )}
        <span className="min-w-0 flex-1 basis-40">
          <span className="block truncate font-bold">
            {it.title ? <bdi dir="ltr">{it.title}</bdi> : t.countryWide}
          </span>
          {it.subtitle && (
            <span className="text-muted-foreground block truncate text-xs">
              <bdi dir="auto">{it.subtitle}</bdi>
            </span>
          )}
        </span>
        <span className="text-muted-foreground flex shrink-0 items-center gap-3 text-xs">
          {country && (
            <span>
              <span aria-hidden="true">{flagOf(it.country_code!)}</span> {country}
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1 tabular-nums",
              late && "text-destructive font-bold",
            )}
          >
            <Clock className="size-3.5" aria-hidden="true" />
            {days === 0 ? t.waitedToday : t.waited(days)}
          </span>
        </span>
      </div>
      {!it.can_settle ? (
        <p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2 text-xs">
          <span className="text-foreground font-bold">
            {it.settle_block_reason ? t.reasons[it.settle_block_reason] : null}
          </span>
          <span>
            {it.country_code
              ? t.whoSettles.replace("{0}", countryName(it.country_code, locale))
              : t.whoSettlesAny}
          </span>
        </p>
      ) : (
        directSettle(it) && (
          <div className="mt-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            <FourEyesNote className="flex-1" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              tabIndex={-1}
              className="min-h-11"
              disabled={busy}
              onClick={onSettle}
              // the same verb repeats on every row: its name carries the item it settles
              aria-label={`${it.source === "alert" ? t.reviewed : t.acceptProposed} · ${it.title || t.countryWide}`}
            >
              {it.source === "alert" ? t.reviewed : t.acceptProposed}
            </Button>
          </div>
        )
      )}
    </li>
  );
}

type SettleInput =
  | {
      kind: "alert";
      id: string;
      status: "reviewed" | "false_positive" | "confirmed";
      note?: string;
    }
  | {
      kind: "conflict";
      id: string;
      choice: "accept" | "keep" | "use_wamy" | "use_office";
    };

/** الحسم بأبواب «مصادر التحقق» نفسها: القاعدة ترفض ما لا يحقّ، والخطأ يُقرأ بلغة الواجهة. */
function useSettle() {
  const qc = useQueryClient();
  const dk = useDataKey([]);
  const err = useWorkErr();
  const alert = useDataFn("golden.resolveAlert", resolveAlert);
  const conflict = useDataFn("golden.resolveConflict", resolveConflict);
  return useMutation({
    mutationFn: async (v: SettleInput) => {
      const res =
        v.kind === "alert"
          ? await alert({
              data: { id: v.id, status: v.status, ...(v.note ? { note: v.note } : {}) },
            })
          : await conflict({ data: { id: v.id, choice: v.choice } });
      return res as { ok: boolean; error?: string };
    },
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      for (const k of [
        "golden-alerts",
        "golden-conflicts",
        "data-health",
        "child-file",
        "queue-counts",
        "decision-log",
      ])
        void qc.invalidateQueries({ queryKey: [...dk, k] });
      for (const k of ["trust-overview", "trust-aging"])
        void qc.invalidateQueries({ queryKey: [...dk, k] });
    },
  });
}

function Detail({
  item,
  reject,
  demo,
  busy,
  onSettle,
  onInboxDone,
  onOpenFile,
  onOpenCountry,
  onOpenFull,
}: {
  item: QueueItem;
  reject: boolean;
  demo: boolean;
  busy: boolean;
  onSettle: (v: SettleInput) => void;
  onInboxDone: () => void;
  onOpenFile: (id: string) => void;
  onOpenCountry: (tab: WorkTab) => void;
  onOpenFull: ((s: FullScreen) => void) | undefined;
}) {
  const t = useCopy(TODAY_COPY);
  const s = useCopy(SOURCES_COPY);
  const locale = useLocale();
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!reject) return;
    requestAnimationFrame(() => (noteRef.current ?? keepRef.current)?.focus());
  }, [reject]);
  const fields = s.fields as Record<string, string>;

  if (item.source === "inbox" && item.inbox) {
    const full: FullScreen | null =
      item.kind === "orphan"
        ? "orphan"
        : item.kind === "unlock" || item.kind === "discrepancy"
          ? "integrity"
          : null;
    if (!demo && !full) return <DecisionPanel item={item.inbox} onDone={onInboxDone} />;
    return (
      <div className="space-y-4">
        <Head item={item} />
        {full && onOpenFull ? (
          <Button type="button" className="min-h-11" onClick={() => onOpenFull(full)}>
            {t.openFull}
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm leading-7">{t.sampleDecision}</p>
        )}
      </div>
    );
  }

  const blocked = !item.can_settle && (
    <p
      role="note"
      className="border-border bg-secondary/50 rounded-xl border p-3 text-sm leading-7"
    >
      <strong>{item.settle_block_reason ? t.reasons[item.settle_block_reason] : null}</strong>
      {": "}
      {item.settle_block_reason === "own_upload" ? t.ownHint : t.scopeHint}{" "}
      {item.country_code
        ? t.whoSettles.replace("{0}", countryName(item.country_code, locale))
        : t.whoSettlesAny}
    </p>
  );

  return (
    <div className="space-y-4 pb-20 sm:pb-0">
      <Head item={item} />
      {item.update && (
        <ChildUpdateReview item={item.update} canApprove={item.can_settle} onDone={onInboxDone} />
      )}
      {item.alert && (
        <>
          <p className="text-sm">
            <span className="font-bold">{s.signals[item.alert.signal]}</span>
            {" · "}
            {fields[item.alert.field] ?? item.alert.field}
          </p>
          <AlertDetail a={item.alert} />
        </>
      )}
      {item.conflict && (
        <>
          <p className="text-sm">
            <span className="font-bold">{s.kinds[item.conflict.kind]}</span>
            {" · "}
            {fields[item.conflict.field] ?? item.conflict.field}
          </p>
          <dl className="bg-secondary/60 grid grid-cols-2 gap-2 rounded-xl p-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">{s.current}</dt>
              <dd>
                <V v={item.conflict.current} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{s.proposed}</dt>
              <dd>
                <V v={item.conflict.proposed} />
              </dd>
            </div>
          </dl>
        </>
      )}
      {item.link && <p className="text-muted-foreground text-sm leading-7">{t.linkHint}</p>}
      {blocked}

      {item.can_settle && (item.alert || item.conflict) && (
        // شريط القرار ثابتٌ أسفل اللوح على الجوال: الإبهام يصل إليه بلا تمرير.
        <div className="bg-background border-border fixed inset-x-0 bottom-0 z-10 border-t p-3 sm:static sm:border-0 sm:bg-transparent sm:p-0">
          {item.alert ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim())
                  onSettle({ kind: "alert", id: item.id, status: "confirmed", note: note.trim() });
              }}
            >
              <label className="sr-only" htmlFor="today-note">
                {t.rejectNote}
              </label>
              <Textarea
                id="today-note"
                ref={noteRef}
                rows={2}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t.rejectNote}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => onSettle({ kind: "alert", id: item.id, status: "reviewed" })}
                >
                  {t.reviewed}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() =>
                    onSettle({
                      kind: "alert",
                      id: item.id,
                      status: "false_positive",
                      ...(note.trim() ? { note: note.trim() } : {}),
                    })
                  }
                >
                  {t.falsePositive}
                </Button>
                <Button
                  type="submit"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive ms-auto min-h-11"
                  disabled={busy || !note.trim()}
                >
                  {s.confirmFraud}
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              {item.conflict!.kind === "disagreement" ? (
                <>
                  <Button
                    type="button"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => onSettle({ kind: "conflict", id: item.id, choice: "use_wamy" })}
                  >
                    {t.useWamy}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() =>
                      onSettle({ kind: "conflict", id: item.id, choice: "use_office" })
                    }
                  >
                    {t.useOffice}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => onSettle({ kind: "conflict", id: item.id, choice: "accept" })}
                >
                  {t.acceptProposed}
                </Button>
              )}
              <Button
                ref={keepRef}
                type="button"
                variant="ghost"
                className="min-h-11"
                disabled={busy}
                onClick={() => onSettle({ kind: "conflict", id: item.id, choice: "keep" })}
              >
                {t.keepCurrent}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {item.orphan_id && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => onOpenFile(item.orphan_id!)}
          >
            {t.openFile}
          </Button>
        )}
        {item.country_code && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11"
            onClick={() =>
              onOpenCountry(
                item.source === "alert"
                  ? "alerts"
                  : item.source === "conflict"
                    ? "conflicts"
                    : item.source === "update"
                      ? "updates"
                      : "links",
              )
            }
          >
            {t.openCountry}
          </Button>
        )}
      </div>
    </div>
  );
}

function Head({ item }: { item: QueueItem }) {
  const t = useCopy(TODAY_COPY);
  const locale = useLocale();
  return (
    <SheetHeader className="pe-10 text-start">
      <SheetTitle className="flex flex-wrap items-center gap-2">
        {t.kinds[item.kind]}
        {item.severity === "critical" && (
          <span className="text-destructive inline-flex items-center gap-1 text-sm">
            <AlertTriangle className="size-4" aria-hidden="true" />
            {t.critical}
          </span>
        )}
      </SheetTitle>
      <SheetDescription>
        {item.title ? <bdi dir="ltr">{item.title}</bdi> : t.countryWide}
        {item.subtitle ? (
          <>
            {" · "}
            <bdi dir="auto">{item.subtitle}</bdi>
          </>
        ) : null}
        {item.country_code ? ` · ${countryName(item.country_code, locale)}` : null}
      </SheetDescription>
    </SheetHeader>
  );
}
