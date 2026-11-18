import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown } from "lucide-react";

import { OrphanCard } from "@/components/OrphanCard";
import { listOrphanCards } from "@/lib/protection.functions";
import { defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("components/support/SupportPicks", {
  ar: {
    eyebrow: "ابدأ من هنا",
    title: "أطفالٌ ينتظرون منذ أطول مدة",
    text: "اختر طفلاً واكفله شهرياً أو ادعمه مرّةً واحدة؛ المبلغ المقترح يُكمل حاجته.",
    orMap: "أو اختر مكاناً على الخريطة لتدعم تأهيلاً أو عيناً",
  },
  en: {
    eyebrow: "Start here",
    title: "Children who have waited longest",
    text: "Pick a child and sponsor monthly or give once; the suggested amount completes their need.",
    orMap: "Or choose a place on the map to support qualification or in-kind help",
  },
});

/**
 * بدايةٌ دافئة لـ«ادعم»: بدل خريطةٍ صامتة، ثلاثة أطفالٍ معتمدين ينتظرون منذ أطول مدة
 * (الترتيب نفسه في الدليل). بطاقاتٌ عامة فقط — لا صور ولا أماكن خلف بوابة الوصول —
 * وتختفي إن لم يكن ملفٌّ مفتوح، فتبقى الخريطة كما كانت.
 */
export function SupportPicks() {
  const c = useCopy(COPY);
  const list = useServerFn(listOrphanCards);
  const { data } = useQuery({
    queryKey: ["support-picks"],
    queryFn: () => list({ data: { funding: "open", sort: "waiting", limit: 3, offset: 0 } }),
    staleTime: 5 * 60_000,
  });
  const rows = data?.rows ?? [];
  if (!rows.length) return null;
  return (
    <section aria-labelledby="picks" className="mx-auto max-w-6xl px-4 pt-10 pb-6">
      <p className="text-sm font-bold text-bridge-ink">{c.eyebrow}</p>
      <h1 id="picks" className="mt-1 text-3xl font-bold">
        {c.title}
      </h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">{c.text}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((o) => (
          <OrphanCard key={o.id} orphan={o} />
        ))}
      </div>
      <a
        href="#support-map"
        className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary hover:underline"
      >
        <ArrowDown className="size-4" aria-hidden="true" />
        {c.orMap}
      </a>
    </section>
  );
}
