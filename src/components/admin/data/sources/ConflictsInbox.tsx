import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { Button } from "@/components/ui/button";
import {
  bulkEligible,
  matchesQuery,
  MAX_BULK,
  topFailure,
  type BulkChoice,
} from "@/lib/golden-record";
import {
  listConflicts,
  resolveConflict,
  resolveConflictsBulk,
} from "@/lib/golden-record.functions";
import { useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { ACCENT, Busy, CARD, Failed, NeedsUpdate, Pill, SectionHead } from "../shared";
import { SOURCES_COPY } from "../sources-copy";
import { WORK_COPY } from "../work-copy";
import { FilterBar, ROW_FOCUS, useListKeys, useWorkErr } from "../WorkTools";
import { Val, V, fieldOptions, OpenFile } from "./shared";
import { LoadMore, QUEUE_PAGE, useKeysetList } from "../keyset";

export function Conflicts({
  country,
  canApprove,
  onOpen,
}: {
  country: string;
  canApprove: boolean;
  onOpen: (orphanId: string) => void;
}) {
  const c = useCopy(SOURCES_COPY);
  const w = useCopy(WORK_COPY);
  const err = useWorkErr();
  const qc = useQueryClient();
  const dk = useDataKey([]);
  const fetchList = useDataFn("golden.conflicts", listConflicts);
  const list = useKeysetList(useDataKey(["golden-conflicts", country]), (after) =>
    fetchList({ data: { country, after, limit: QUEUE_PAGE } }),
  );
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: [...dk, "golden-conflicts"] });
    void qc.invalidateQueries({ queryKey: [...dk, "data-health"] });
    void qc.invalidateQueries({ queryKey: [...dk, "child-file"] });
    void qc.invalidateQueries({ queryKey: [...dk, "queue-counts"] });
    void qc.invalidateQueries({ queryKey: [...dk, "decision-log"] });
  };
  const resolve = useDataFn("golden.resolveConflict", resolveConflict);
  const m = useMutation({
    mutationFn: (v: { id: string; choice: "accept" | "keep" | "use_wamy" | "use_office" }) =>
      resolve({ data: v }),
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      toast.success(c.done);
      refresh();
    },
  });
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const bulkFn = useDataFn("golden.resolveConflictsBulk", resolveConflictsBulk);
  const bulk = useMutation({
    mutationFn: (v: { ids: string[]; choice: BulkChoice }) => bulkFn({ data: v }),
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      if (res.data.done > 0) toast.success(w.bulkDone(res.data.done));
      if (res.data.failed > 0)
        toast.error(w.bulkFailed(res.data.failed, err(topFailure(res.data))));
      setPicked(new Set(res.data.results.filter((x) => !x.ok).map((x) => x.id)));
      refresh();
    },
  });
  const [query, setQuery] = useState("");
  const [field, setField] = useState("");
  const [risk, setRisk] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const all = list.data?.ok ? list.data.data : [];
  const items = all.filter(
    (d) =>
      (!field || d.field === field) &&
      (!risk || d.risk === risk) &&
      matchesQuery(query, d.code, d.name),
  );
  const eligible = items.filter(bulkEligible);
  const chosen = all.filter((d) => picked.has(d.id) && bulkEligible(d));
  const allOn = eligible.length > 0 && eligible.every((d) => picked.has(d.id));
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const keys = useListKeys({
    search,
    onOpen: (i) => items[i] && onOpen(items[i].orphan_id),
    onToggle: canApprove
      ? (i) => items[i] && bulkEligible(items[i]) && toggle(items[i].id)
      : undefined,
  });
  const busy = m.isPending || bulk.isPending;
  const choiceName: Record<BulkChoice, string> = {
    use_wamy: c.useWamy,
    use_office: c.useOffice,
    keep: c.keep,
  };
  function runBulk(choice: BulkChoice) {
    const ids = chosen.slice(0, MAX_BULK).map((d) => d.id);
    if (ids.length === 0) return;
    if (!window.confirm(w.bulkConfirm(ids.length, choiceName[choice]))) return;
    bulk.mutate({ ids, choice });
  }

  return (
    <section aria-labelledby="conflicts-title" onKeyDown={keys.onKeyDown}>
      <SectionHead title={c.conflictsTitle} hint={c.conflictsHint} />
      {list.isPending ? (
        <Busy />
      ) : !list.data?.ok ? (
        list.data?.missing ? (
          <NeedsUpdate />
        ) : (
          <Failed onRetry={() => void list.refetch()} />
        )
      ) : all.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{c.noConflicts}</p>
      ) : (
        <>
          <FilterBar
            query={query}
            setQuery={setQuery}
            placeholder={w.search}
            inputRef={search}
            shown={items.length}
            total={all.length}
            filters={[
              {
                id: "field",
                label: w.fieldFilter,
                value: field,
                set: setField,
                all: w.allFields,
                options: fieldOptions(all, c.fields),
              },
              {
                id: "risk",
                label: w.riskFilter,
                value: risk,
                set: setRisk,
                all: w.allRisks,
                options: (["critical", "medium", "low"] as const).map((r) => ({
                  value: r,
                  label: w.risks[r]!,
                })),
              },
            ]}
          />
          {canApprove && eligible.length > 0 && (
            <div
              role="region"
              aria-label={w.bulkLabel}
              className={cn(
                CARD,
                "sticky bottom-3 z-10 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 p-3 sm:static",
                chosen.length > 0 && "ring-2 ring-primary/50",
              )}
            >
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allOn}
                  onChange={() =>
                    setPicked((s) => {
                      const n = new Set(s);
                      for (const d of eligible) {
                        if (allOn) n.delete(d.id);
                        else n.add(d.id);
                      }
                      return n;
                    })
                  }
                  style={ACCENT}
                  className="size-5"
                  aria-label={w.selectAll}
                />
                <span className="font-bold tabular-nums">{w.selected(chosen.length)}</span>
              </label>
              {chosen.length > 0 && (
                <div className="flex w-full flex-wrap gap-2 sm:ms-auto sm:w-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11 flex-1 sm:flex-none"
                    disabled={busy}
                    onClick={() => runBulk("use_wamy")}
                  >
                    {w.bulkWamy}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11 flex-1 sm:flex-none"
                    disabled={busy}
                    onClick={() => runBulk("use_office")}
                  >
                    {w.bulkOffice}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-11 flex-1 sm:flex-none"
                    disabled={busy}
                    onClick={() => runBulk("keep")}
                  >
                    {w.bulkKeep}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => setPicked(new Set())}
                  >
                    {w.bulkClear}
                  </Button>
                </div>
              )}
              <p className="w-full text-xs text-muted-foreground">
                {w.bulkCriticalNote}
                {chosen.length > MAX_BULK && <> {w.bulkMax(MAX_BULK)}</>}
              </p>
            </div>
          )}
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{w.noMatch}</p>
          ) : (
            <div ref={keys.root}>
              <ul className="mt-4 space-y-3">
                {items.map((d) => {
                  const can = canApprove && bulkEligible(d);
                  const on = picked.has(d.id);
                  return (
                    <li
                      key={d.id}
                      data-row=""
                      tabIndex={0}
                      aria-label={`${c.fields[d.field] ?? d.field} · ${d.code} · ${d.name}`}
                      className={cn(
                        CARD,
                        ROW_FOCUS,
                        "p-4",
                        d.risk === "critical" && "ring-1 ring-destructive/40",
                        on && "ring-2 ring-primary",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {can && (
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(d.id)}
                            style={ACCENT}
                            className="-my-2 size-5 shrink-0 cursor-pointer p-3"
                            aria-label={w.selectItem(c.fields[d.field] ?? d.field, d.code)}
                          />
                        )}
                        {d.risk === "critical" && (
                          <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
                        )}
                        <span className="font-bold">{c.fields[d.field] ?? d.field}</span>
                        <Pill tone={d.risk === "critical" ? "wine" : "quiet"}>
                          {c.kinds[d.kind]}
                        </Pill>
                        <span className="text-xs text-muted-foreground">{w.risks[d.risk]}</span>
                        <span className="ms-auto min-w-0 truncate text-xs text-muted-foreground">
                          <Val>{d.code}</Val> · <bdi dir="auto">{d.name}</bdi>
                        </span>
                      </div>
                      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                        <div className="min-w-0">
                          <dt className="text-xs text-muted-foreground">{c.current}</dt>
                          <dd className="font-medium [overflow-wrap:anywhere]">
                            <V v={d.current} />
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted-foreground">{c.roles.wamy}</dt>
                          <dd className="[overflow-wrap:anywhere]">
                            <V v={d.wamy} />
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted-foreground">{c.roles.office}</dt>
                          <dd className="[overflow-wrap:anywhere]">
                            <V v={d.office} />
                          </dd>
                        </div>
                      </dl>
                      {d.kind === "held_locked" && (
                        <p className="mt-2 text-xs text-muted-foreground">{c.lockedHint}</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canApprove &&
                          (d.kind === "disagreement" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="min-h-11"
                                disabled={busy}
                                onClick={() => m.mutate({ id: d.id, choice: "use_wamy" })}
                              >
                                {c.useWamy}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="min-h-11"
                                disabled={busy}
                                onClick={() => m.mutate({ id: d.id, choice: "use_office" })}
                              >
                                {c.useOffice}
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              className="min-h-11"
                              disabled={busy}
                              onClick={() => m.mutate({ id: d.id, choice: "accept" })}
                            >
                              {c.accept}: <V v={d.proposed} />
                            </Button>
                          ))}
                        {canApprove && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-11"
                            disabled={busy}
                            onClick={() => m.mutate({ id: d.id, choice: "keep" })}
                          >
                            {c.keep}
                          </Button>
                        )}
                        <span className="ms-auto">
                          <OpenFile id={d.orphan_id} onOpen={onOpen} />
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
      <LoadMore {...list} shown={all.length} />
    </section>
  );
}
