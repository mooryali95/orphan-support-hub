import { useQuery } from "@tanstack/react-query";
import { History, Lock, Search, ShieldAlert, X } from "lucide-react";
import { useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { formatDate } from "@/lib/format";
import {
  changesOf,
  showValue,
  sourcesDiffer,
  type ChildFile,
  type ChildFileField,
  type FieldValue,
} from "@/lib/golden-record";
import { getChildFile } from "@/lib/golden-record.functions";
import { useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

import { Busy, CARD, Failed, NeedsUpdate, Pill, SELECT } from "./shared";
import { SOURCES_COPY } from "./sources-copy";
import { FreezeControl } from "./sources/KillSwitches";
import { WORK_COPY } from "./work-copy";
import { DecisionTimeline } from "../decisions/DecisionTimeline";

/** رمز خطأٍ من القاعدة ← جملة، من نصوص الخانتين معاً. */
export function useWorkErr() {
  const s = useCopy(SOURCES_COPY);
  const w = useCopy(WORK_COPY);
  return (code: string | null | undefined) =>
    w.errors[code ?? ""] ?? s.errors[code ?? ""] ?? s.errors["failed"]!;
}

type Choice = { value: string; label: string };

/** شريط البحث والمرشّحات داخل كل لسان. «/» يركّز البحث من أي مكانٍ في اللسان. */
export function FilterBar({
  query,
  setQuery,
  placeholder,
  inputRef,
  filters,
  shown,
  total,
}: {
  query: string;
  setQuery: (q: string) => void;
  placeholder: string;
  inputRef: RefObject<HTMLInputElement | null>;
  filters: Array<{
    id: string;
    label: string;
    value: string;
    set: (v: string) => void;
    all: string;
    options: Choice[];
  }>;
  shown: number;
  total: number;
}) {
  const w = useCopy(WORK_COPY);
  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.stopPropagation();
                setQuery("");
              }
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            className={cn(SELECT, "ps-9 pe-11")}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label={w.clear}
              className="absolute end-0 top-0 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {filters.map((f) => (
          <select
            key={f.id}
            aria-label={f.label}
            value={f.value}
            onChange={(e) => f.set(e.target.value)}
            className={cn(SELECT, "sm:w-44")}
          >
            <option value="">{f.all}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
      </div>
      <p
        className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground"
        aria-live="polite"
      >
        <span className="tabular-nums">{w.shown(shown, total)}</span>
        <span className="hidden gap-3 md:inline-flex">
          {(
            [
              ["j k", w.keysMove],
              ["Enter", w.keysOpen],
              ["x", w.keysPick],
              ["/", w.keysFind],
            ] as const
          ).map(([k, label]) => (
            <span key={k} className="inline-flex items-center gap-1">
              <kbd dir="ltr" className="rounded border border-border px-1 font-mono text-[11px]">
                {k}
              </kbd>
              {label}
            </span>
          ))}
        </span>
      </p>
    </div>
  );
}

/**
 * تنقّلٌ بلوحة المفاتيح بين صفوف قائمة (`[data-row]`): j/k والأسهم، Enter يفتح،
 * x يحدّد، و«/» يركّز البحث. لا شيء يتحرّك: التركيز وحده ينتقل.
 */
