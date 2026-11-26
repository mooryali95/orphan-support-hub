import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  HeartHandshake,
  LayoutDashboard,
  Route as RouteIcon,
  UserCheck,
} from "lucide-react";

import { defineCopy, useCopy } from "@/lib/locale";

type Audience = "sponsor" | "partner" | "admin";

const COPY = defineCopy("components/try/story/TryStoryEntry", {
  ar: {
    eyebrow: "قصّة الثقة · دقيقتان",
    title: "كيف تُبنى الثقة في كلّ خطوة؟",
    lead: "طفلةٌ واحدة من سجلّ الندوة إلى أثر كافلها، بعين كلّ من يمسّ ملفّها. اختر من أين تبدأ؛ القصّة واحدة.",
    all: "القصّة كاملةً من أوّلها",
    who: {
      sponsor: "أنا كافل",
      partner: "أنا جهةٌ شريكة",
      admin: "أنا من الإدارة",
    } satisfies Record<Audience, string>,
    sees: {
      sponsor: "الشارة قبل الكفالة، والتقرير بعدها",
      partner: "تغييرٌ مريب يحسمه مشرفٌ ثانٍ",
      admin: "الأثر في مركز الثقة، ثم كيف وصل",
    } satisfies Record<Audience, string>,
  },
  en: {
    eyebrow: "The trust story · two minutes",
    title: "How is trust built at every step?",
    lead: "One child, from WAMY's record to her sponsor's impact, through the eyes of everyone who touches her file. Choose where to start; the story is the same.",
    all: "The whole story from the start",
    who: {
      sponsor: "I'm a sponsor",
      partner: "I'm a partner organization",
      admin: "I'm in administration",
    } satisfies Record<Audience, string>,
    sees: {
      sponsor: "The badge before sponsoring, the report after",
      partner: "A suspicious change settled by a second supervisor",
      admin: "The effect in the trust center, then how it got there",
    } satisfies Record<Audience, string>,
  },
});

const AUDIENCES: Array<{ key: Audience; Icon: typeof HeartHandshake }> = [
  { key: "sponsor", Icon: HeartHandshake },
  { key: "partner", Icon: UserCheck },
  { key: "admin", Icon: LayoutDashboard },
];

/** مداخل القصّة الموجّهة على بيت التجربة: القصّة نفسها، من عين كلّ جهة. */
export function TryStoryEntry() {
  const t = useCopy(COPY);
  return (
    <section
      aria-labelledby="try-story-entry"
      className="try-rise border-border bg-card mt-12 rounded-3xl border p-5 shadow-soft sm:p-8"
    >
      <p className="eyebrow">{t.eyebrow}</p>
      <h2 id="try-story-entry" className="heading-section mt-3 text-balance">
        {t.title}
      </h2>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-7 text-pretty">{t.lead}</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {AUDIENCES.map(({ key, Icon }) => (
          <li key={key}>
            <Link
              to="/try/journey"
              search={{ as: key }}
              data-audience={key}
              className="group border-border bg-background hover:border-primary/50 focus-visible:ring-ring flex h-full min-h-11 items-start gap-3 rounded-2xl border p-4 transition-[border-color,background-color,transform] focus-visible:ring-2 focus-visible:outline-none active:scale-[0.98]"
            >
              <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-full">
                <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-bold">{t.who[key]}</span>
                <span className="text-muted-foreground mt-1 block text-sm leading-6">
                  {t.sees[key]}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        to="/try/journey"
        className="text-primary mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold underline-offset-4 hover:underline"
      >
        <RouteIcon className="size-4" aria-hidden="true" />
        {t.all}
        <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
      </Link>
    </section>
  );
}
