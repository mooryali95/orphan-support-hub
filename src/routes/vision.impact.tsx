import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Award, Globe2, Sparkles, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { WatchStory } from "@/components/vision/Story";
import { Bar, Eyebrow, Tally, useNum, useT, VisionShell } from "@/components/vision/VisionKit";
import { usePlace, useVision } from "@/components/vision/VisionStore";
import { pageTitle } from "@/config/brand";
import { TRAITS } from "@/data/vision-demo";
import { flagOf, NETWORK } from "@/data/vision-network";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";
import {
  childrenOf,
  type DemoChild,
  growthOf,
  type Level,
  LEVELS,
  levelOf,
  traitsOf,
} from "@/lib/vision-children";
import type { GroupState } from "@/lib/vision-engine";

export const Route = createFileRoute("/vision/impact")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const c = copyOf(COPY, l);
    return {
      meta: [{ title: pageTitle(c.title, false, l) }, { name: "description", content: c.lead }],
    };
  },
  component: () => (
    <VisionShell>
      <ImpactPage />
    </VisionShell>
  ),
});

const COPY = defineCopy("routes/vision.impact", {
  ar: {
    label: "الأثر",
    title: "ما الذي تغيّر فعلاً",
    lead: "الأثر بثلاث درجات: طفلٌ ارتفع مستواه، ومجموعةٌ أتمّت تأهيلها، ودولةٌ يتقدّم فيها التأهيل، كلّه من القياس قبل الرحلة وبعدها.",
    kidsUp: "طفلاً ارتفع مستواه",
    groupsDone: "مجموعةً أتمّت تأهيلها",
    qualified: "يتيماً أتمّ رحلة التأهيل",
    share: "من حاجة ألبانيا تأهّل",
    groupsH: "مجموعاتٌ تأهّلت",
    groupsLead: "أتمّت الجلسات الستّ وقيست بعدها، شهادة تأهيلٍ لكلّ مجموعة.",
    certified: "مجموعةٌ متأهّلة",
    members: (n: number) => `${n} أطفال`,
    avgRise: "متوسّط الارتفاع",
    dist: "توزيع المستويات: قبل ← بعد",
    before: "قبل",
    after: "بعد",
    kidsH: "قصص ارتفاع المستوى",
    kidsLead: "أطفالٌ انتقلوا إلى مستوى أعلى، بأسماءٍ مستعارة، والسمات الستّ قبل الرحلة وبعدها.",
    from: (a: string, b: string) => `من «${a}» إلى «${b}»`,
    placesH: "المدن والدول",
    placesLead: "كم من حاجة كلّ مكانٍ أتمّ التأهيل، ودول الشبكة بما قيس فيها.",
    cityLine: (q: number, n: number) => `${q} تأهّلوا · ${n} ينتظرون`,
    measuredIn: (n: string) => `${n} في رحلةٍ مقيسة`,
    allCountries: "كلّ الدول",
    virtual: "نموذجي",
    emptyH: "لم يُقَس أحدٌ بعد في بيئتك",
    emptyText:
      "الأثر يظهر بعد القياس البعدي. شاهد القصّة، أو ادخل مشرفاً وسجّل جلسات مجموعةٍ ثم قياسها.",
    asSupervisor: "ادخل مشرفاً",
    fileOf: "نموّ الطفل",
    arrow: "←",
    traitsH: "السمات الستّ",
    level: {
      start: "في البداية",
      growing: "نامٍ",
      capable: "متمكّن",
      distinct: "متميّز",
    } as Record<Level, string>,
  },
  en: {
    label: "Impact",
    title: "What actually changed",
    lead: "Impact at three scales: a child who rose a level, a group that completed qualification, and a country where qualification advances, all from measurement before and after the journey.",
    kidsUp: "children rose a level",
    groupsDone: "groups completed qualification",
    qualified: "orphans completed the journey",
    share: "of Albania's need qualified",
    groupsH: "Groups that qualified",
    groupsLead:
      "Completed six sessions and were measured after; a qualification certificate for each group.",
    certified: "Qualified group",
    members: (n: number) => `${n} children`,
    avgRise: "Average rise",
    dist: "Level distribution: before → after",
    before: "Before",
    after: "After",
    kidsH: "Stories of rising levels",
    kidsLead:
      "Children who moved to a higher level, shown under pseudonyms, with the six traits before and after.",
    from: (a: string, b: string) => `From “${a}” to “${b}”`,
    placesH: "Cities and countries",
    placesLead:
      "How much of each place's need completed qualification, and the network's countries with what was measured.",
    cityLine: (q: number, n: number) => `${q} qualified · ${n} waiting`,
    measuredIn: (n: string) => `${n} in a measured journey`,
    allCountries: "All countries",
    virtual: "Sample",
    emptyH: "No one has been measured in your sandbox yet",
    emptyText:
      "Impact appears after follow-up measurement. Watch the story, or enter as a supervisor and record a group's sessions and measurement.",
    asSupervisor: "Enter as supervisor",
    fileOf: "Child's growth",
    arrow: "→",
    traitsH: "The six traits",
    level: {
      start: "Starting",
      growing: "Growing",
      capable: "Capable",
      distinct: "Distinguished",
    } as Record<Level, string>,
  },
});

