import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ImageIcon, StickyNote, Video } from "lucide-react";
import { useCallback, useState, type KeyboardEvent } from "react";

import { hijriLabel, monthLabel } from "@/components/sponsorship/sponsor-format";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { captionOf, clock, groupByMonth, type ChildUpdate } from "@/lib/child-updates";
import { listChildUpdates } from "@/lib/child-updates.functions";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { formatDate } from "@/lib/format";
import { defineCopy, dirOf, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/sponsorship/ChildUpdates", {
  ar: {
    title: "من حياة الطفل",
    lead: "صورٌ ومقاطع قصيرة وملاحظات يرسلها فريق الدولة بموافقة الوليّ، وتُراجَع قبل أن تصلك.",
    empty: "لم يصل تحديثٌ بعد. يصلك ما يرسله فريق الدولة بعد مراجعته.",
    failed: "تعذّر تحميل التحديثات.",
    sample: "نموذج",
    sampleNote: "رسمٌ توضيحي لا صورة طفل",
    open: (caption: string) => `افتح: ${caption}`,
    video: (length: string) => `مقطع ${length}`,
    photo: "صورة",
    note: "ملاحظة",
    prev: "السابق",
    next: "التالي",
    position: (i: number, n: number) => `${i} من ${n}`,
    privacy: "للاطّلاع وحدك: لا تُنشر هذه الوسائط ولا تُشارَك، حمايةً للطفل.",
  },
  en: {
    title: "From the child's life",
    lead: "Photos, short clips and notes sent by the country team with the guardian's consent, reviewed before they reach you.",
    empty: "No update yet. What the country team sends reaches you once it is reviewed.",
    failed: "The updates couldn't load.",
    sample: "Sample",
    sampleNote: "An illustration, not a child's photo",
    open: (caption: string) => `Open: ${caption}`,
    video: (length: string) => `Clip ${length}`,
    photo: "Photo",
    note: "Note",
    prev: "Previous",
    next: "Next",
    position: (i: number, n: number) => `${i} of ${n}`,
    privacy: "For you alone: please don't post or share these, to protect the child.",
  },
});

/**
 * تحديثات الطفل في صفحة الكافل: شهراً شهراً، الأحدث أوّلاً، وعرضٌ مكبَّر بلا تشغيلٍ
 * تلقائي. النصّ البديل هو التعليق نفسه. الروابط موقَّعة قصيرة العمر من الخادم بعد أن
 * تتحقّق القاعدة من الكفالة النشطة (`my_child_updates`).
 */
export function ChildUpdates({ orphanId }: { orphanId: string }) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const fetchUpdates = useDataFn("sponsor.childUpdates", listChildUpdates);
  const q = useQuery({
    queryKey: useDataKey(["child-updates", orphanId]),
    queryFn: () => fetchUpdates({ data: { orphanId } }),
    // الروابط تنقضي بعد عشر دقائق: تُجدَّد قبلها.
    staleTime: 8 * 60_000,
    refetchInterval: 8 * 60_000,
  });
  const items: ChildUpdate[] = q.data?.ok ? q.data.data : [];
  const media = items.filter((u) => u.kind !== "note");
  const [open, setOpen] = useState<number | null>(null);
  const groups = groupByMonth(items);

  return (
    <section aria-labelledby="updates-h">
      <h2 id="updates-h" className="text-lg font-bold">
        {c.title}
      </h2>
      <p className="mt-1 text-sm leading-7 text-muted-foreground">{c.lead}</p>
      {q.isPending ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        </div>
      ) : q.data && !q.data.ok ? (
        <p role="alert" className="mt-4 text-sm text-muted-foreground">
          {c.failed}
        </p>
      ) : groups.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {c.empty}
        </p>
      ) : (
        <div className="mt-4 space-y-6">
          {groups.map((g) => (
            <section key={g.month} aria-labelledby={`u-${g.month}`}>
              <h3
                id={`u-${g.month}`}
                className="flex flex-wrap items-baseline gap-x-2 border-b border-border pb-2"
              >
                <span className="font-bold">{monthLabel(g.month, locale)}</span>
                <span className="text-xs text-muted-foreground">{hijriLabel(g.month, locale)}</span>
              </h3>
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {g.items.map((u) =>
                  u.kind === "note" ? (
                    <li
                      key={u.id}
                      className="col-span-full rounded-2xl bg-card p-4 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)]"
                    >
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <StickyNote className="size-3.5" aria-hidden="true" />
                        {c.note} · {formatDate(u.at, locale)}
                        {u.sample && <SampleChip />}
                      </p>
                      <p className="mt-1 text-sm leading-7 text-pretty">
                        <bdi dir="auto">{captionOf(u, locale)}</bdi>
                      </p>
                    </li>
                  ) : (
                    <li key={u.id} className="min-w-0">
                      <Tile u={u} onOpen={() => setOpen(media.indexOf(u))} />
                    </li>
                  ),
                )}
              </ul>
            </section>
          ))}
          <p className="text-xs leading-6 text-muted-foreground">{c.privacy}</p>
        </div>
      )}
      <Lightbox items={media} index={open} onIndex={setOpen} />
    </section>
  );
}