export function useListKeys(opts: {
  search: RefObject<HTMLInputElement | null>;
  onOpen: (idx: number) => void;
  onToggle?: ((idx: number) => void) | undefined;
}) {
  const root = useRef<HTMLDivElement>(null);
  function rows() {
    return Array.from(root.current?.querySelectorAll<HTMLElement>("[data-row]") ?? []);
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
    if (e.key === "/" && !typing) {
      e.preventDefault();
      opts.search.current?.focus();
      return;
    }
    if (typing || e.altKey || e.ctrlKey || e.metaKey) return;
    const list = rows();
    const row = t.closest<HTMLElement>("[data-row]");
    const at = row ? list.indexOf(row) : -1;
    if (e.key === "j" || e.key === "ArrowDown" || e.key === "k" || e.key === "ArrowUp") {
      if (row && t !== row) return; // الأسهم داخل زرٍّ في الصف تبقى للزرّ
      e.preventDefault();
      const down = e.key === "j" || e.key === "ArrowDown";
      const next = list[Math.min(Math.max(at + (down ? 1 : -1), 0), list.length - 1)];
      next?.focus();
      next?.scrollIntoView({ block: "nearest" });
    } else if (row && t === row && e.key === "Enter") {
      e.preventDefault();
      opts.onOpen(at);
    } else if (row && opts.onToggle && (e.key === "x" || (e.key === " " && t === row))) {
      e.preventDefault();
      opts.onToggle(at);
    }
  }
  return { root, onKeyDown };
}

export const ROW_FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/* ── ملف الطفل الموحّد ─────────────────────────────────────────── */

function Shown({ v }: { v: FieldValue | undefined }) {
  const s = useCopy(SOURCES_COPY);
  const t = showValue(v, s.yes, s.no, "·");
  return t === "·" ? (
    <span className="text-muted-foreground">·</span>
  ) : (
    <bdi dir="auto" className="font-medium [overflow-wrap:anywhere]">
      {t}
    </bdi>
  );
}

function When({ iso }: { iso: string | null }) {
  const locale = useLocale();
  if (!iso) return null;
  return (
    <bdi dir="auto" className="tabular-nums">
      {formatDate(iso, locale)}
    </bdi>
  );
}

