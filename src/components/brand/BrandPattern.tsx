import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * نقش «الأهلّة» — مشتقٌّ من هندسة شعار الشريك لا من شعاره نفسه: حلقةٌ رفيعة مقطوعة عند
 * موضع الألف بزاويته، وهلالٌ يلتفّ خارج حافّتها. يُرصف على شبكةٍ قُطرية (مركز البلاطة
 * وزواياها). الشعار الحقيقي لا يُكرَّر ولا يُعدَّل؛ هذا صداه فقط.
 *
 * أين يُستعمل: همساً على السطح الفاتح في أعلى الصفحة الأولى. وعلى المساحات النبيذية
 * تُستعمل «الهالة» (`BrandHalo`): نسخةٌ واحدة كبيرة مقصوصة، لا رصفٌ. ولا يجتمعان.
 */

type Density = "watermark" | "active" | "dense";

/** سُمك الحلقة والهلال بوحدات البلاطة 120 */
const WEIGHT: Record<Density, { ring: number; crescent: number }> = {
  watermark: { ring: 0.7, crescent: 2.2 },
  active: { ring: 0.9, crescent: 2.9 },
  dense: { ring: 1.1, crescent: 3.2 },
};

const RING = "M20.07 -22.29A30 30 0 1 1 11.24 -27.82";
const SLOT = "M20.07 -22.29L10.59 -8.18M11.24 -27.82L1.76 -13.71";
const CRESCENT = "M22.18 -26.43A34.5 34.5 0 0 1 33.16 9.51";
const CELLS = [
  [60, 60],
  [0, 0],
  [120, 0],
  [0, 120],
  [120, 120],
] as const;

export function BrandPattern({
  density = "active",
  className,
  opacity = 0.5,
  tile = 120,
}: {
  density?: Density;
  className?: string;
  opacity?: number;
  /** ضلع البلاطة بالبكسل. */
  tile?: number;
}) {
  const id = useId();
  const w = WEIGHT[density];
  return (
    <svg
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
      aria-hidden="true"
      style={{ opacity }}
    >
      <defs>
        <pattern
          id={id}
          width={tile}
          height={tile}
          patternUnits="userSpaceOnUse"
          viewBox="0 0 120 120"
        >
          <g fill="none" stroke="currentColor">
            {CELLS.map(([x, y]) => (
              <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
                <path d={RING} strokeWidth={w.ring} />
                <path d={SLOT} strokeWidth={w.ring} />
                <path d={CRESCENT} strokeWidth={w.crescent} />
              </g>
            ))}
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/**
 * «الهالة»: الحلقة والهلال وضربة القلم مرّةً واحدة، كبيرةً ومقصوصةً بحافّة السطح. للمساحات
 * النبيذية (لوحة الشريك، بطاقة الطفل بلا صورة، بطاقة المشاركة).
 */
export function BrandHalo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-42 -42 84 84"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
      className={cn("pointer-events-none absolute", className)}
    >
      <path d={RING} strokeWidth={0.35} />
      <path d="M18.66 -20.20A27.5 27.5 0 1 1 9.81 -25.69" strokeWidth={0.2} />
      <path d="M20.07 -22.29L9.19 -6.11M11.24 -27.82L0.36 -11.64" strokeWidth={0.35} />
      <path d={CRESCENT} strokeWidth={1.5} />
      <path
        d="M-8.5 11.5C-13 22 -23 31 -38 36.5C-27.5 29.5 -19.5 21.5 -15.5 13.5C-13.5 10 -10 9 -8.5 11.5Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}
