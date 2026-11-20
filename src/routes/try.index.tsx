import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { TryChildCard } from "@/components/try/TryChildCard";
import { TryJourneyGuide } from "@/components/try/TryJourneyGuide";
import { tryChildrenByWait } from "@/lib/try-demo";

export const Route = createFileRoute("/try/")({ component: TryHome });

const STEPS = [
  { title: "اختر طفلاً", text: "ملفٌّ يُظهر حاجته الشهرية وما غُطّي منها." },
  {
    title: "اختر المبلغ وادفع",
    text: "شهرياً أو مرّةً واحدة، وترى أثره قبل الدفع.",
  },
  { title: "شاهد أثرك", text: "«أثري» تبني صورتك، وقاعة الأثر تعرضها غامرة." },
];

function TryHome() {
  const kids = tryChildrenByWait();
  return (
    <>
      <section className="try-rise text-center">
        <p className="eyebrow">جرّب المنصّة</p>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl leading-[1.4] font-bold md:text-[3.5rem] md:leading-[1.3]">
          رحلة الكفالة كاملةً، في ثلاث دقائق
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-8 text-muted-foreground md:text-lg md:leading-9">
          اختر طفلاً، واكفله، ثم شاهد أثر كفالتك يتشكّل أمامك. كل ما هنا افتراضي، فجرّب بلا قلق.
        </p>
        <div className="mt-8 flex justify-center">
          <TryJourneyGuide variant="hero" />
        </div>
      </section>

      {/* three steps on one ruled band: the numeral is the ornament, no icon chips */}
      <ol className="mt-14 grid divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className="try-rise flex items-start gap-4 py-6 sm:px-7 sm:py-7 sm:first:ps-0 sm:last:pe-0"
            style={{ animationDelay: `${0.1 + i * 0.08}s` }}
          >
            <span className="numeral text-[2.75rem] text-primary/30" aria-hidden="true">
              {i + 1}
            </span>
            <span>
              <span className="block text-lg font-bold">{s.title}</span>
              <span className="mt-1 block text-sm leading-7 text-muted-foreground">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>

      <section aria-labelledby="try-kids" className="mt-16 md:mt-20">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div>
            <h2 id="try-kids" className="heading-section">
              ينتظرون منذ أطول مدة
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              الترتيب نفسه في الدليل الحقيقي: الأطول انتظاراً أوّلاً.
            </p>
          </div>
          {/* the two ways on sit together at the end of the row; the cards below hold the primary action */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              to="/hall"
              search={{ try: 1 }}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-input px-5 text-sm font-bold text-foreground transition-colors hover:border-primary/50 hover:bg-secondary/60"
            >
              ابدأ من الخريطة ثلاثية الأبعاد
            </Link>
            <Link
              to="/try/impact"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary underline-offset-4 hover:underline"
            >
              انتقل إلى «أثري»
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {kids.map((c, i) => (
            <TryChildCard key={c.id} child={c} delay={0.15 + i * 0.06} />
          ))}
        </div>
      </section>
    </>
  );
}
