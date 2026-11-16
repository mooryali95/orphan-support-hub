import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Orbit, Wallet } from "lucide-react";

import { ConceptBadge, Tally, useT, VisionShell } from "@/components/vision/VisionKit";
import { DonateForm, Feed } from "@/components/vision/VisionStore";
import { pageTitle } from "@/config/brand";
import { LAYERS, SYSTEM } from "@/data/vision-demo";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/vision/")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const c = copyOf(COPY, l);
    return {
      meta: [{ title: pageTitle(c.title, false, l) }, { name: "description", content: c.lead }],
    };
  },
  component: VisionHub,
});

const COPY = defineCopy("routes/vision.index", {
  ar: {
    title: "منصة الرؤية والتوجهات",
    lead: "رؤيةٌ من ثلاث طبقات، أولاها تعمل اليوم: التشغيل حيث يُبنى اليتيم، والدعم حيث يختار الداعم أثره، والقرار حيث تُرى المنظومة كلّها.",
    tagline: "رعايةٌ تبني الأهليّة",
    open: "افتح",
    sponsored: "يتيمٍ في كفالة الندوة",
    measured: "في رحلة تأهيلٍ مقيسة",
    offices: "مكتباً وشريكاً حول العالم",
    cycleH: "اليتيم في قلب المنظومة",
    cycleText: "تبرّعٌ واحد يمرّ بالطبقات الثلاث ويعود قراراً — خطوةً بخطوة.",
    moneyH: "رحلة المال",
    moneyText: "أين يصل المال وكيف: من ضغطة الداعم إلى يد المشرف، بسجلٍّ لا يُمحى.",
    watch: "شاهد",
    enter: "ادخل بدورك: داعم، مشرف، صاحب قرار",
    liveH: "نظامٌ يعمل، لا عرضٌ مسجَّل",
    liveLead:
      "تبرّع هنا، ثم افتح «التشغيل» لترى المجموعة تُموَّل وتسجّل جلساتها وقياسها، و«القرار» لترى الفجوة تضيق والتوصية تتغيّر — كلّ ذلك يتزامن بين التبويبات.",
  },
  en: {
    title: "The Vision and Directions platform",
    lead: "A vision in three layers, the first live today: operations where the orphan is built, support where the supporter chooses an impact, and decision where the whole system is seen.",
    tagline: "Care that builds capability",
    open: "Open",
    sponsored: "orphans sponsored by WAMY",
    measured: "in a measured qualification journey",
    offices: "offices and partners worldwide",
    cycleH: "The orphan at the heart of the system",
    cycleText:
      "One donation passes through the three layers and returns as a decision — step by step.",
    moneyH: "The money journey",
    moneyText:
      "Where the money lands and how: from the supporter's tap to the supervisor's hands, with an indelible record.",
    watch: "Watch",
    enter: "Enter by role: supporter, supervisor, decision-maker",
    liveH: "A working system, not a recording",
    liveLead:
      "Donate here, then open Operations to see the group funded and its sessions and measurement recorded, and Decision to see the gap narrow and the recommendation change — synced across tabs.",
  },
});

