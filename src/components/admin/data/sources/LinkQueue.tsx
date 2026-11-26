import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { Button } from "@/components/ui/button";
import { matchesQuery } from "@/lib/golden-record";
import { createUnmatched, listLinkQueue, resolveLink } from "@/lib/golden-record.functions";
import { useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { Busy, CARD, Failed, NeedsUpdate, Pill, SectionHead } from "../shared";
import { SOURCES_COPY } from "../sources-copy";
import { WORK_COPY } from "../work-copy";
import { FilterBar, ROW_FOCUS, useListKeys, useWorkErr } from "../WorkTools";
import { Val } from "./shared";

export function LinkQueue({
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
  const [roleF, setRoleF] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const dk = useDataKey([]);
  const fetchList = useDataFn("golden.links", listLinkQueue);
  const list = useQuery({
    queryKey: useDataKey(["golden-links", country]),
    queryFn: () => fetchList({ data: { country } }),
  });
  const resolve = useDataFn("golden.resolveLink", resolveLink);
  const createAll = useDataFn("golden.createUnmatched", createUnmatched);
  const refresh = () => {
    for (const k of ["golden-links", "golden-conflicts", "data-health"])
      void qc.invalidateQueries({ queryKey: [...dk, k] });
  };
  const m = useMutation({
    mutationFn: (v: { id: string; action: "link" | "create" | "ignore"; orphanId?: string }) =>
      resolve({ data: v }),
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      toast.success(c.done);
      refresh();
    },
  });
  const all = useMutation({
    mutationFn: () => createAll({ data: { country } }),
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      toast.success(c.createdAll(res.data.created));
      if (res.data.failed > 0) toast.error(c.createFailed(res.data.failed));
      refresh();
    },
  });
  const everything = list.data?.ok ? list.data.data : [];
  const unmatched = everything.some((q) => q.role === "wamy" && q.candidates.length === 0);
  const items = everything.filter(
    (q) =>
      (!roleF || q.role === roleF) &&
      matchesQuery(query, q.name, q.external_ref, ...q.candidates.flatMap((o) => [o.code, o.name])),
  );
  const keys = useListKeys({
    search,
    onOpen: (i) => {
      const first = items[i]?.candidates[0];
      if (first) onOpen(first.id);
    },
  });

  return (
    <section aria-labelledby="links-title" onKeyDown={keys.onKeyDown}>
      <SectionHead
        title={c.linkTitle}
        hint={c.linkHint}
        action={
          unmatched && canApprove ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={all.isPending}
              onClick={() => all.mutate()}
            >
              {c.createAll}
            </Button>
          ) : undefined
        }
      />
      {list.isPending ? (
        <Busy />
      ) : !list.data?.ok ? (
        list.data?.missing ? (
          <NeedsUpdate />
        ) : (
          <Failed onRetry={() => void list.refetch()} />
        )
      ) : everything.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{c.noLinks}</p>
      ) : (
        <>
          <FilterBar
            query={query}
            setQuery={setQuery}
            placeholder={w.searchLinks}
            inputRef={search}
            shown={items.length}
            total={everything.length}
            filters={[
              {
                id: "role",
                label: c.sourceRole,
                value: roleF,
                set: setRoleF,
                all: w.allSources,
                options: (["wamy", "office"] as const).map((r) => ({
                  value: r,
                  label: c.roles[r],
                })),
              },
            ]}
          />
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{w.noMatch}</p>
          ) : (
            <div ref={keys.root}>
              <ul className="mt-4 space-y-3">
                {items.map((q) => (
                  <li
                    key={q.id}
                    data-row=""
                    tabIndex={0}
                    aria-label={`${q.name ?? q.external_ref} · ${q.external_ref}`}
                    className={cn(CARD, ROW_FOCUS, "p-4")}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <bdi dir="auto" className="font-bold">
                        {q.name ?? q.external_ref}
                      </bdi>
                      <Pill tone="quiet">{c.roles[q.role]}</Pill>
                      <span className="ms-auto min-w-0 truncate text-xs text-muted-foreground tabular-nums">
                        <Val>{q.external_ref}</Val>
                        {q.birth_date && (
                          <>
                            {" · "}
                            <Val>{q.birth_date}</Val>
                          </>
                        )}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {q.candidates.length ? c.candidates : c.noCandidates}
                    </p>
                    {q.candidates.length > 0 && (
                      <ul className="mt-1 flex flex-wrap gap-x-1">
                        {q.candidates.map((o) => (
                          <li key={o.id}>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="min-h-11"
                              onClick={() => onOpen(o.id)}
                              aria-label={`${w.openFile} ${o.code}`}
                            >
                              <FolderOpen className="size-4" aria-hidden="true" />
                              <Val>{o.code}</Val>
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2" hidden={!canApprove}>
                      {q.candidates.map((o) => (
                        <Button
                          key={o.id}
                          size="sm"
                          variant="outline"
                          className="min-h-11"
                          disabled={m.isPending}
                          onClick={() => m.mutate({ id: q.id, action: "link", orphanId: o.id })}
                        >
                          <Val>{c.linkTo(o.code)}</Val>
                          <span className="text-xs text-muted-foreground">
                            {o.name}
                            {o.birth_date && (
                              <>
                                {" · "}
                                <Val>{o.birth_date}</Val>
                              </>
                            )}
                          </span>
                        </Button>
                      ))}
                      {q.role === "wamy" && (
                        <Button
                          size="sm"
                          className="min-h-11"
                          disabled={m.isPending}
                          onClick={() => m.mutate({ id: q.id, action: "create" })}
                        >
                          {c.create}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-11"
                        disabled={m.isPending}
                        onClick={() => m.mutate({ id: q.id, action: "ignore" })}
                      >
                        {c.ignore}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