const LEVEL_TONE: Record<Level, string> = {
  start: "bg-wine/15",
  growing: "bg-wine/40",
  capable: "bg-wine",
  distinct: "bg-gold",
};

function ImpactPage() {
  const c = useCopy(COPY);
  const tr = useT();
  const num = useNum();
  const place = usePlace();
  const { state } = useVision();
  const [open, setOpen] = useState<DemoChild | null>(null);

  const done = state.groups.filter((g) => g.after !== null);
  const growth = useMemo(
    () =>
      done.flatMap((g) => childrenOf(g).map((k) => ({ k, g, ...growthOf(traitsOf(k, TRAITS)) }))),
    [done],
  );
  const up = growth
    .filter((x) => x.leveledUp)
    .sort((a, b) => b.after! - b.before - (a.after! - a.before));
  const qualified = done.reduce((a, g) => a + g.members, 0);
  const waiting = state.cities.reduce((a, x) => a + x.need, 0);
  const share = qualified + waiting ? Math.round((qualified / (qualified + waiting)) * 100) : 0;

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
      <Eyebrow label={c.label} title={c.title} lead={c.lead} />

      <dl className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(
          [
            [up.length, c.kidsUp, TrendingUp, ""],
            [done.length, c.groupsDone, Award, ""],
            [qualified, c.qualified, Sparkles, ""],
            [share, c.share, Globe2, "%"],
          ] as const
        ).map(([n, label, Icon, suf]) => (
          <div
            key={label}
            className="rounded-3xl bg-[linear-gradient(160deg,#5b1626,var(--color-wine-deep))] p-5 text-ivory"
          >
            <Icon className="size-5 text-gold" aria-hidden="true" />
            <dd className="mt-3 text-4xl text-gold">
              <Tally to={n} suffix={suf} />
            </dd>
            <dt className="mt-1 text-xs text-ivory/75">{label}</dt>
          </div>
        ))}
      </dl>

      {done.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-wine/20 bg-white/60 p-10 text-center">
          <h2 className="text-xl font-bold text-wine">{c.emptyH}</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
            {c.emptyText}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <WatchStory />
            <Link
              to="/vision/me"
              className="inline-flex min-h-12 items-center rounded-full border border-wine/20 px-6 font-semibold text-wine"
            >
              {c.asSupervisor}
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* المجموعات */}
          <section className="mt-12" aria-labelledby="g-h">
            <h2 id="g-h" className="text-2xl font-extrabold text-wine">
              {c.groupsH}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{c.groupsLead}</p>
            <ul className="mt-5 grid gap-4 md:grid-cols-2">
              {done.map((g, i) => (
                <li key={g.id} style={{ ["--i" as string]: i }} className="stagger-in">
                  <GroupCertificate g={g} title={place(g.id)} city={place(g.city)} />
                </li>
              ))}
            </ul>
          </section>

          {/* الأطفال */}
          <section className="mt-12" aria-labelledby="k-h">
            <h2 id="k-h" className="text-2xl font-extrabold text-wine">
              {c.kidsH}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{c.kidsLead}</p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {up.slice(0, 9).map(({ k, g, before, after, from, to }) => (
                <li key={k.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(k)}
                    className="flex w-full items-center gap-4 rounded-2xl border border-wine/10 bg-white p-4 text-start transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-18px_rgb(43_11_20/0.5)] active:scale-[0.99]"
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-gold-soft),var(--color-ivory))] font-serif text-lg text-wine ring-1 ring-gold/40">
                      {tr(k.pseudonym)
                        .replace(/[«»“”.\s]/g, "")
                        .slice(0, 2)}
                    </span>
                    <span className="flex-1">
                      <span className="block font-bold text-wine">
                        {tr(k.pseudonym)} · {k.age}
                      </span>
                      <span className="block text-xs text-muted-foreground">{place(g.id)}</span>
                      <span className="mt-1 block text-xs font-semibold text-gold-ink">
                        {c.from(c.level[from], c.level[to!])}
                      </span>
                    </span>
                    <span dir="ltr" className="font-serif text-lg text-wine tabular-nums">
                      +{num(after! - before, { maximumFractionDigits: 1 })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {/* الأماكن */}
      <section className="mt-12" aria-labelledby="p-h">
        <h2 id="p-h" className="text-2xl font-extrabold text-wine">
          {c.placesH}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{c.placesLead}</p>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <ul className="space-y-3 rounded-3xl border border-wine/10 bg-white p-5">
            {state.cities.map((city) => {
              const q = done.filter((g) => g.city === city.id).reduce((a, g) => a + g.members, 0);
              const pct = q + city.need ? (q / (q + city.need)) * 100 : 0;
              return (
                <li
                  key={city.id}
                  className="grid grid-cols-[6rem_1fr_auto] items-center gap-3 text-sm"
                >
                  <span className="font-semibold">{tr(city.name)}</span>
                  <Bar pct={pct} className="text-wine" />
                  <span className="text-xs text-muted-foreground">{c.cityLine(q, city.need)}</span>
                </li>
              );
            })}
          </ul>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[...NETWORK]
              .sort((a, b) => b.sim.measured - a.sim.measured)
              .slice(0, 9)
              .map((n) => (
                <li key={n.code} className="rounded-2xl border border-wine/10 bg-white p-3">
                  <p className="flex items-center gap-2 text-sm font-bold text-wine">
                    <span aria-hidden="true">{flagOf(n.code)}</span>
                    {tr(n.name)}
                  </p>
                  <Bar
                    pct={(n.sim.measured / Math.max(1, n.sim.inQualification)) * 100}
                    className="mt-2 text-wine"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {c.measuredIn(num(n.code === "AL" ? state.measured : n.sim.measured))}
                    {n.code !== "AL" && ` · ${c.virtual}`}
                  </p>
                </li>
              ))}
            <li className="col-span-full">
              <Link
                to="/vision/network"
                className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-wine"
              >
                {c.allCountries}
                <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
              </Link>
            </li>
          </ul>
        </div>
      </section>

      <GrowthSheet child={open} onClose={() => setOpen(null)} />
    </section>
  );
}

