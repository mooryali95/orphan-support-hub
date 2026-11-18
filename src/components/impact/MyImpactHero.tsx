import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { MyImpact } from "@/lib/my-impact";

/**
 * «كوكبة أثرك»: الداعم في المركز، وكلّ طفلٍ يكفله جوهرةٌ على مدار. حول كلّ طفل
 * حلقتان: ما غطّاه الجميع من حاجته الشهرية (خافتة)، وحصّتك أنت منها (بلون الهوية).
 * الألوان من رموز الهوية فقط، فتعمل في الوضعين الفاتح والداكن.
 */
const W = 400,
  H = 250,
  CX = W / 2,
  CY = H / 2 - 6,
  MAX = 8;

export function MyImpactHero({ impact, loading }: { impact: MyImpact; loading: boolean }) {
  const shown = impact.children.slice(0, MAX);
  const more = impact.children.length - shown.length;
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
              ["في رعايتك", String(impact.inCare), "طفلاً"],
              ["أشهر الرعاية", String(impact.months), "شهراً"],
              ["حصّتك", pct(impact.share), "من حاجتهم"],
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
              <Link to="/hall">
                <Sparkles className="size-4" aria-hidden="true" />
                الوضع الغامر
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/orphans">اكفل طفلاً آخر</Link>
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
          {!loading && shown.length === 0 && (
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
