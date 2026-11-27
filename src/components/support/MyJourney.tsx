import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Award, FileText, Gauge, Mail, Package, PackageCheck, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/kit/EmptyState";
import { PageSection } from "@/components/kit/PageSection";
import { Timeline, type TimelineItem } from "@/components/kit/Timeline";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyJourneyFeed, previewMonthlyDigest } from "@/lib/journey.functions";
import { eventLabel } from "@/lib/event-labels";
import { isolate } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";

const COPY = defineCopy("components/support/MyJourney", {
  ar: {
    title: "رحلتي",
    description: "كل ما صنعه دعمك: تقارير، ووصول، وجلسات، وقياسات — الأحدث أولاً.",
    preview: "معاينة رسالة الشهر",
    previewHint: "هكذا ستصلك رسالة الشهر",
    close: "إغلاق",
    emptyTitle: "رحلتك تبدأ مع أول دعم",
    emptyText: "حين يُنشر تقرير أو تصل كفالة أو يجتاز من تدعمه جلسة، يظهر هنا.",
    latestOnly: "عرض الأحدث فقط",
    showAll: (n: number) => `عرض الكل (${n})`,
  },
  en: {
    title: "My journey",
    description:
      "Everything your support has made happen: reports, deliveries, sessions and measurements — newest first.",
    preview: "Preview the monthly letter",
    previewHint: "This is how your monthly letter will arrive",
    close: "Close",
    emptyTitle: "Your journey begins with your first support",
    emptyText:
      "When a report is published, a sponsorship arrives, or someone you support completes a session, it appears here.",
    latestOnly: "Show newest only",
    showAll: (n: number) => `Show all (${n})`,
  },
});

const ICONS: Record<string, { icon: LucideIcon; tone: TimelineItem["tone"] }> = {
  "report.published": { icon: FileText, tone: "done" },
  disbursement_delivered: { icon: PackageCheck, tone: "done" },
  "pledge.delivered": { icon: PackageCheck, tone: "done" },
  "pledge.preparing": { icon: Package, tone: "progress" },
  "unit.accepted": { icon: Award, tone: "done" },
  "trait.measured": { icon: Gauge, tone: "progress" },
};

/**
 * «رحلتي» — كل ما صنعه دعمك في خطٍّ واحد، الأحدث أولاً.
 * ومعاينة «رسالة الشهر» كما ستصل حين يُفتح البريد.
 */
export function MyJourney({ limit = 5, className = "" }: { limit?: number; className?: string }) {
  const fetchFeed = useServerFn(getMyJourneyFeed);
  const fetchPreview = useServerFn(previewMonthlyDigest);
  const c = useCopy(COPY);
  const locale = useLocale();
  const { data: feed = [], isPending } = useQuery({
    queryKey: ["my-journey"],
    queryFn: () => fetchFeed(),
  });
  const [preview, setPreview] = useState<string | null>(null);
  // الأحدث خمسةٌ فقط (UI-05): الخطّ يُطمئن ولا يدفن الكفالات تحته؛ والباقي بطلب.
  const [showAll, setShowAll] = useState(false);

  const items: TimelineItem[] = feed.map((f, i) => ({
    id: `${f.type}-${f.at}-${i}`,
    at: f.at,
    title: [eventLabel(f.type, locale), isolate(f.orphan)].filter(Boolean).join(" — "),
    text: f.kind === "timeline" ? null : f.text,
    icon: ICONS[f.type]?.icon ?? Sparkles,
    tone: ICONS[f.type]?.tone ?? "muted",
  }));

  const shown = showAll ? items : items.slice(0, limit);

  return (
    <PageSection
      id="my-journey"
      title={c.title}
      description={c.description}
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const res = await fetchPreview();
            setPreview(res.ok ? res.html : null);
          }}
        >
          <Mail className="size-4" /> {c.preview}
        </Button>
      }
      className={className}
    >
      {preview && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-border">
          <div className="flex items-center justify-between bg-secondary/60 px-4 py-2 text-xs">
            <span>{c.previewHint}</span>
            <button type="button" className="underline" onClick={() => setPreview(null)}>
              {c.close}
            </button>
          </div>
          <iframe title={c.preview} srcDoc={preview} className="h-96 w-full bg-white" sandbox="" />
        </div>
      )}
      {isPending ? (
        // هيكلٌ بارتفاع المحتوى (UI-17/RT-07): لا فراغ ثم قفزة حين يصل.
        <div className="space-y-5 border-s border-border ps-6" aria-hidden="true">
          {Array.from({ length: limit }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title={c.emptyTitle} text={c.emptyText} />
      ) : (
        <>
          <Timeline items={shown} />
          {items.length > limit && (
            <Button
              variant="link"
              className="mt-3 px-0"
              aria-expanded={showAll}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? c.latestOnly : c.showAll(items.length)}
            </Button>
          )}
        </>
      )}
    </PageSection>
  );
}
