import { useInfiniteQuery } from "@tanstack/react-query";
import { FlaskConical, ShieldAlert, Stamp } from "lucide-react";
import { useState } from "react";

import { Busy, Failed, NeedsUpdate } from "@/components/admin/data/shared";
import { SOURCES_COPY } from "@/components/admin/data/sources-copy";
import { LoadMore } from "@/components/admin/data/keyset";
import { TRUST_COPY } from "@/components/admin/trust/copy";
import {
  isSecurity,
  relativeTime,
  sentenceOf,
  type DecisionEvent,
  type DecisionKind,
  type SentenceLabels,
} from "@/lib/admin-tools";
import { getDecisionLog } from "@/lib/admin-tools.functions";
import { countryName } from "@/lib/countries";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { useDemo } from "@/lib/demo-mode";
import { formatDate } from "@/lib/format";
import { useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

import { DECISIONS_COPY } from "./copy";

type Filter = "all" | DecisionKind;
const FILTERS: readonly Filter[] = ["all", "decisions", "security"];

/**
 * سجلّ القرارات جملاً مقروءة: «سارة اعتمد تاريخ الميلاد 2013-07-01 بدل 2013-06-01 · قبل
 * يومين». للإدارة وحدها (`admin_decision_log`)، وأحداث الأمن (`sec_*`) في مرشّحها. بلا
 * `orphanId` يعرض الشبكة كلّها؛ ومعه سجلّ طفلٍ واحد في ملفّه، ولا يظهر لغير الإدارة.
 */
export function DecisionTimeline({ orphanId = null }: { orphanId?: string | null }) {
  const t = useCopy(DECISIONS_COPY);
  const src = useCopy(SOURCES_COPY);
  const trust = useCopy(TRUST_COPY);
  const locale = useLocale();
  const demo = useDemo();
  const [filter, setFilter] = useState<Filter>("all");
  const fetchLog = useDataFn("admin.decisionLog", getDecisionLog);
  const kind = filter === "all" ? null : filter;
  const q = useInfiniteQuery({
    queryKey: useDataKey(["decision-log", orphanId, kind]),
    initialPageParam: null as { at: string; id: string } | null,
    queryFn: ({ pageParam }) =>
      fetchLog({
        data: {
          orphan: orphanId,
          kind,
          beforeAt: pageParam?.at ?? null,
          beforeId: pageParam?.id ?? null,
        },
      }),
    getNextPageParam: (last) => {
      if (!last.ok || !last.data.has_more) return undefined;
      const r = last.data.rows[last.data.rows.length - 1];
      return r ? { at: r.at, id: r.id } : undefined;
    },
  });
  const first = q.data?.pages[0];
  const rows: DecisionEvent[] = (q.data?.pages ?? []).flatMap((p) => (p.ok ? p.data.rows : []));
  const labels: SentenceLabels = {
    fields: src.fields as Record<string, string>,
    signals: src.signals as Record<string, string>,
    statuses: trust.alertStatuses as Record<string, string>,
    roles: trust.roles as Record<string, string>,
    modes: src.modes as Record<string, string>,
  };
  const [now] = useState(() => Date.now());

  // غير الإدارة لا يرى السجلّ؛ وفي ملفّ الطفل لا يظهر القسم قبل أن يصل.
  if (first && !first.ok && first.error === "admin_only") return null;
  if (orphanId && !first?.ok) return null;

  const titleId = orphanId ? `decisions-${orphanId}` : "decisions-all";
  return (
    <section aria-labelledby={titleId} className={cn(orphanId && "mt-6")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4
          id={titleId}
          className={cn("font-bold", orphanId ? "text-base" : "font-display text-xl")}
        >
          {orphanId ? t.childTitle : t.title}
        </h4>
        {demo && (
          <span className="bg-bridge/15 text-bridge-ink inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold">
            <FlaskConical className="size-3" aria-hidden="true" />
            {t.sample}
          </span>
        )}
      </div>
      {!orphanId && <p className="text-muted-foreground mt-1 text-sm leading-7">{t.lead}</p>}
      <div
        role="radiogroup"
        aria-label={t.filter}
        className="bg-secondary/60 mt-3 inline-flex rounded-xl p-1"
      >
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "focus-visible:ring-ring min-h-11 rounded-lg px-3 text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:outline-none",
              filter === f
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.filters[f]}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {q.isPending ? (
          <Busy />
        ) : first && !first.ok ? (
          first.missing ? (
            <NeedsUpdate />
          ) : (
            <Failed onRetry={() => void q.refetch()} />
          )
        ) : rows.length === 0 ? (
          <p className="border-border text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-sm">
            {filter === "security" ? t.emptySecurity : t.empty}
          </p>
        ) : (
          <ol className="border-border relative space-y-4 border-s ps-5">
            {rows.map((e) => {
              const sec = isSecurity(e);
              const Icon = sec ? ShieldAlert : Stamp;
              return (
                <li key={`${e.src}-${e.id}`} className="relative">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "bg-card absolute -start-[1.95rem] top-0.5 inline-flex size-6 items-center justify-center rounded-full border",
                      sec ? "border-destructive/50 text-destructive" : "border-border text-primary",
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <p className="text-sm leading-7 text-pretty">
                    <bdi>{sentenceOf(e, t.sentences, labels)}</bdi>
                  </p>
                  <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs leading-6">
                    <time dateTime={e.at} title={formatDate(e.at, locale)}>
                      {relativeTime(e.at, locale, now)}
                    </time>
                    {e.code && !orphanId && (
                      <>
                        <span aria-hidden="true">·</span>
                        <bdi dir="ltr" className="font-mono">
                          {e.code}
                        </bdi>
                      </>
                    )}
                    {e.country && !orphanId && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{countryName(e.country, locale)}</span>
                      </>
                    )}
                    {sec && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-destructive font-bold">{t.securityTag}</span>
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
        <LoadMore
          hasMore={q.hasNextPage}
          loadingMore={q.isFetchingNextPage}
          loadMore={() => void q.fetchNextPage()}
        />
      </div>
    </section>
  );
}