function SourceCell({
  label,
  obs,
  differ,
}: {
  label: string;
  obs: ChildFileField["wamy"];
  differ: boolean;
}) {
  const w = useCopy(WORK_COPY);
  return (
    <div className={cn("min-w-0 rounded-xl p-2.5", differ ? "bg-primary/5" : "bg-secondary/60")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">
        {obs ? (
          <Shown v={obs.value} />
        ) : (
          <span className="text-muted-foreground">{w.notReceived}</span>
        )}
      </dd>
      {obs && (
        <dd className="mt-1 text-xs text-muted-foreground">
          {w.observedAt} <When iso={obs.observed_at} />
        </dd>
      )}
    </div>
  );
}

function FieldBlock({ f, file }: { f: ChildFileField; file: ChildFile }) {
  const s = useCopy(SOURCES_COPY);
  const w = useCopy(WORK_COPY);
  const changes = changesOf(file, f.field);
  const differ = sourcesDiffer(f);
  return (
    <li className={cn(CARD, "p-4", f.open_conflict && "ring-1 ring-primary/40")}>
      <div className="flex flex-wrap items-center gap-2">
        {f.risk === "critical" && (
          <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
        )}
        <h5 className="font-bold">{s.fields[f.field] ?? f.field}</h5>
        {f.open_conflict && <Pill tone="wine">{w.openConflict}</Pill>}
        {!f.open_conflict && differ && <Pill tone="gold">{w.differ}</Pill>}
        {f.pinned && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3" aria-hidden="true" />
            {w.pinned}
          </span>
        )}
        <span className="ms-auto text-xs text-muted-foreground">
          {w.owner}: {s.roles[f.owner]}
        </span>
      </div>
      <div className="mt-3 rounded-xl border border-border p-3">
        <p className="text-xs text-muted-foreground">{w.approved}</p>
        <p className="mt-0.5 text-base">
          <Shown v={f.value} />
        </p>
        {f.from_role && (
          <p className="mt-1 text-xs text-muted-foreground">
            {w.fromRole[f.from_role]}
            {f.applied_at && (
              <>
                {" · "}
                <When iso={f.applied_at} />
              </>
            )}
          </p>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2">
        <SourceCell label={s.roles.wamy} obs={f.wamy} differ={differ} />
        <SourceCell label={s.roles.office} obs={f.office} differ={differ} />
      </dl>
      <details className="group mt-3">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <History className="size-4" aria-hidden="true" />
          {w.history} · <span className="tabular-nums">{w.historyCount(changes.length)}</span>
        </summary>
        {changes.length === 0 ? (
          <p className="pb-1 text-xs text-muted-foreground">{w.noHistory}</p>
        ) : (
          <ol className="space-y-2 border-s border-border ps-3">
            {changes.slice(0, 20).map((h, i) => (
              <li key={`${h.received_at}-${h.role}-${i}`} className="text-sm">
                <p className="text-xs text-muted-foreground">
                  <When iso={h.received_at} /> · {s.roles[h.role]}
                  {h.role === "office" && (
                    <>
                      {" · "}
                      <bdi dir="ltr">{h.source}</bdi>
                    </>
                  )}
                </p>
                <p className="mt-0.5">
                  <span className="text-xs text-muted-foreground">{w.was} </span>
                  <Shown v={h.was} />
                  <span className="text-xs text-muted-foreground"> · {w.became} </span>
                  <Shown v={h.value} />
                </p>
              </li>
            ))}
          </ol>
        )}
      </details>
    </li>
  );
}

/** الملف كما يراه الفريق، في لوحةٍ جانبية من جهة النهاية؛ ورقةٌ كاملة العرض على الجوال. */
export function ChildFileSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const w = useCopy(WORK_COPY);
  const locale = useLocale();
  return (
    <Sheet open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={locale === "ar" ? "left" : "right"}
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl [&>button.absolute]:hidden"
      >
        {id && <ChildFileBody id={id} onClose={onClose} />}
        {!id && (
          <SheetHeader className="sr-only">
            <SheetTitle>{w.fileTitle}</SheetTitle>
            <SheetDescription>{w.fileHint}</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ChildFileBody({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useCopy(SOURCES_COPY);
  const w = useCopy(WORK_COPY);
  const fetchFile = useDataFn("golden.childFile", getChildFile);
  const q = useQuery({
    queryKey: useDataKey(["child-file", id]),
    queryFn: () => fetchFile({ data: { id } }),
  });
  const file = q.data?.ok ? q.data.data : null;
  let body: ReactNode;
  if (q.isPending) body = <Busy />;
  else if (!q.data?.ok)
    body = q.data?.missing ? (
      <NeedsUpdate />
    ) : q.data?.error === "country_forbidden" ? (
      <p
        role="status"
        className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
      >
        {w.fileForbidden}
      </p>
    ) : (
      <Failed onRetry={() => void q.refetch()} />
    );
  else if (file && file.fields.length === 0)
    body = <p className="text-sm text-muted-foreground">{w.fileEmpty}</p>;
  else if (file)
    body = (
      <ul className="space-y-3">
        {file.fields.map((f) => (
          <FieldBlock key={f.field} f={f} file={file} />
        ))}
      </ul>
    );
  return (
    <>
      <SheetHeader className="relative space-y-1 border-b border-border px-5 pb-4 pt-5 text-start sm:text-start">
        <button
          type="button"
          onClick={onClose}
          aria-label={w.close}
          className="absolute end-2 top-2 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-[color,transform] duration-150 hover:text-foreground active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
        <SheetTitle className="pe-10 text-lg leading-7 [text-wrap:balance]">
          {file ? file.name : w.fileTitle}
        </SheetTitle>
        <SheetDescription className="text-xs leading-5">
          {file ? (
            <>
              <bdi dir="ltr" className="font-medium tabular-nums text-foreground">
                {file.code}
              </bdi>
              {file.trust && (
                <>
                  {" · "}
                  {w.trust}: {s.trust[file.trust]}
                </>
              )}
            </>
          ) : (
            w.fileHint
          )}
        </SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        {body}
        <FreezeControl id={id} />
        <DecisionTimeline orphanId={id} />
      </div>
    </>
  );
}
