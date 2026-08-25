import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * باترن IOSO — شبكة الأقواس المتشابكة الذهبية.
 *
 * دليل الهوية يعرّف «طيف التفعيل (الميقات)»: نفس الباترن بثلاث كثافات
 * حسب السياق، وهذه هي الكثافات الثلاث كما وردت.
 *
 *   watermark — السياق الدبلوماسي والرسمي: علامة مائية هادئة تعكس الرزانة.
 *   active    — السياق التفاعلي والتوعوي: حيوية عالية ومنحنيات بارزة.
 *   dense     — السياق الميداني (مراكز الرعاية): شبكة متماسكة تعكس الاحتضان.
 *
 * البلاطة 120×120 وتتكرّر بلا حدود ظاهرة: الأقواس مركزها زوايا البلاطة
 * (وأنصاف الأضلاع في الكثافة العالية)، فتتلاقى حوافها تماماً عند التكرار.
 */

type Density = "watermark" | "active" | "dense";

/** حجم البلاطة الافتراضي. الأصغر يقرأ كنسيج، والأكبر كزخرفة قائمة بذاتها. */
const DEFAULT_TILE = 96;

/** الأنصاف كنِسَب من ضلع البلاطة، فتتغيّر مع أي حجم بلاطة. */
const RADII: Record<Density, { corners: number[]; mids: number[]; width: number }> = {
  watermark: { corners: [0.5], mids: [0.5], width: 1.8 },
  active: { corners: [0.4, 0.5, 0.6], mids: [], width: 1.3 },
  dense: { corners: [0.45, 0.5, 0.55], mids: [0.45, 0.5, 0.55], width: 1.1 },
};

const cornersOf = (t: number) => [
  [0, 0],
  [t, 0],
  [0, t],
  [t, t],
];

const midsOf = (t: number) => [
  [t / 2, 0],
  [t / 2, t],
  [0, t / 2],
  [t, t / 2],
];

export function BrandPattern({
  density = "active",
  className,
  opacity = 0.5,
  tile = DEFAULT_TILE,
}: {
  density?: Density;
  className?: string;
  opacity?: number;
  /** ضلع البلاطة بالبكسل. */
  tile?: number;
}) {
  const id = useId();
  const { corners, mids, width } = RADII[density];

  return (
    <svg
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
      aria-hidden="true"
      style={{ opacity }}
    >
      <defs>
        <pattern id={id} width={tile} height={tile} patternUnits="userSpaceOnUse">
          {cornersOf(tile).map(([cx, cy]) =>
            corners.map((r) => (
              <circle
                key={`c-${cx}-${cy}-${r}`}
                cx={cx}
                cy={cy}
                r={r * tile}
                fill="none"
                stroke="currentColor"
                strokeWidth={width}
              />
            )),
          )}
          {midsOf(tile).map(([cx, cy]) =>
            mids.map((r) => (
              <circle
                key={`m-${cx}-${cy}-${r}`}
                cx={cx}
                cy={cy}
                r={r * tile}
                fill="none"
                stroke="currentColor"
                strokeWidth={width}
              />
            )),
          )}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
