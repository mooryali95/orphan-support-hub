/**
 * نافذة منصّة الرؤية والتوجهات في الصفحة الأولى: بطاقةٌ بهوية الشريك تدعو إلى
 * التجربة — بدورٍ مباشرةً أو بالجولة الموجَّهة — بلا حساب.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ClipboardCheck, HandHeart, Landmark, Play } from "lucide-react";

import { defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("components/vision/VisionTeaser", {
  ar: {
    tag: "تجربةٌ حيّة · بلا حساب",
    h: "منصّة الرؤية والتوجهات",
    lead: "التشغيل والدعم والقرار في منظومةٍ واحدة: تبرّعٌ يصل مجموعة، فتُعقد جلساتها وتُقاس، فيتغيّر القرار. جرّبها بنفسك — كلّ شيءٍ يُحفظ في متصفّحك.",
    supporter: "داعم",
    supervisor: "مشرف",
    decider: "صاحب قرار",
    enter: "ادخل بدورك",
    story: "شاهد القصّة",
  },
  en: {
    tag: "Live demo · no account",
    h: "The Vision and Directions platform",
    lead: "Operations, support and decision in one system: a donation reaches a group, its sessions are held and measured, and the decision changes. Try it yourself — everything stays in your browser.",
    supporter: "Supporter",
    supervisor: "Supervisor",
    decider: "Decision-maker",
    enter: "Enter by role",
    story: "Watch the story",
  },
});

export function VisionTeaser() {
  const c = useCopy(COPY);
  return (
    <section
      className="theme-light reveal-scroll mx-auto max-w-6xl px-4 py-12"
      aria-labelledby="vision-teaser-h"
    >
      <div className="relative overflow-hidden rounded-[2rem] bg-[radial-gradient(120%_90%_at_85%_0%,#7a2236,var(--color-wine-deep)_72%)] p-8 text-ivory md:p-12">
        <div aria-hidden="true" className="vision-halo pointer-events-none absolute inset-0" />
        <div className="relative grid items-center gap-8 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="inline-flex rounded-full bg-gold px-3 py-1 text-xs font-bold text-wine-deep">
              {c.tag}
            </p>
            <h2 id="vision-teaser-h" className="mt-4 text-3xl font-extrabold md:text-4xl">
              {c.h}
            </h2>
            <p className="mt-3 max-w-xl leading-8 text-ivory/80">{c.lead}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/vision/me"
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-gold px-6 font-bold text-wine-deep transition-transform hover:-translate-y-0.5 active:scale-[0.97]"
              >
                {c.enter}
                <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
              </Link>
              <Link
                to="/vision"
                className="inline-flex min-h-12 items-center gap-2 rounded-full border border-gold/50 px-6 font-semibold text-gold-soft transition-colors hover:bg-white/5"
              >
                <Play className="size-4 fill-current" aria-hidden="true" />
                {c.story}
              </Link>
            </div>
          </div>
          <ul className="grid grid-cols-3 gap-3">
            {(
              [
                [HandHeart, c.supporter],
                [ClipboardCheck, c.supervisor],
                [Landmark, c.decider],
              ] as const
            ).map(([Icon, label]) => (
              <li key={label}>
                <Link
                  to="/vision/me"
                  className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-2 py-5 text-center transition-[transform,background-color] hover:-translate-y-1 hover:bg-white/10"
                >
                  <span className="grid size-12 place-items-center rounded-2xl bg-gold text-wine-deep">
                    <Icon className="size-6" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
