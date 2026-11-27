import { useQueries } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { NO_COUNTS, sumCounts, type QueueCounts } from "@/lib/admin-tools";
import { getQueueCounts } from "@/lib/admin-tools.functions";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { nextCursor, QUEUE_PAGE, type CountryAccess, type QueueCursor } from "@/lib/golden-record";
import { listAlerts, listConflicts, listLinkQueue } from "@/lib/golden-record.functions";
import { getDecisionInbox } from "@/lib/inbox.functions";
import { listChildUpdateQueue } from "@/lib/child-updates.functions";

import { buildQueue, type QueueInput, type QueueItem } from "./queue";

/**
 * مصادر «اليوم» في نداءٍ واحد من `useQueries`. الإدارة: الصندوق وطوابير الدول كلّها
 * (`country = null`). فريق الدولة: طوابير دوله وحدها، دولةً دولة — فلا يدخل عدّاده بندٌ
 * من دولةٍ أخرى. مفاتيح الاستعلام نفسها في «مصادر التحقق»، فالحسم هناك يحدّث هنا.
 *
 * كلّ طابورٍ يصل صفحته الأولى (`QUEUE_PAGE`)، و«عرض المزيد» يطلب ما بعد مؤشّر آخر بندٍ
 * في كلّ طابورٍ لم ينتهِ (`loadMore`). العدد الكلّي من `admin_queue_counts`، لا ممّا وصل.
 */
const SLOTS = ["alerts", "conflicts", "links", "updates"] as const;
type Slot = (typeof SLOTS)[number];
type Page = { ok: boolean; data?: unknown[] } | undefined;
type More = Record<string, { items: unknown[]; next: QueueCursor | null }>;

export function useToday(access: CountryAccess, enabled = true) {
  const fetchInbox = useDataFn("today.inbox", getDecisionInbox);
  const fetchAlerts = useDataFn("golden.alerts", listAlerts);
  const fetchConflicts = useDataFn("golden.conflicts", listConflicts);
  const fetchLinks = useDataFn("golden.links", listLinkQueue);
  const fetchUpdates = useDataFn("childUpdates.queue", listChildUpdateQueue);
  const fetchCounts = useDataFn("admin.queueCounts", getQueueCounts);
  const dk = useDataKey([]);
  const scopes: Array<string | null> = access.admin ? [null] : access.countries.map((c) => c.code);

  const page = { limit: QUEUE_PAGE };
  const results = useQueries({
    queries: [
      {
        queryKey: [...dk, "decision-inbox"],
        queryFn: () => fetchInbox(),
        enabled: enabled && access.admin,
      },
      ...scopes.flatMap((country) => [
        {
          queryKey: [...dk, "golden-alerts", country],
          queryFn: () => fetchAlerts({ data: { country, ...page } }),
          enabled,
        },
        {
          queryKey: [...dk, "golden-conflicts", country],
          queryFn: () => fetchConflicts({ data: { country, ...page } }),
          enabled,
        },
        {
          queryKey: [...dk, "golden-links", country],
          queryFn: () => fetchLinks({ data: { country, ...page } }),
          enabled,
        },
        {
          // المفتاح نفسه في لسان «التحديثات» بدرج الدولة.
          queryKey: [...dk, "child-updates-queue", country],
          queryFn: () => fetchUpdates({ data: { country, ...page } }),
          enabled,
        },
      ]),
    ],
  });

  const counts = useQueries({
    queries: scopes.map((country) => ({
      queryKey: [...dk, "queue-counts", country],
      queryFn: () => fetchCounts({ data: { country } }),
      enabled,
    })),
  });
  const total = useMemo(() => {
    const sum: QueueCounts = { ...NO_COUNTS };
    for (const c of counts) {
      const d = c.data;
      if (!d?.ok) continue;
      for (const k of SLOTS) sum[k] += Number(d.data[k] ?? 0);
    }
    return sumCounts(sum);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts.map((c) => c.dataUpdatedAt).join(":")]);

  const pending = results.some((r) => r.isPending && r.fetchStatus !== "idle");
  const failed = results.some(
    (r) =>
      r.isError ||
      // دالّةٌ لم تُطبَّق هجرتها بعد (`missing`) لا تُفشل الطابور كلّه.
      (r.data &&
        typeof r.data === "object" &&
        "ok" in r.data &&
        !r.data.ok &&
        !("missing" in r.data && r.data.missing)),
  );
  const stamp = results.map((r) => r.dataUpdatedAt).join(":");
  // صفحاتٌ بعد الأولى، لكلّ طابورٍ ودولة؛ تُنسى حين تتجدّد الأولى (حسمٌ أو تحديث).
  const [more, setMore] = useState<More>({});
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => setMore({}), [stamp]);
  const sources = scopes.flatMap((country, ci) =>
    SLOTS.map((slot, si) => {
      const key = `${slot}:${country ?? "*"}`;
      const first = results[1 + ci * SLOTS.length + si]?.data as Page;
      const firstItems = first?.ok && Array.isArray(first.data) ? first.data : [];
      const extra = more[key];
      const next = extra
        ? extra.next
        : nextCursor(firstItems as Array<{ cursor?: QueueCursor }>, QUEUE_PAGE);
      return { key, slot, country, firstItems, extra: extra?.items ?? [], next };
    }),
  );
  const hasMore = sources.some((x) => x.next !== null);
  const fetchers: Record<Slot, (a: { data: Record<string, unknown> }) => Promise<unknown>> = {
    alerts: fetchAlerts as never,
    conflicts: fetchConflicts as never,
    links: fetchLinks as never,
    updates: fetchUpdates as never,
  };
  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const got = await Promise.all(
        sources
          .filter((x) => x.next !== null)
          .map(async (x) => {
            const r = (await fetchers[x.slot]({
              data: { country: x.country, after: x.next, limit: QUEUE_PAGE },
            })) as Page;
            const items = r?.ok && Array.isArray(r.data) ? r.data : [];
            return [x.key, x.extra, items] as const;
          }),
      );
      setMore((m) => {
        const n = { ...m };
        for (const [key, had, items] of got)
          n[key] = {
            items: [...had, ...items],
            next: nextCursor(items as Array<{ cursor?: QueueCursor }>, QUEUE_PAGE),
          };
        return n;
      });
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, more]);

  const items: QueueItem[] = useMemo(() => {
    const input: Required<QueueInput> = {
      inbox: [],
      alerts: [],
      conflicts: [],
      links: [],
      updates: [],
    };
    const inbox = results[0];
    if (Array.isArray(inbox?.data)) input.inbox = inbox.data;
    for (const x of sources) (input[x.slot] as unknown[]).push(...x.firstItems, ...x.extra);
    return buildQueue(input, access);
    // `stamp` يتغيّر مع كل وصولٍ جديد؛ النتائج نفسها مصفوفةٌ جديدة في كل رسم.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, more, access]);
  const inboxCount = Array.isArray(results[0]?.data) ? results[0].data.length : 0;

  return {
    items,
    /** كلّ ما ينتظر، لا ما وصل منه: الصندوق كاملاً وعدّادات الطوابير. */
    total: Math.max(items.length, inboxCount + total),
    hasMore,
    loadingMore,
    loadMore: () => void loadMore(),
    pending,
    failed,
    refetch: () => {
      results.forEach((r) => void r.refetch());
      counts.forEach((c) => void c.refetch());
    },
  };
}
