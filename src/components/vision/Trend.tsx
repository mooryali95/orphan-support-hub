/**
 * منحنى اتجاهٍ واحد (سلسلة واحدة، محورٌ واحد) — يُرسم مكرّراً كمضاعفاتٍ صغيرة
 * بدل محورين. خطٌّ 2px، ونقطة النهاية مُعلَّمة بقيمتها، وخطّ تتبّعٍ مع تلميحٍ
 * عند المرور أو بالأسهم، وجدولٌ مخفيّ لقارئ الشاشة.
 */
import { useId, useState } from "react";

import { monthLabel } from "@/components/vision/VisionStore";
import { useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const W = 320;
const H = 120;
const P = { t: 14, r: 10, b: 20, l: 10 };

export function Trend({
  title,
  points,
  format,
  dark,
}: {
  title: string;
  points: Array<{ month: number; v: number }>;
  format: (n: number) => string;
  dark?: boolean;
}) {
  const locale = useLocale();
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const vs = points.map((p) => p.v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const span = hi - lo || 1;
  const x = (i: number) => P.l + (i / (points.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / span) * (H - P.t - P.b);
  const d = points
    .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join(" ");
  const area = `${d} L${x(points.length - 1)},${H - P.b} L${x(0)},${H - P.b} Z`;
  const last = points.length - 1;
  const at = hover ?? last;
  const ink = dark ? "text-ivory" : "text-wine";

  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const rel = ((clientX - r.left) / r.width) * W;
    const i = Math.round(((rel - P.l) / (W - P.l - P.r)) * (points.length - 1));
    setHover(Math.max(0, Math.min(last, i)));
  };

  return (
    <figure
      className={cn(
        "rounded-2xl p-4",
        dark ? "border border-white/10 bg-white/[0.03]" : "border border-wine/10 bg-white",
      )}
    >
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className={cn("text-sm font-semibold", dark ? "text-ivory/85" : "text-wine")}>
          {title}
        </span>
        <span
          className={cn("text-xs tabular-nums", dark ? "text-ivory/70" : "text-muted-foreground")}
          aria-live="polite"
        >
          {monthLabel(points[at]!.month, locale)} ·{" "}
          <b dir="ltr" className={cn("inline-block", ink)}>
            {format(points[at]!.v)}
          </b>
        </span>
      </figcaption>
      {/* المنحنى يُقرأ زمنياً من اليسار إلى اليمين في اللغتين، كمحاور الزمن المعتادة. */}
      <svg
        style={{ direction: "ltr" }}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-gold"
        role="img"
        aria-labelledby={`${id}-t`}
        tabIndex={0}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover(Math.max(0, at - 1));
          if (e.key === "ArrowRight") setHover(Math.min(last, at + 1));
        }}
        onBlur={() => setHover(null)}
      >
        <title id={`${id}-t`}>{title}</title>
        <line
          x1={P.l}
          x2={W - P.r}
          y1={H - P.b}
          y2={H - P.b}
          className={dark ? "stroke-white/15" : "stroke-wine/15"}
        />
        <path d={area} className="fill-gold/15" />
        <path
          d={d}
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="stroke-gold"
        />
        <line
          x1={x(at)}
          x2={x(at)}
          y1={P.t - 4}
          y2={H - P.b}
          strokeDasharray="2 3"
          className={dark ? "stroke-white/30" : "stroke-wine/30"}
        />
        <circle
          cx={x(at)}
          cy={y(points[at]!.v)}
          r={5}
          strokeWidth={2}
          className={cn("fill-gold", dark ? "stroke-wine-deep" : "stroke-white")}
        />
        {/* بداية التاريخ ونهايته فقط — لا رقم على كلّ نقطة. */}
        <text
          x={P.l}
          y={H - 5}
          className={cn("text-[10px]", dark ? "fill-ivory/55" : "fill-muted-foreground")}
        >
          {monthLabel(points[0]!.month, locale)}
        </text>
        <text
          x={W - P.r}
          y={H - 5}
          textAnchor="end"
          className={cn("text-[10px]", dark ? "fill-ivory/55" : "fill-muted-foreground")}
        >
          {monthLabel(points[last]!.month, locale)}
        </text>
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.month}>
              <th scope="row">{monthLabel(p.month, locale)}</th>
              <td>{format(p.v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