function GroupCertificate({ g, title, city }: { g: GroupState; title: string; city: string }) {
  const c = useCopy(COPY);
  const num = useNum();
  const kids = childrenOf(g).map((k) => growthOf(traitsOf(k, TRAITS)));
  const count = (xs: Level[]) => LEVELS.map((l) => xs.filter((x) => x === l).length);
  const b = count(kids.map((k) => k.from));
  const a = count(kids.map((k) => k.to ?? k.from));
  const rise = kids.reduce((s, k) => s + (k.after! - k.before), 0) / kids.length;
  return (
    <article className="relative overflow-hidden rounded-3xl border border-gold/40 bg-white p-6">
      <span
        aria-hidden="true"
        className="absolute -top-10 -end-10 size-32 rounded-full bg-gold/10"
      />
      <p className="flex items-center gap-1.5 text-xs font-semibold text-gold-ink">
        <Award className="size-4" aria-hidden="true" />
        {c.certified}
      </p>
      <h3 className="mt-1 text-xl font-extrabold text-wine">{title}</h3>
      <p className="text-xs text-muted-foreground">
        {city} · {c.members(g.members)}
      </p>
      <p className="mt-4 flex items-baseline gap-3">
        <span className="text-xs text-muted-foreground">{c.avgRise}</span>
        <span dir="ltr" className="font-serif text-3xl text-wine tabular-nums">
          +{num(rise, { maximumFractionDigits: 1 })}
        </span>
        <span dir="ltr" className="text-xs text-muted-foreground tabular-nums">
          {num(g.before, { maximumFractionDigits: 1 })} →{" "}
          {num(g.after!, { maximumFractionDigits: 1 })}
        </span>
      </p>
      <p className="mt-4 text-xs font-semibold text-muted-foreground">{c.dist}</p>
      {([b, a] as const).map((row, i) => (
        <div key={i} className="mt-2 flex items-center gap-2">
          <span className="w-8 text-[11px] text-muted-foreground">{i ? c.after : c.before}</span>
          <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-wine/5">
            {row.map((n, j) =>
              n ? (
                <span
                  key={j}
                  title={`${c.level[LEVELS[j]!]}: ${n}`}
                  className={cn("vision-bar h-full", LEVEL_TONE[LEVELS[j]!])}
                  style={{ width: `${(n / g.members) * 100}%` }}
                />
              ) : null,
            )}
          </div>
        </div>
      ))}
      <ul className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {LEVELS.map((l) => (
          <li key={l} className="flex items-center gap-1">
            <i aria-hidden="true" className={cn("size-2 rounded-full", LEVEL_TONE[l])} />
            {c.level[l]}
          </li>
        ))}
      </ul>
    </article>
  );
}

