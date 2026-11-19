import { Link } from "@tanstack/react-router";
import { Play, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { impactAt, impactSpan, type MyImpact } from "@/lib/my-impact";

/**
 * «كوكبة أثرك»: الداعم في المركز، وكلّ طفلٍ يكفله جوهرةٌ على مدار. حول كلّ طفل
 * حلقتان: ما غطّاه الجميع من حاجته الشهرية (خافتة)، وحصّتك أنت منها (بلون الهوية).
 * الألوان من رموز الهوية فقط، فتعمل في الوضعين الفاتح والداكن.
 */
const monthsAgo = (n: number) =>
  n === 0
    ? "اليوم"
    : n === 1
      ? "قبل شهر"
      : n === 2
        ? "قبل شهرين"
        : n <= 10
          ? `قبل ${n} أشهر`
          : `قبل ${n} شهراً`;

const W = 400,
  H = 250,
  CX = W / 2,
  CY = H / 2 - 6,
  MAX = 8;

export function MyImpactHero({
  impact,
  loading,
  anotherTo = "/orphans",
  hallSearch,
}: {
  impact: MyImpact;
  loading: boolean;
  /** where «اكفل طفلاً آخر» leads; the client demo keeps the visitor inside /try */
  anotherTo?: "/orphans" | "/try";
  /** the demo opens the hall in demo mode, on the visitor's latest gift */
  hallSearch?: { try?: 1; child?: string; cadence?: "monthly" | "one_time" };
}) {
  /* the time rail: how many whole months back the picture stands (0 = today) */
  const span = impactSpan(impact);
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
    return { x: CX + Math.cos(a) * 150, y: CY + Math.sin(a) * 86 };
  });
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <section
      aria-labelledby="my-impact"
      className="impact-hero relative mt-8 overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8"
    >
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div>
          <p className="text-sm font-bold text-bridge-ink">أثرك</p>
          <h2 id="my-impact" className="mt-1 font-display text-3xl font-bold leading-tight">
            كوكبة أثرك
          </h2>
          <p className="mt-2 max-w-md text-sm leading-7 text-muted-foreground">
            أنت في المركز، وكلّ طفلٍ تكفله جوهرةٌ حولك. الحلقة الواضحة حصّتك من حاجته الشهرية،
            والخافتة ما غطّاه الكافلون جميعاً.
          </p>

          <dl className="mt-6 grid grid-cols-3 gap-3">
            {[
              ["في رعايتك", String(view.inCare), "طفلاً"],
              ["أشهر الرعاية", String(view.months), "شهراً"],
              ["حصّتك", pct(view.share), "من حاجتهم"],
            ].map(([label, value, unit]) => (
              <div key={label} className="rounded-2xl border border-border/70 bg-background/60 p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 flex flex-col">
                  {loading ? (
                    <Skeleton className="h-8 w-14" />
                  ) : (
                    <span className="font-display text-3xl font-bold tabular-nums text-foreground">
                      {value}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{unit}</span>
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg" className="impact-cta">
              <Link to="/hall" search={hallSearch ?? {}}>
                <Sparkles className="size-4" aria-hidden="true" />
                الوضع الغامر
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to={anotherTo}>اكفل طفلاً آخر</Link>
            </Button>
          </div>
        </div>

        <figure className="relative -order-1 lg:order-none">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full overflow-visible"
            role="img"
            aria-label={
              shown.length
                ? `كوكبة أثرك: ${shown.map((c) => `${c.name} ${pct(c.share)}`).join("، ")}`
                : "كوكبة أثرك فارغة بعد"
            }
          >
            <defs>
              <radialGradient id="impact-core">
                <stop offset="0" style={{ stopColor: "var(--bridge-bright)" }} />
                <stop offset="1" style={{ stopColor: "var(--bridge)", stopOpacity: 0 }} />
              </radialGradient>
            </defs>
            {/* the orbit */}
            <ellipse
              cx={CX}
              cy={CY}
              rx={150}
              ry={86}
              fill="none"
              className="impact-orbit"
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
                style={{ stroke: "var(--bridge)", animationDelay: `${0.2 + i * 0.08}s` }}
              />
            ))}
            {/* you */}
            <circle cx={CX} cy={CY} r={34} fill="url(#impact-core)" className="impact-pulse" />
            <circle cx={CX} cy={CY} r={9} style={{ fill: "var(--bridge)" }} />
            <text
              x={CX}
              y={CY + 30}
              textAnchor="middle"
              className="text-[13px] font-bold"
              style={{ fill: "var(--bridge-ink)" }}
            >
              أنت
            </text>
            {shown.map((c, i) => {
              const p = pos[i]!;
              return (
                <g
                  key={c.id}
                  className="impact-gem"
                  style={{ animationDelay: `${0.45 + i * 0.09}s`, opacity: c.active ? 1 : 0.55 }}
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={20}
                    style={{ fill: "var(--card)", stroke: "var(--border)" }}
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={25}
                    fill="none"
                    strokeWidth={3}
                    pathLength={1}
                    strokeDasharray={`${c.covered} 1`}
                    transform={`rotate(-90 ${p.x} ${p.y})`}
                    style={{ stroke: "var(--shore-thrive)", opacity: 0.35 }}
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={25}
                    fill="none"
                    strokeWidth={3}
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray={`${c.share} 1`}
                    transform={`rotate(-90 ${p.x} ${p.y})`}
                    className="impact-share"
                    style={{ stroke: "var(--bridge)", animationDelay: `${0.7 + i * 0.09}s` }}
                  />
                  <text
                    x={p.x}
                    y={p.y + 4}
                    textAnchor="middle"
                    className="text-[12px] font-bold tabular-nums"
                    style={{ fill: "var(--foreground)" }}
                  >
                    {pct(c.share)}
                  </text>
                  <text
                    x={p.x}
                    y={p.y + 42}
                    textAnchor="middle"
                    className="text-[13px]"
                    style={{ fill: "var(--muted-foreground)" }}
                  >
                    {c.name} · {c.months}{" "}
                    {c.months === 1
                      ? "شهر"
                      : c.months === 2
                        ? "شهران"
                        : c.months <= 10
                          ? "أشهر"
                          : "شهراً"}
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
                aria-label="شاهد أثرك يتكوّن منذ البداية"
              >
                <Play className="size-3.5" aria-hidden="true" />
                منذ البداية
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
                aria-label="مسار أثرك عبر الأشهر"
                aria-valuetext={monthsAgo(back)}
                className="min-h-11 w-full min-w-0 flex-1 cursor-pointer rounded-full accent-[var(--bridge)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <output className="w-16 shrink-0 text-center text-sm font-bold text-bridge-ink tabular-nums">
                {monthsAgo(Math.min(back, span))}
              </output>
            </div>
          )}
          {!loading && shown.length === 0 && back === 0 && (
            <figcaption className="absolute inset-x-0 bottom-2 text-center text-sm text-muted-foreground">
              حين تبدأ كفالتك الأولى تظهر هنا جوهرةً حولك.
            </figcaption>
          )}
          {more > 0 && (
            <figcaption className="mt-2 text-center text-xs text-muted-foreground">
              و{more} آخرون في قائمة كفالاتك أدناه.
            </figcaption>
          )}
        </figure>
      </div>
    </section>
  );
}