function SampleChip() {
  const c = useCopy(COPY);
  return (
    <span className="rounded-full bg-bridge/10 px-2 py-0.5 text-xs font-bold text-bridge-ink">
      {c.sample}
    </span>
  );
}

function Tile({ u, onOpen }: { u: ChildUpdate; onOpen: () => void }) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const caption = captionOf(u, locale);
  const still = u.kind === "video" ? u.poster_url : u.url;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={c.open(caption)}
      className="group relative block aspect-square w-full overflow-hidden rounded-2xl bg-secondary text-start shadow-[0_0_0_1px_rgb(0_0_0/0.06)] transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)]"
    >
      {still ? (
        <img
          src={still}
          alt={caption}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <span className="flex size-full items-center justify-center text-muted-foreground">
          <ImageIcon className="size-6" aria-hidden="true" />
        </span>
      )}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-black/80 to-transparent"
      />
      {u.kind === "video" && (
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg">
            <Video className="size-5" />
          </span>
        </span>
      )}
      <span className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 text-xs tabular-nums">
        {u.sample ? (
          <span className="rounded-full bg-background/90 px-2 py-0.5 font-bold text-bridge-ink">
            {c.sample}
          </span>
        ) : (
          <span />
        )}
        {u.kind === "video" && u.duration_seconds ? (
          <span className="rounded-full bg-black/80 px-2 py-0.5 font-medium text-white">
            {clock(u.duration_seconds)}
          </span>
        ) : null}
      </span>
      <span className="absolute inset-x-0 bottom-0 p-2.5 text-white">
        <span className="line-clamp-2 text-xs leading-5 font-medium">
          <bdi dir="auto">{caption}</bdi>
        </span>
      </span>
    </button>
  );
}

function Lightbox({
  items,
  index,
  onIndex,
}: {
  items: ChildUpdate[];
  index: number | null;
  onIndex: (i: number | null) => void;
}) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const u = index === null ? undefined : items[index];
  const go = useCallback(
    (step: number) => {
      if (index === null || items.length < 2) return;
      onIndex((index + step + items.length) % items.length);
    },
    [index, items.length, onIndex],
  );
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if ((e.target as HTMLElement).tagName === "VIDEO") return;
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const forward = e.key === (rtl ? "ArrowLeft" : "ArrowRight");
    e.preventDefault();
    go(forward ? 1 : -1);
  };
  const caption = u ? captionOf(u, locale) : "";
  const rtl = dirOf(locale) === "rtl";
  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;
  return (
    <Dialog open={!!u} onOpenChange={(o) => !o && onIndex(null)}>
      <DialogContent
        onKeyDown={onKey}
        className="max-h-[90dvh] max-w-[95%] sm:max-w-xl gap-3 overflow-y-auto rounded-2xl p-3 pt-14"
      >
        {u && (
          <>
            <figure className="overflow-hidden rounded-xl bg-black/80">
              {u.kind === "video" && u.url ? (
                <video
                  key={u.id}
                  src={u.url ?? undefined}
                  poster={u.poster_url ?? undefined}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={caption}
                  className="mx-auto max-h-[30rem] w-full"
                />
              ) : (
                <img
                  key={u.id}
                  src={(u.kind === "video" ? u.poster_url : u.url) ?? undefined}
                  alt={caption}
                  className="mx-auto max-h-[30rem] w-auto"
                />
              )}
            </figure>
            <div className="flex flex-wrap items-start gap-3 pe-8">
              <div className="min-w-0 flex-1 basis-56">
                <DialogTitle className="text-base leading-7 font-semibold text-pretty">
                  <bdi dir="auto">{caption}</bdi>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {u.kind === "video" && u.duration_seconds
                    ? c.video(clock(u.duration_seconds))
                    : c.photo}{" "}
                  · {formatDate(u.at, locale)}
                  {u.sample && <> · {c.sampleNote}</>}
                </DialogDescription>
              </div>
              {items.length > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => go(-1)}
                    aria-label={c.prev}
                    className="inline-flex size-11 items-center justify-center rounded-full hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Prev className="size-5" aria-hidden="true" />
                  </button>
                  <span className="min-w-10 text-center text-xs text-muted-foreground tabular-nums">
                    {c.position(index! + 1, items.length)}
                  </span>
                  <button
                    type="button"
                    onClick={() => go(1)}
                    aria-label={c.next}
                    className="inline-flex size-11 items-center justify-center rounded-full hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Next className="size-5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
            <p className={cn("text-xs leading-6 text-muted-foreground")}>{c.privacy}</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