function GrowthSheet({ child, onClose }: { child: DemoChild | null; onClose: () => void }) {
  const c = useCopy(COPY);
  const tr = useT();
  const num = useNum();
  const scores = child ? traitsOf(child, TRAITS) : [];
  const gr = child ? growthOf(scores) : null;
  return (
    <Sheet open={!!child} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="theme-light w-full overflow-y-auto bg-ivory sm:max-w-md">
        {child && gr && (
          <>
            <SheetHeader>
              <p className="text-xs font-semibold text-gold-ink">{c.fileOf}</p>
              <SheetTitle className="text-2xl font-extrabold text-wine">
                {tr(child.pseudonym)}
              </SheetTitle>
              <SheetDescription>
                {gr.to && c.from(c.level[gr.from], c.level[gr.to])}
              </SheetDescription>
            </SheetHeader>
            <section className="space-y-4 px-4 pb-8">
              <h3 className="text-sm font-bold text-wine">{c.traitsH}</h3>
              {scores.map((s, i) => (
                <div key={s.key}>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">{tr(TRAITS[i]!.name)}</span>
                    <span dir="ltr" className="font-serif tabular-nums text-wine">
                      {num(s.before, { maximumFractionDigits: 1 })} →{" "}
                      {num(s.after ?? s.before, { maximumFractionDigits: 1 })}
                    </span>
                  </div>
                  <div className="relative mt-1 h-2 rounded-full bg-wine/10">
                    <span
                      className="absolute inset-y-0 start-0 rounded-full bg-gold"
                      style={{ width: `${((s.after ?? s.before) / 25) * 100}%` }}
                    />
                    <span
                      className="absolute inset-y-0 start-0 rounded-full bg-wine"
                      style={{ width: `${(s.before / 25) * 100}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {c.level[levelOf(s.before)]} {c.arrow} {c.level[levelOf(s.after ?? s.before)]}
                  </p>
                </div>
              ))}
            </section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