function VisionHub() {
  const c = useCopy(COPY);
  const tr = useT();
  return (
    <VisionShell>
      {/* المشهد الأوّل: نبيذيٌّ بعنوانٍ وثلاث شارات، كما يبدأ الفيلم. */}
      <section className="relative overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,#7a2236,var(--color-wine-deep)_75%)] text-ivory">
        <div aria-hidden="true" className="vision-halo pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-5xl px-4 py-20 text-center md:py-28">
          <span
            aria-hidden="true"
            className="vision-rise mx-auto grid size-20 place-items-center rounded-full bg-ivory font-serif text-4xl text-wine shadow-[0_0_0_8px_rgb(201_161_96/0.18)]"
          >
            هـ
          </span>
          <h1
            className="vision-rise mt-6 text-4xl font-extrabold md:text-6xl"
            style={{ animationDelay: "120ms" }}
          >
            {c.title}
          </h1>
          <p
            className="vision-rise mt-2 font-serif text-2xl text-gold"
            style={{ animationDelay: "200ms" }}
          >
            {c.tagline}
          </p>
          <p
            className="vision-rise mx-auto mt-4 max-w-2xl leading-8 text-ivory/75"
            style={{ animationDelay: "280ms" }}
          >
            {c.lead}
          </p>
          <ul
            className="vision-rise mt-6 flex flex-wrap justify-center gap-2"
            style={{ animationDelay: "360ms" }}
          >
            {LAYERS.map((l) => (
              <li
                key={l.key}
                className="rounded-full border border-gold/40 px-4 py-1.5 text-sm text-gold-soft"
              >
                {tr(l.name)}
              </li>
            ))}
          </ul>
          <Link
            to="/vision/me"
            className="vision-rise mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-gold px-7 font-bold text-wine-deep shadow-[0_12px_32px_-12px_rgb(201_161_96/0.7)] transition-transform hover:-translate-y-0.5 active:scale-[0.97]"
            style={{ animationDelay: "420ms" }}
          >
            {c.enter}
            <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
          </Link>
          <dl className="mx-auto mt-12 grid max-w-3xl grid-cols-3 gap-4">
            {(
              [
                [SYSTEM.sponsored, c.sponsored],
                [SYSTEM.measured, c.measured],
                [SYSTEM.offices, c.offices],
              ] as const
            ).map(([n, label]) => (
              <div key={label}>
                <dd className="text-3xl text-gold md:text-5xl">
                  <Tally to={n} />
                </dd>
                <dt className="mt-1 text-xs text-ivory/65 md:text-sm">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* الطبقات الثلاث */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <ol className="grid gap-5 lg:grid-cols-3">
          {LAYERS.map((l, i) => (
            <li key={l.key} style={{ ["--i" as string]: i }} className="stagger-in">
              <Link
                to={l.path}
                className={cn(
                  "group flex h-full flex-col rounded-3xl p-6 transition-[transform,box-shadow] duration-300 hover:-translate-y-1",
                  l.key === "decision"
                    ? "bg-[linear-gradient(160deg,#5b1626,var(--color-wine-deep))] text-ivory shadow-[0_24px_48px_-24px_rgb(43_11_20/0.7)]"
                    : "border border-wine/10 bg-white shadow-[0_18px_40px_-28px_rgb(43_11_20/0.5)] hover:shadow-[0_24px_48px_-24px_rgb(43_11_20/0.5)]",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "font-serif text-4xl",
                      l.key === "decision" ? "text-gold" : "text-gold-ink",
                    )}
                  >
                    {l.n}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      l.key === "decision" ? "bg-gold text-wine-deep" : "bg-wine/8 text-wine",
                    )}
                  >
                    {tr(l.status)}
                  </span>
                </div>
                <p
                  className={cn(
                    "mt-4 text-sm font-semibold",
                    l.key === "decision" ? "text-gold" : "text-gold-ink",
                  )}
                >
                  {tr(l.name)}
                </p>
                <h2
                  className={cn(
                    "mt-1 text-2xl font-extrabold",
                    l.key !== "decision" && "text-wine",
                  )}
                >
                  {tr(l.title)}
                </h2>
                <p
                  className={cn(
                    "mt-2 flex-1 text-sm leading-7",
                    l.key === "decision" ? "text-ivory/75" : "text-muted-foreground",
                  )}
                >
                  {tr(l.lead)}
                </p>
                <p
                  className={cn(
                    "mt-4 border-t pt-3 text-xs",
                    l.key === "decision"
                      ? "border-white/10 text-gold-soft"
                      : "border-wine/10 text-gold-ink",
                  )}
                >
                  {tr(l.sees)}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold">
                  {c.open}
                  <ArrowLeft
                    className="size-4 transition-transform group-hover:-translate-x-1 ltr:-scale-x-100 ltr:group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ol>

        <div className="mt-10 text-center">
          <h2 className="text-2xl font-extrabold text-wine md:text-3xl">{c.liveH}</h2>
          <p className="mx-auto mt-2 max-w-2xl text-muted-foreground">{c.liveLead}</p>
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <DonateForm />
          <Feed limit={9} />
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {(
            [
              ["/vision/cycle", Orbit, c.cycleH, c.cycleText],
              ["/vision/payments", Wallet, c.moneyH, c.moneyText],
            ] as const
          ).map(([to, Icon, h, text]) => (
            <Link
              key={to}
              to={to}
              className="group flex items-center gap-5 rounded-3xl border border-gold/40 bg-white/70 p-6 transition-[transform,background-color] duration-300 hover:-translate-y-0.5 hover:bg-white"
            >
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-wine text-gold">
                <Icon className="size-7" aria-hidden="true" />
              </span>
              <span className="flex-1">
                <span className="block text-lg font-bold text-wine">{h}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{text}</span>
              </span>
              <span className="text-sm font-semibold text-wine">{c.watch}</span>
            </Link>
          ))}
        </div>
        <div className="mt-8 text-center">
          <ConceptBadge />
        </div>
      </section>
    </VisionShell>
  );
}
