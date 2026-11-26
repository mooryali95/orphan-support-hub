import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { TryChildCard } from "@/components/try/TryChildCard";
import { TryDirectory } from "@/components/try/TryDirectory";
import { TryRoles } from "@/components/try/TryRoles";
import { TryStoryEntry } from "@/components/try/story/TryStoryEntry";
import { TryJourneyGuide } from "@/components/try/TryJourneyGuide";
import { useTryHallSearch } from "@/components/try/useTryHallSearch";
import { GIVING_TRACKS, useGivingCopy } from "@/config/giving-tracks";
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
    lead: "اختر طفلاً، واكفله، ثم شاهد أثر كفالتك يتشكّل أمامك. كلّ ما هنا ببياناتٍ نموذجية، ولا يُخصم شيء.",
    waiting: "ينتظرون منذ أطول مدة",
    order: "الترتيب نفسه في الدليل الحقيقي: الأطول انتظاراً أوّلاً.",
    everywhere: "وفي كلّ دولةٍ على خريطة الدعم طفلٌ ومجموعةٌ ومنطقتان",
    fromMap: "ابدأ من الخريطة ثلاثية الأبعاد",
    cycleEyebrow: "العرض التفاعلي",
    cycleTitle: "الدورة الكاملة: من الجهة الميدانية إلى أثر الداعم",
    cycleText:
      "أدخِل ملفّ طفل كجهة ميدانية، ووثّقه واعتمده كإدارة، ثم اكفله كداعم، وأرسل تقرير الشهر الأوّل كمكتب — في دقائق، بالخطوات نفسها في المنصّة الحقيقية.",
    cycleCta: "ابدأ الدورة",
    doors: "ثلاثة أبوابٍ للعطاء، ولكلٍّ أثره",
    doorsLead:
      "اكفل يتيماً كفالةً مادية من القائمة أدناه، أو ادعم من الخريطة تأهيلاً أو عيناً: لطفلٍ أو مجموعته أو منطقته أو دولته. ثم قارن الأثر في «أثري».",
    doorImpact: {
      qualification: "أثره: تطوّر يُقاس، جلساتٌ وسمات",
      monthly: "أثره: سجلّ ما دُفع ووصل",
      in_kind: "أثره: تسليمٌ بمستنده",
    },
    doorCta: {
      qualification: "ادعم من الخريطة",
      monthly: "اختر طفلاً",
      in_kind: "ادعم من الخريطة",
    },
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
    everywhere: "And every country on the support map has a child, a group and two regions",
    fromMap: "Start from the 3D map",
    cycleEyebrow: "Interactive demo",
    cycleTitle: "The full cycle: from care organization to the supporter's impact",
    cycleText:
      "Enter a child's file as a care organization, verify and approve it as the administration, sponsor it as a supporter, and send the first monthly report as an office: in minutes, with the same steps as the real platform.",
    cycleCta: "Start the cycle",
    doors: "Three doors for giving, each with its own impact",
    doorsLead:
      "Sponsor a child financially from the list below, or support qualification or in-kind giving from the map: for a child, their group, their region or their country. Then compare the impact in “My impact”.",
    doorImpact: {
      qualification: "Its impact: measured development, in sessions and traits",
      monthly: "Its impact: a record of what was paid and delivered",
      in_kind: "Its impact: a delivery with its document",
    },
    doorCta: {
      qualification: "Support from the map",
      monthly: "Choose a child",
      in_kind: "Support from the map",
    },
    toImpact: "Go to “My impact”",
  },
});

function TryHome() {
  const c = useCopy(COPY);
  const hallSearch = useTryHallSearch();
  const kids = tryChildrenByWait();
  const giving = useGivingCopy();
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

      <TryRoles />

      <TryStoryEntry />

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

      {/* «الدورة الكاملة»: ملفٌّ واحد يُرى ينتقل عبر كلّ الأدوار — أقوى ما يُعرض لصاحب القرار */}
      <Link
        to="/try/cycle"
        className="group mt-12 flex flex-col gap-4 rounded-3xl bg-primary p-6 text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:flex-row sm:items-center sm:p-8"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold tracking-wide opacity-80">{c.cycleEyebrow}</span>
          <span className="mt-2 block text-2xl font-bold">{c.cycleTitle}</span>
          <span className="mt-2 block max-w-2xl text-sm leading-7 opacity-90">{c.cycleText}</span>
        </span>
        <span className="inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-full bg-primary-foreground px-5 text-sm font-bold text-primary sm:self-center">
          {c.cycleCta}
          <ArrowLeft
            className="size-4 transition-transform group-hover:-translate-x-0.5 ltr:-scale-x-100"
            aria-hidden="true"
          />
        </span>
      </Link>

      {/* the three giving tracks, as on the home page: each door says what its impact looks like */}
      <section aria-labelledby="try-doors" className="mt-14">
        <h2 id="try-doors" className="heading-section">
          {c.doors}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">{c.doorsLead}</p>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {GIVING_TRACKS.map((k, i) => {
            const body = (
              <>
                <span className="block text-lg font-bold">{giving.tracks[k].name}</span>
                <span className="mt-2 block text-sm leading-7 text-muted-foreground">
                  {giving.tracks[k].promise}
                </span>
                <span className="mt-3 block border-t border-bridge/40 pt-3 text-sm font-bold text-bridge-ink">
                  {c.doorImpact[k]}
                </span>
                <span className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary">
                  {c.doorCta[k]}
                  <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
                </span>
              </>
            );
            const cls =
              "try-rise block h-full rounded-2xl border border-border bg-card p-5 shadow-soft transition-colors hover:border-primary/50 hover:bg-secondary/40";
            const style = { animationDelay: `${0.12 + i * 0.06}s` };
            return (
              <li key={k}>
                {k === "monthly" ? (
                  <a href="#try-kids" data-door={k} className={cls} style={style}>
                    {body}
                  </a>
                ) : (
                  <Link
                    to="/try/support"
                    search={{ kind: k }}
                    data-door={k}
                    className={cls}
                    style={style}
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="try-kids" className="mt-16 scroll-mt-24 md:mt-20">
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
              search={hallSearch}
              preload="intent"
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
        <Link
          to="/try/support"
          className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary underline-offset-4 hover:underline"
        >
          {c.everywhere}
          <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
        </Link>
      </section>

      <TryDirectory />
    </>
  );
}
