import { Link } from "@tanstack/react-router";
import { Play, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { HallSearch } from "@/lib/hall/source";
import { defineCopy, pluralOf, useCopy } from "@/lib/locale";
import { impactAt, impactPercent, impactSpan, impactStats, type MyImpact } from "@/lib/my-impact";
import { trialRoute, type TrialPath } from "@/lib/trial-gate";

/**
 * «كوكبة أثرك»: الداعم في المركز، وكلّ طفلٍ يكفله جوهرةٌ على مدار. حول كلّ طفل
 * حلقتان: ما غطّاه الجميع من حاجته الشهرية (خافتة)، وحصّتك أنت منها (بلون الهوية).
 * الألوان من رموز الهوية فقط، فتعمل في الوضعين الفاتح والداكن.
 */
const COPY = defineCopy("components/impact/MyImpactHero", {
  ar: {
    today: "اليوم",
    monthsAgo: pluralOf(
      {
        one: "قبل شهر",
        two: "قبل شهرين",
        few: "قبل {0} أشهر",
        many: "قبل {0} شهراً",
        other: "قبل {0} شهر",
      },
      0,
      "ar",
    ),
    monthsOf: pluralOf(
      { one: "شهر واحد", two: "شهران", few: "{0} أشهر", many: "{0} شهراً", other: "{0} شهر" },
      0,
      "ar",
    ),
    eyebrow: "أثرك",
    title: "كوكبة أثرك",
    lead: "أنت في المركز، وحولك كلّ طفلٍ تكفله: الحلقة الواضحة حصّتك من حاجته الشهرية، والخافتة ما غطّاه كافلوه جميعاً.",
    inCare: ["في رعايتك", "طفلاً"],
    months: ["أشهر الرعاية", "شهراً"],
    share: ["حصّتك", "من حاجتهم"],
    immersive: "الوضع الغامر",
    another: "اكفل يتيماً آخر",
    figure: (list: string) => `كوكبة أثرك: ${list}`,
    sep: "، ",
    figureEmpty: "كوكبة أثرك فارغة بعد",
    you: "أنت",
    justBegan: "بدأت للتوّ",
    replayLabel: "شاهد أثرك يتكوّن منذ البداية",
    replay: "منذ البداية",
    rail: "مسار أثرك عبر الأشهر",
    empty: "حين تبدأ كفالتك الأولى تظهر هنا جوهرةً حولك.",
    invite:
      "أرقام أثرك تبدأ من أوّل شهرٍ تكفل فيه طفلاً: كم طفلاً في رعايتك، وكم شهراً، وكم من حاجتهم سددت.",
    more: (n: number) => `و${n} آخرون في قائمة كفالاتك.`,
    milestones: "محطّاتك",
  },
  en: {
    today: "Today",
    monthsAgo: pluralOf({ one: "{0} month ago", other: "{0} months ago" }),
    monthsOf: pluralOf({ one: "{0} month", other: "{0} months" }),
    eyebrow: "Your impact",
    title: "Your constellation",
    lead: "You are at the centre, and each child you sponsor is a gem around you. The clear ring is your share of the child's monthly need; the faint one is what all sponsors have covered.",
    inCare: ["In your care", "children"],
    months: ["Care so far", "months"],
    share: ["Your share", "of their need"],
    immersive: "Immersive view",
    another: "Sponsor another child",
    figure: (list: string) => `Your constellation: ${list}`,
    sep: ", ",
    figureEmpty: "Your constellation is still empty",
    you: "You",
    justBegan: "Just begun",
    replayLabel: "Watch your impact take shape from the start",
    replay: "From the start",
    rail: "Your impact across the months",
    empty: "When your first sponsorship begins, it appears here as a gem around you.",
    invite:
      "Your figures start with the first month you sponsor a child: how many in your care, for how many months, and how much of their need you meet.",
    more: (n: number) => `And ${n} more in your sponsorship list.`,
    milestones: "Your milestones",
  },
});

/* the drawing is nearly square so it stays legible on a phone (about 0.9x at 390px) */
const W = 360,
  H = 312,
  CX = W / 2,
  CY = 154,
  RX = 122,
  RY = 92,
  MAX = 8;
/** the break in the centre ring and in the orbit sits up and to the right, as the mark's does */
const BREAK = -57;

export function MyImpactHero({
  impact,
  loading,
  anotherTo = "/orphans",
  hallSearch,
  milestones,
}: {
  impact: MyImpact;
  loading: boolean;
  /** where «اكفل يتيماً آخر» leads; the client demo keeps the visitor inside /try */
  anotherTo?: "/orphans" | TrialPath;
  /** the demo opens the hall in demo mode, on the visitor's latest gift; `from` is the way back */
  hallSearch?: HallSearch;
  /** «محطّاتك» تُطوى داخل البطاقة (لوحة الداعم) */
  milestones?: ReactNode;
}) {
  /* the time rail: how many whole months back the picture stands (0 = today) */
  const span = impactSpan(impact);
  const c = useCopy(COPY);
  const ago = (n: number) => (n === 0 ? c.today : c.monthsAgo(n));
  const [back, setBack] = useState(0);
  const timer = useRef<number | null>(null);
  const stop = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const play = () => {
    stop();
    let b = span;
    setBack(b);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return setBack(0);
    timer.current = window.setInterval(
      () => {
        b -= 1;
        setBack(Math.max(0, b));
        if (b <= 0) stop();
      },
      Math.max(160, Math.min(700, 4200 / span)),
    );
  };
  const view = impactAt(impact, Math.min(back, span));
  const shown = view.children.slice(0, MAX);
  const more = view.children.length - shown.length;
  const rail = !loading && impact.children.length > 0 && span > 1;
  const pos = shown.map((_, i) => {
    const a = -Math.PI / 2 + (i / Math.max(1, shown.length)) * Math.PI * 2;
    // names sit outside the orbit: above the upper gems, below the rest
    return { x: CX + Math.cos(a) * RX, y: CY + Math.sin(a) * RY, up: Math.sin(a) < -0.3 };
  });
  const pct = impactPercent;
  // the figures as written (`impactStats`): the immersive hall writes the very same strings
  const figures = impactStats(view);
  const stats: [string, string, string, string][] = [
    [c.inCare[0]!, figures.inCare, "", c.inCare[1]!],
    [c.months[0]!, figures.months, "", c.months[1]!],
    [c.share[0]!, figures.share, "%", c.share[1]!],
  ];

  return (
    <section
      aria-labelledby="my-impact"
      className="impact-hero relative mt-8 overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-10"
    >
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12">
        <div>
          <p className="flex items-center gap-3 text-sm font-bold text-bridge-ink">
            <span aria-hidden="true" className="h-px w-8 bg-bridge" />
            {c.eyebrow}
          </p>
          <h2
            id="my-impact"
            className="mt-2 font-display text-4xl font-bold leading-tight sm:text-5xl"
          >
            {c.title}
          </h2>
          <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground">{c.lead}</p>

          {/* no gift yet: an invitation, not a row of zeros */}
          {!loading && impact.children.length === 0 ? (
            <p className="mt-7 border-y border-border py-4 text-sm leading-7 text-pretty">
              {c.invite}
            </p>
          ) : (
            <dl className="mt-7 grid grid-cols-3 border-y border-border">
              {stats.map(([label, value, suffix, unit], i) => (
                <div
                  key={label}
                  className={
                    i === 0
                      ? "min-w-0 py-4 pe-3"
                      : "min-w-0 border-s border-border px-3 py-4 sm:px-5"
                  }
                >
                  <dt className="truncate text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-2 flex flex-col gap-1.5">
                    {loading ? (
                      <Skeleton className="h-10 w-14" />
                    ) : (
                      <span
                        dir="ltr"
                        className="flex items-baseline justify-end gap-0.5 font-display text-4xl font-bold leading-none tabular-nums text-foreground sm:text-5xl"
                      >
                        {value}
                        {suffix && (
                          <span className="text-xl font-normal sm:text-2xl">{suffix}</span>
                        )}
                      </span>
                    )}
                    <span className="truncate text-xs text-muted-foreground">{unit}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/hall" search={hallSearch ?? {}} preload="intent">
                <Sparkles className="size-4" aria-hidden="true" />
                {c.immersive}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to={anotherTo === "/orphans" ? anotherTo : trialRoute(anotherTo)}>
                {c.another}
              </Link>
            </Button>
          </div>
        </div>

        <figure className="relative -order-1 lg:order-none">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mx-auto h-auto w-full max-w-[30rem] overflow-visible"
            role="img"
            aria-label={
              shown.length
                ? c.figure(shown.map((k) => `${k.name} ${pct(k.share)}`).join(c.sep))
                : c.figureEmpty
            }
          >
            {/* the orbit: one hairline, broken once — the mark's ring, as a path for the gems */}
            <ellipse
              cx={CX}
              cy={CY}
              rx={RX}
              ry={RY}
              fill="none"
              strokeWidth={0.75}
              pathLength={100}
              strokeDasharray="82 4 14 0"
              style={{ stroke: "var(--border)" }}
            />
            {pos.map((p, i) => (
              <line
                key={`l${i}`}
                x1={CX}
                y1={CY}
                x2={p.x}
                y2={p.y}
                pathLength={1}
                className="impact-ray"
                style={{
                  stroke: "var(--bridge)",
                  strokeWidth: 0.6,
                  animationDelay: `${0.2 + i * 0.08}s`,
                }}
              />
            ))}
            {/* you: a wine disc inside a white ring that is broken once */}
            <circle
              cx={CX}
              cy={CY}
              r={30}
              fill="none"
              strokeWidth={0.75}
              className="impact-pulse"
              style={{ stroke: "var(--bridge)", opacity: 0.55 }}
            />
            <circle
              cx={CX}
              cy={CY}
              r={19}
              strokeWidth={0.75}
              style={{ fill: "var(--logo)", stroke: "var(--border)" }}
            />
            <circle
              cx={CX}
              cy={CY}
              r={11.5}
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="86 14"
              transform={`rotate(${BREAK + 25} ${CX} ${CY})`}
              style={{ stroke: "var(--ivory)" }}
            />
            <text
              x={CX}
              y={CY + 47}
              textAnchor="middle"
              className="text-[13px] font-bold"
              style={{
                fill: "var(--foreground)",
                stroke: "var(--card)",
                strokeWidth: 5,
                paintOrder: "stroke",
                strokeLinejoin: "round",
              }}
            >
              {c.you}
            </text>
            {shown.map((k, i) => {
              const p = pos[i]!;
              const nameY = p.up ? p.y - 47 : p.y + 43;
              return (
                <g
                  key={k.id}
                  className="impact-gem"
                  style={{ animationDelay: `${0.45 + i * 0.09}s`, opacity: k.active ? 1 : 0.55 }}
                >
                  {/* enamel disc; a hairline track; what everyone covered (thin champagne);
                      your share (the bold ring) */}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={25}
                    strokeWidth={0.75}
                    style={{ fill: "var(--card)", stroke: "var(--border)" }}
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={25}
                    fill="none"
                    strokeWidth={1.5}
                    pathLength={1}
                    strokeDasharray={`${k.covered} 1`}
                    transform={`rotate(-90 ${p.x} ${p.y})`}
                    style={{ stroke: "var(--bridge)" }}
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={25}
                    fill="none"
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray={`${k.share} 1`}
                    transform={`rotate(-90 ${p.x} ${p.y})`}
                    className="impact-share"
                    style={{ stroke: "var(--primary)", animationDelay: `${0.7 + i * 0.09}s` }}
                  />
                  <text
                    x={p.x}
                    y={p.y + 5.5}
                    textAnchor="middle"
                    direction="ltr"
                    className="font-display text-[17px] font-bold tabular-nums"
                    style={{ fill: "var(--foreground)" }}
                  >
                    {Math.round(k.share * 100)}
                    <tspan className="text-[10px] font-normal" dx={1}>
                      %
                    </tspan>
                  </text>
                  <text
                    x={p.x}
                    y={nameY}
                    textAnchor="middle"
                    className="text-[14px] font-bold"
                    style={{
                      fill: "var(--foreground)",
                      stroke: "var(--card)",
                      strokeWidth: 5,
                      paintOrder: "stroke",
                      strokeLinejoin: "round",
                    }}
                  >
                    {k.name}
                  </text>
                  <text
                    x={p.x}
                    y={nameY + 15}
                    textAnchor="middle"
                    className="text-[11.5px]"
                    style={{
                      fill: "var(--muted-foreground)",
                      stroke: "var(--card)",
                      strokeWidth: 5,
                      paintOrder: "stroke",
                      strokeLinejoin: "round",
                    }}
                  >
                    {k.months === 0 ? c.justBegan : c.monthsOf(k.months)}
                  </text>
                </g>
              );
            })}
          </svg>
          {rail && (
            <div className="mt-3 flex min-w-0 items-center gap-2 sm:gap-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={play}
                aria-label={c.replayLabel}
              >
                <Play className="size-3.5" aria-hidden="true" />
                {c.replay}
              </Button>
              <input
                type="range"
                min={0}
                max={span}
                step={1}
                value={span - Math.min(back, span)}
                onChange={(e) => {
                  stop();
                  setBack(span - Number(e.target.value));
                }}
                aria-label={c.rail}
                aria-valuetext={ago(back)}
                className="min-h-11 w-full min-w-0 flex-1 cursor-pointer rounded-full accent-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <output className="w-16 shrink-0 text-center text-sm font-bold text-foreground tabular-nums">
                {ago(Math.min(back, span))}
              </output>
            </div>
          )}
          {!loading && shown.length === 0 && back === 0 && (
            <figcaption className="absolute inset-x-0 bottom-2 text-center text-sm text-muted-foreground">
              {c.empty}
            </figcaption>
          )}
          {more > 0 && (
            <figcaption className="mt-2 text-center text-xs text-muted-foreground">
              {c.more(more)}
            </figcaption>
          )}
        </figure>
      </div>
      {/* محطّاتك داخل البطاقة نفسها، مطويّةً: لا رقمٌ يتكرّر في بطاقةٍ ثانية */}
      {milestones && (
        <details className="group mt-6 border-t border-border pt-4">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-bold text-primary">
            {c.milestones}
          </summary>
          <div className="mt-2">{milestones}</div>
        </details>
      )}
    </section>
  );
}
