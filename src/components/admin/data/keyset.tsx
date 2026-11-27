import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { defineCopy, useCopy } from "@/lib/locale";
import { nextCursor, QUEUE_PAGE, type QueueCursor } from "@/lib/golden-record";
import type { RpcResult } from "@/lib/rpc-call";

export { QUEUE_PAGE };

const COPY = defineCopy("components/admin/data/keyset", {
  ar: {
    more: "عرض المزيد",
    loading: "يُحمَّل…",
    of: (shown: number, total: number) => `عُرض ${shown} من ${total}`,
  },
  en: {
    more: "Load more",
    loading: "Loading…",
    of: (shown: number, total: number) => `Showing ${shown} of ${total}`,
  },
});

/**
 * قائمة طابورٍ بصفحاتٍ بالمؤشّر: الصفحة الأولى ثم ما بعد مؤشّر آخر بند (`cursor`)،
 * بالشكل نفسه الذي تعطيه `useQuery` (`data` نتيجةٌ واحدة بكلّ ما وصل). المفتاح ينتهي
 * بـ`pages` فيبقى تحت بادئة الطابور: إبطال `[…, "golden-conflicts"]` يعيد الصفحات كلّها.
 */
export function useKeysetList<T extends { cursor?: QueueCursor }>(
  key: readonly unknown[],
  fetchPage: (after: QueueCursor | null) => Promise<RpcResult<T[]>>,
  enabled = true,
) {
  const q = useInfiniteQuery({
    queryKey: [...key, "pages"],
    initialPageParam: null as QueueCursor | null,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (last) =>
      last.ok ? (nextCursor(last.data, QUEUE_PAGE) ?? undefined) : undefined,
    enabled,
  });
  const pages = q.data?.pages ?? [];
  const first = pages[0];
  const data: RpcResult<T[]> | undefined = !first
    ? undefined
    : !first.ok
      ? first
      : { ok: true, data: pages.flatMap((p) => (p.ok ? p.data : [])) };
  return {
    isPending: q.isPending,
    data,
    refetch: () => q.refetch(),
    hasMore: q.hasNextPage,
    loadingMore: q.isFetchingNextPage,
    loadMore: () => void q.fetchNextPage(),
  };
}

/** «عرض المزيد» تحت القائمة، مع ما وصل من العدد الكلّي إن عُرف. */
export function LoadMore({
  hasMore,
  loadingMore,
  loadMore,
  shown,
  total,
}: {
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  shown?: number;
  total?: number | null;
}) {
  const c = useCopy(COPY);
  if (!hasMore) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={loadingMore}
        onClick={loadMore}
      >
        {loadingMore && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {loadingMore ? c.loading : c.more}
      </Button>
      {shown !== undefined && total !== undefined && total !== null && total > shown && (
        <span className="text-muted-foreground text-xs tabular-nums" aria-live="polite">
          {c.of(shown, total)}
        </span>
      )}
    </div>
  );
}
