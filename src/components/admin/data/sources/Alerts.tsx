import { FourEyesNote } from "@/components/admin/FourEyesNote";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { Button } from "@/components/ui/button";
import { matchesQuery, type DataAlert } from "@/lib/golden-record";
import { listAlerts, resolveAlert } from "@/lib/golden-record.functions";
import { useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { Busy, CARD, Failed, NeedsUpdate, Pill, SectionHead } from "../shared";
import { SOURCES_COPY } from "../sources-copy";
import { WORK_COPY } from "../work-copy";
import { FilterBar, ROW_FOCUS, useListKeys, useWorkErr } from "../WorkTools";
import { Val, OpenFile } from "./shared";
import { LoadMore, QUEUE_PAGE, useKeysetList } from "../keyset";

export function AlertDetail({ a }: { a: DataAlert }) {
  const c = useCopy(SOURCES_COPY);
  const d = a.detail;
  const str = (k: string) => (d[k] === undefined || d[k] === null ? null : String(d[k]));
  const from = str("from");
  const to = str("to") ?? str("back_to");
  const notes: string[] = [];
  if (typeof d["days"] === "number" && d["days"] !== 0)
    notes.push(
      (d["days"] < 0 ? c.alertOlder : c.alertYounger)((Math.abs(d["days"]) / 365.25).toFixed(1)),
    );
  if (d["crosses_adulthood"] === true) notes.push(c.alertAdult);
  if (typeof d["distance"] === "number") notes.push(c.alertDistance(d["distance"]));
  if (typeof d["files"] === "number" && typeof d["population"] === "number")
    notes.push(c.alertFiles(d["files"], d["population"]));
  if (a.hits > 1) notes.push(c.hitsPlural(a.hits));
  return (
    <div className="mt-3 space-y-2 text-sm">
      {(from !== null || to !== null) && (
        <dl className="grid max-w-md grid-cols-2 gap-2 rounded-xl bg-secondary/60 p-3">
          <div>
            <dt className="text-xs text-muted-foreground">{c.alertFrom}</dt>
            <dd>{from !== null ? <Val>{from}</Val> : "·"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{c.alertTo}</dt>
            <dd>{to !== null ? <Val>{to}</Val> : "·"}</dd>
          </div>
        </dl>
      )}
      {str("other_code") !== null && (
        <p>
          {c.alertOther}: <Val>{str("other_code")!}</Val> · {str("other_name")}
        </p>
      )}
      {notes.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {notes.map((n) => (
            <li key={n} className={n === c.alertAdult ? "font-bold text-destructive" : undefined}>
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** حسم تنبيه: «روجِع» هو الشائع، والتأكيد خطوةٌ ثانية بسببٍ مكتوب لا زرٌّ أحمر في كل بطاقة. */
export function AlertActions({
  busy,
  onSettle,
}: {
  busy: boolean;
  onSettle: (status: "reviewed" | "false_positive" | "confirmed", note?: string) => void;
}) {
  const c = useCopy(SOURCES_COPY);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  if (confirming)
    return (
      <form
        className="mt-3 space-y-2 rounded-xl border border-destructive/40 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) onSettle("confirmed", note.trim());
        }}
      >
        <label className="block text-sm font-bold" htmlFor="confirm-note">
          {c.confirmTitle}
        </label>
        <textarea
          id="confirm-note"
          autoFocus
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={c.confirmNote}
          className="w-full rounded-md border border-input bg-background p-2 text-base md:text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            className="min-h-11"
            disabled={busy || !note.trim()}
          >
            {c.confirmSubmit}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11"
            onClick={() => setConfirming(false)}
          >
            {c.cancel}
          </Button>
        </div>
      </form>
    );
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <FourEyesNote className="basis-full" />
      <Button size="sm" className="min-h-11" disabled={busy} onClick={() => onSettle("reviewed")}>
        {c.reviewed}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="min-h-11"
        disabled={busy}
        onClick={() => onSettle("false_positive")}
      >
        {c.falsePositive}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="ms-auto min-h-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        {c.confirmFraud}
      </Button>
    </div>
  );
}

export function Alerts({
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
  const [query, setQuery] = useState("");
  const [field, setField] = useState("");
  const [severity, setSeverity] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const dk = useDataKey([]);
  const fetchList = useDataFn("golden.alerts", listAlerts);
  const list = useKeysetList(useDataKey(["golden-alerts", country]), (after) =>
    fetchList({ data: { country, after, limit: QUEUE_PAGE } }),
  );
  const resolve = useDataFn("golden.resolveAlert", resolveAlert);
  const m = useMutation({
    mutationFn: (v: {
      id: string;
      status: "reviewed" | "false_positive" | "confirmed";
      note?: string;
    }) => resolve({ data: v }),
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      toast.success(c.done);
      void qc.invalidateQueries({ queryKey: [...dk, "golden-alerts"] });
      void qc.invalidateQueries({ queryKey: [...dk, "data-health"] });
      void qc.invalidateQueries({ queryKey: [...dk, "queue-counts"] });
      void qc.invalidateQueries({ queryKey: [...dk, "today-strip"] });
      void qc.invalidateQueries({ queryKey: [...dk, "decision-log"] });
    },
  });
  const all = list.data?.ok ? list.data.data : [];
  const items = all.filter(
    (a) =>
      (!field || a.field === field) &&
      (!severity || a.severity === severity) &&
      matchesQuery(query, a.code, a.name),
  );
  const keys = useListKeys({
    search,
    onOpen: (i) => {
      const id = items[i]?.orphan_id;
      if (id) onOpen(id);
    },
  });
  const fieldName = (f: string) => c.fields[f] ?? (f === "identity" ? c.groups.identity : f);

  return (
    <section aria-labelledby="alerts-title" onKeyDown={keys.onKeyDown}>
      <SectionHead title={c.alertsTitle} hint={c.alertsHint} />
      {list.isPending ? (
        <Busy />
      ) : !list.data?.ok ? (
        list.data?.missing ? (
          <NeedsUpdate />
        ) : (
          <Failed onRetry={() => void list.refetch()} />
        )
      ) : all.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{c.noAlerts}</p>
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
                options: [...new Set(all.map((a) => a.field))].map((f) => ({
                  value: f,
                  label: fieldName(f),
                })),
              },
              {
                id: "severity",
                label: w.severityFilter,
                value: severity,
                set: setSeverity,
                all: w.allSeverities,
                options: (["critical", "warning", "info"] as const).map((s) => ({
                  value: s,
                  label: c.severities[s],
                })),
              },
            ]}
          />
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{w.noMatch}</p>
          ) : (
            <div ref={keys.root}>
              <ul className="mt-4 space-y-3">
                {items.map((a) => (
                  <li
                    key={a.id}
                    data-row=""
                    tabIndex={0}
                    aria-label={`${c.signals[a.signal]} · ${a.code ?? c.countryWide}`}
                    className={cn(
                      CARD,
                      ROW_FOCUS,
                      "p-4",
                      a.severity === "critical" && "ring-1 ring-destructive/40",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {a.severity === "critical" && (
                        <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
                      )}
                      <span className="font-bold">{c.signals[a.signal]}</span>
                      <Pill
                        tone={
                          a.severity === "critical"
                            ? "wine"
                            : a.severity === "warning"
                              ? "gold"
                              : "quiet"
                        }
                      >
                        {c.severities[a.severity]}
                      </Pill>
                      <span className="text-xs text-muted-foreground">
                        {fieldName(a.field)}
                        {a.role ? ` · ${c.roles[a.role]}` : ""}
                      </span>
                      <span className="ms-auto min-w-0 truncate text-xs text-muted-foreground">
                        {a.code ? (
                          <>
                            <Val>{a.code}</Val> · <bdi dir="auto">{a.name}</bdi>
                          </>
                        ) : (
                          c.countryWide
                        )}
                      </span>
                    </div>
                    <AlertDetail a={a} />
                    {canApprove && (
                      <AlertActions
                        busy={m.isPending}
                        onSettle={(status, note) =>
                          m.mutate({ id: a.id, status, ...(note ? { note } : {}) })
                        }
                      />
                    )}
                    {a.orphan_id && (
                      <div className="mt-2 flex justify-end">
                        <OpenFile id={a.orphan_id} onOpen={onOpen} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <LoadMore {...list} shown={all.length} />
    </section>
  );
}
