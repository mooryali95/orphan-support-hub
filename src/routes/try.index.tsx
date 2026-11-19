import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, HeartHandshake, Receipt, Sparkles } from "lucide-react";

import { TryChildCard } from "@/components/try/TryChildCard";
import { TryJourneyGuide } from "@/components/try/TryJourneyGuide";
import { tryChildrenByWait } from "@/lib/try-demo";

export const Route = createFileRoute("/try/")({ component: TryHome });

const STEPS = [
  { icon: HeartHandshake, title: "اختر طفلاً", text: "ملفٌّ يُظهر حاجته الشهرية وما غُطّي منها." },
  {
    icon: Receipt,
    title: "اختر المبلغ وادفع",
    text: "شهرياً أو مرّةً واحدة، وترى أثره قبل الدفع.",
  },
  { icon: Sparkles, title: "شاهد أثرك", text: "«أثري» تبني صورتك، وقاعة الأثر تعرضها غامرة." },
];

function TryHome() {
  const kids = tryChildrenByWait();
  return (
    <>
      <section className="try-rise text-center">
        <p className="text-sm font-bold text-bridge-ink">جرّب المنصّة</p>
        <h1 className="mx-auto mt-2 max-w-2xl text-4xl font-bold leading-tight md:text-5xl">
          رحلة الكفالة كاملةً، في ثلاث دقائق
        </h1>
        <p className="mx-auto mt-4 max-w-xl leading-8 text-muted-foreground">
          اختر طفلاً، واكفله، ثم شاهد أثر كفالتك يتشكّل أمامك. كل ما هنا افتراضي، فجرّب بلا قلق.
        </p>
        <div className="mt-6 flex justify-center">
          <TryJourneyGuide variant="hero" />
        </div>
      </section>

      <ol className="mt-10 grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className="try-rise flex gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft"
            style={{ animationDelay: `${0.1 + i * 0.08}s` }}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <s.icon className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block font-bold">
                {i + 1}. {s.title}
              </span>
              <span className="mt-0.5 block text-sm leading-6 text-muted-foreground">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>

      <section aria-labelledby="try-kids" className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="try-kids" className="text-2xl font-bold">
              ينتظرون منذ أطول مدة
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              الترتيب نفسه في الدليل الحقيقي: الأطول انتظاراً أوّلاً.
            </p>
          </div>
          <Link
            to="/hall"
            search={{ try: 1 }}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            ابدأ من الخريطة ثلاثية الأبعاد
          </Link>
          <Link
            to="/try/impact"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary hover:underline"
          >
            انتقل إلى «أثري»
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kids.map((c, i) => (
            <TryChildCard key={c.id} child={c} delay={0.15 + i * 0.06} />
          ))}
        </div>
      </section>
    </>
  );
}
