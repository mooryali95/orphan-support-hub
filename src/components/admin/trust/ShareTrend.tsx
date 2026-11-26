import { useState, type KeyboardEvent, type PointerEvent } from "react";

import { formatDate } from "@/lib/format";
import { dirOf, useCopy, useLocale } from "@/lib/locale";
import { shareRuns, weekShare, type WeekRow } from "@/lib/trust-center";

import { TRUST_COPY } from "./copy";

const W = 320;
const H = 120;
const PAD = 8;
const GRID = [0, 50, 100] as const;

/**
 * حصّة الموثَّق أسبوعاً بأسبوع من اللقطات المخزَّنة — SVG خفيف بلا مكتبة، سلسلةٌ
 * واحدة بلون `primary`، والمحور صفرٌ إلى مئة فلا يبدو فرقٌ صغير قفزة. الأسبوع
 * الذي لم يُسجَّل فجوةٌ في الخطّ لا نقطةٌ مختلَقة. الزمن يجري باتجاه القراءة،
 * والمرور بالمؤشّر أو بالأسهم يُظهر الأسبوع وقيمته؛ والجدول تحته يحمل الأرقام.
 */
export function ShareTrend({ weeks }: { weeks: WeekRow[] }) {
  const c = useCopy(TRUST_COPY);
  const locale = useLocale();
  const rtl = dirOf(locale) === "rtl";
  const [at, setAt] = useState<number | null>(null);
  const values = weeks.map(weekShare);
  const n = values.length;
  const runs = shareRuns(values);
  const last = values.reduce<number>((k, v, i) => (v === null ? k : i), -1);
  if (n < 2 || last < 0) {
    return <p className="text-muted-foreground text-sm">{c.trendEmpty}</p>;
  }

  const fx = (i: number) => (rtl ? 1 - i / (n - 1) : i / (n - 1));
  const fy = (v: number) => (H - PAD - (v / 100) * (H - PAD * 2)) / H;
  const pt = (i: number, v: number) => `${(fx(i) * W).toFixed(1)},${(fy(v) * H).toFixed(1)}`;
  const shown = at ?? last;
  const value = values[shown] ?? null;
  const left = fx(shown) * 100;
  const label = (i: number) => {
    const v = values[i] ?? null;
    return c.trendPoint(
      formatDate(weeks[i]!.week, locale),
      v === null ? c.notRecorded : c.percent(v),
    );
  };

  function move(e: PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const raw = (e.clientX - box.left) / box.width;
    const f = rtl ? 1 - raw : raw;
    setAt(Math.max(0, Math.min(n - 1, Math.round(f * (n - 1)))));
  }
  function key(e: KeyboardEvent<HTMLDivElement>) {
    const step =
      e.key === "ArrowLeft" ? (rtl ? 1 : -1) : e.key === "ArrowRight" ? (rtl ? -1 : 1) : 0;
    if (step === 0) return;
    e.preventDefault();
    setAt(Math.max(0, Math.min(n - 1, (at ?? last) + step)));
  }

  return (
    <figure className="space-y-2">
      <figcaption className="text-muted-foreground text-xs font-bold">{c.trendTitle}</figcaption>
      <div className="flex gap-2">
        <div
          aria-hidden="true"
          className="text-muted-foreground relative h-32 w-9 shrink-0 text-[0.6875rem] tabular-nums"
        >
          {GRID.map((g) => (
            <span
              key={g}
              className="absolute end-0 -translate-y-1/2"
              style={{ top: `${fy(g) * 100}%` }}
            >
              {c.percent(g)}
            </span>
          ))}
        </div>
        <div
          role="img"
          aria-label={`${c.trendTitle} — ${label(shown)}`}
          tabIndex={0}
          onPointerMove={move}
          onPointerLeave={() => setAt(null)}
          onBlur={() => setAt(null)}
          onKeyDown={key}
          className="focus-visible:ring-ring relative h-32 min-w-0 flex-1 touch-pan-y rounded-lg focus-visible:ring-2 focus-visible:outline-none"
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            className="text-primary absolute inset-0 size-full overflow-visible"
          >
            {GRID.map((g) => (
              <line
                key={g}
                x1="0"
                x2={W}
                y1={fy(g) * H}
                y2={fy(g) * H}
                className="stroke-border"
                strokeWidth="1"
                strokeDasharray={g === 0 ? undefined : "3 3"}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {runs
              .filter((r) => r.length > 1)
              .map((r) => (
                <path
                  key={r[0]!.i}
                  d={`M${r.map((p) => pt(p.i, p.v)).join("L")}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
          </svg>
          {values.map((v, i) =>
            v === null ? null : (
              <span
                key={weeks[i]!.week}
                aria-hidden="true"
                className="bg-primary ring-card absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
                style={{ left: `${fx(i) * 100}%`, top: `${fy(v) * 100}%` }}
              />
            ),
          )}
          {at !== null && (
            <span
              aria-hidden="true"
              className="bg-border absolute inset-y-0 w-px"
              style={{ left: `${left}%` }}
            />
          )}
          {at !== null && value !== null && (
            <span
              aria-hidden="true"
              className="bg-primary ring-card absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
              style={{ left: `${left}%`, top: `${fy(value) * 100}%` }}
            />
          )}
          {at !== null && (
            <span
              aria-hidden="true"
              className="border-border bg-popover text-popover-foreground shadow-soft pointer-events-none absolute -top-2 -translate-y-full rounded-lg border px-2 py-1 text-xs whitespace-nowrap"
              style={left > 50 ? { right: `${100 - left}%` } : { left: `${left}%` }}
            >
              <span className="text-muted-foreground">
                {formatDate(weeks[shown]!.week, locale)}
              </span>{" "}
              <span className="font-bold tabular-nums">
                {value === null ? c.notRecorded : c.percent(value)}
              </span>
            </span>
          )}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="text-muted-foreground flex justify-between ps-11 text-[0.6875rem]"
      >
        <span>{formatDate(weeks[0]!.week, locale)}</span>
        <span>{formatDate(weeks[n - 1]!.week, locale)}</span>
      </div>
    </figure>
  );
}
