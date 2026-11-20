import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { TryChildCard } from "@/components/try/TryChildCard";
import { TryJourneyGuide } from "@/components/try/TryJourneyGuide";
import { defineCopy, useCopy } from "@/lib/locale";
import { tryChildrenByWait } from "@/lib/try-demo";

export const Route = createFileRoute("/try/")({ component: TryHome });

const COPY = defineCopy("routes/try.index", {
  ar: {
    steps: [
      { title: "اختر طفلاً", text: "ملفٌّ يُظهر حاجته الشهرية وما غُطّي منها." },
      { title: "اختر المبلغ وادفع", text: "شهرياً أو مرّةً واحدة، وترى أثره قبل الدفع." },
      { title: "شاهد أثرك", text: "«أثري» تبني صورتك، وقاعة الأثر تعرضها غامرة." },
    ],
    eyebrow: "جرّب المنصّة",
    title: "رحلة الكفالة كاملةً، في ثلاث دقائق",
    lead: "اختر طفلاً، واكفله، ثم شاهد أثر كفالتك يتشكّل أمامك. كل ما هنا افتراضي، فجرّب بلا قلق.",
    waiting: "ينتظرون منذ أطول مدة",
    order: "الترتيب نفسه في الدليل الحقيقي: الأطول انتظاراً أوّلاً.",
    fromMap: "ابدأ من الخريطة ثلاثية الأبعاد",
    toImpact: "انتقل إلى «أثري»",
  },
  en: {
    steps: [
      { title: "Choose a child", text: "A file showing the monthly need and how much is covered." },
      {
        title: "Choose an amount and pay",
        text: "Monthly or one-time, with the impact shown before you pay.",
      },
      {
        title: "See your impact",
        text: "“My impact” builds your picture; the Impact Hall shows it in full.",
      },
    ],
    eyebrow: "Try the platform",
    title: "The whole sponsorship journey, in three minutes",
    lead: "Choose a child, sponsor them, and watch your impact take shape. Everything here is sample data, so explore freely.",
    waiting: "Waiting the longest",
    order: "The same order as the real directory: longest wait first.",
    fromMap: "Start from the 3D map",
    toImpact: "Go to “My impact”",
  },
});

function TryHome() {
  const c = useCopy(COPY);
  const kids = tryChildrenByWait();
  return (
    <>
      <section className="try-rise text-center">
        <p className="eyebrow">{c.eyebrow}</p>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl leading-[1.4] font-bold md:text-[3.5rem] md:leading-[1.3]">
          {c.title}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-8 text-muted-foreground md:text-lg md:leading-9">
          {c.lead}
        </p>
        <div className="mt-8 flex justify-center">
          <TryJourneyGuide variant="hero" />
        </div>
      </section>

      {/* three steps on one ruled band: the numeral is the ornament, no icon chips */}
      <ol className="mt-14 grid divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {c.steps.map((s, i) => (
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
              {c.waiting}
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">{c.order}</p>
          </div>
          {/* the two ways on sit together at the end of the row; the cards below hold the primary action */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              to="/hall"
              search={{ try: 1 }}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-input px-5 text-sm font-bold text-foreground transition-colors hover:border-primary/50 hover:bg-secondary/60"
            >
              {c.fromMap}
            </Link>
            <Link
              to="/try/impact"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary underline-offset-4 hover:underline"
            >
              {c.toImpact}
              <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {kids.map((k, i) => (
            <TryChildCard key={k.id} child={k} delay={0.15 + i * 0.06} />
          ))}
        </div>
      </section>
    </>
  );
}
