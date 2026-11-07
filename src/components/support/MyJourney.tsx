import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Award, FileText, Gauge, Mail, Package, PackageCheck, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/kit/EmptyState";
import { PageSection } from "@/components/kit/PageSection";
import { Timeline, type TimelineItem } from "@/components/kit/Timeline";
import { Button } from "@/components/ui/button";
import { getMyJourneyFeed, previewMonthlyDigest } from "@/lib/journey.functions";
import { eventLabel } from "@/lib/event-labels";
import { isolate } from "@/lib/format";

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
export function MyJourney() {
  const fetchFeed = useServerFn(getMyJourneyFeed);
  const fetchPreview = useServerFn(previewMonthlyDigest);
  const { data: feed = [] } = useQuery({ queryKey: ["my-journey"], queryFn: () => fetchFeed() });
  const [preview, setPreview] = useState<string | null>(null);

  const items: TimelineItem[] = feed.map((f, i) => ({
    id: `${f.type}-${f.at}-${i}`,
    at: f.at,
    title: [eventLabel(f.type), isolate(f.orphan)].filter(Boolean).join(" — "),
    text: f.kind === "timeline" ? null : f.text,
    icon: ICONS[f.type]?.icon ?? Sparkles,
    tone: ICONS[f.type]?.tone ?? "muted",
  }));

  return (
    <PageSection
      id="my-journey"
      title="رحلتي"
      description="كل ما صنعه دعمك: تقارير، ووصول، وجلسات، وقياسات — الأحدث أولاً."
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const res = await fetchPreview();
            setPreview(res.ok ? res.html : null);
          }}
        >
          <Mail className="size-4" /> معاينة رسالة الشهر
        </Button>
      }
      className="mb-10"
    >
      {preview && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-border">
          <div className="flex items-center justify-between bg-secondary/60 px-4 py-2 text-xs">
            <span>هكذا ستصلك رسالة الشهر</span>
            <button type="button" className="underline" onClick={() => setPreview(null)}>
              إغلاق
            </button>
          </div>
          <iframe
            title="معاينة رسالة الشهر"
            srcDoc={preview}
            className="h-96 w-full bg-white"
            sandbox=""
          />
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState
          title="رحلتك تبدأ مع أول دعم"
          text="حين يُنشر تقرير أو تصل كفالة أو يجتاز من تدعمه جلسة، يظهر هنا."
        />
      ) : (
        <Timeline items={items} />
      )}
    </PageSection>
  );
}
