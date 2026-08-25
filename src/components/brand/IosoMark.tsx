import { cn } from "@/lib/utils";

import {
  BASE_Y,
  CHILD_PATH,
  LETTER_I,
  LETTER_O1,
  LETTER_O2,
  LETTER_S,
  STROKE,
  VIEWBOX,
  WAVE,
  childTransform,
} from "./ioso-paths";

/**
 * شعار IOSO.
 *
 * التشريح: خيطٌ واحد بسماكة ثابتة (I O S) — الرعاية المستمرة — ينتهي إلى
 * قرصٍ مصمت هو الحرف الأخير، وفي جوفه الطفل محفوراً في الفراغ السالب:
 * لا يُرسم الطفل بل تُكمله العين، وهي «استراتيجية الفراغ» نفسها.
 * لونان لا ثالث لهما: الأزرق الملوكي (شط الفقد) والذهبي الدافئ (فعل العبور).
 */

type Variant = keyof typeof VIEWBOX;
type Tone = "color" | "white" | "navy" | "current";

const TONE_FILL: Record<Exclude<Tone, "color">, string> = {
  white: "#FFFFFF",
  navy: "#17538F",
  current: "currentColor",
};

export function IosoMark({
  className,
  variant = "mark",
  tone = "color",
  title,
}: {
  className?: string;
  /** `logo` القفل الكامل بالموجة، `wordmark` الاسم، `mark` العلامة المضغوطة. */
  variant?: Variant;
  tone?: Tone;
  title?: string;
}) {
  const id = `ioso-${variant}-${tone}`;
  const solid = tone === "color" ? null : TONE_FILL[tone];
  const blue = solid ?? `url(#${id}-b)`;
  const gold = solid ?? `url(#${id}-g)`;
  const markOnly = variant === "mark";

  const disc = markOnly ? { cx: 120, cy: 120, r: 104 } : LETTER_O2;

  return (
    <svg
      viewBox={VIEWBOX[variant]}
      className={cn("size-full", className)}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="none"
    >
      {title && <title>{title}</title>}

      <defs>
        {!solid && (
          <>
            <linearGradient id={`${id}-b`} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#17538F" />
              <stop offset="0.62" stopColor="#1D5AA3" />
              <stop offset="1" stopColor="#5E7488" />
            </linearGradient>
            <linearGradient id={`${id}-g`} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#B48C46" />
              <stop offset="0.5" stopColor="#C9A058" />
              <stop offset="1" stopColor="#DCBB7C" />
            </linearGradient>
          </>
        )}
        {/* الطفل يُقتطع من القرص لا يُرسم فوقه: فراغٌ حقيقي يُظهر ما خلف الشعار. */}
        <mask id={`${id}-child`}>
          <circle cx={disc.cx} cy={disc.cy} r={disc.r} fill="#FFFFFF" />
          <g transform={childTransform(disc.cx, disc.cy, disc.r)}>
            <path d={CHILD_PATH} fill="#000000" fillRule="evenodd" />
          </g>
        </mask>
      </defs>

      {variant === "logo" && (
        <path
          d={WAVE}
          stroke={gold}
          strokeWidth={14}
          strokeLinecap="round"
          opacity={solid ? 0.5 : 0.85}
        />
      )}

      {!markOnly && (
        <g strokeLinecap="round" strokeWidth={STROKE} fill="none">
          <path d={`M${LETTER_I.x} ${LETTER_I.y1} L${LETTER_I.x} ${LETTER_I.y2}`} stroke={blue} />
          <circle cx={LETTER_O1.cx} cy={BASE_Y} r={LETTER_O1.r} stroke={blue} />
          <path d={LETTER_S} stroke={gold} />
        </g>
      )}

      <circle cx={disc.cx} cy={disc.cy} r={disc.r} fill={gold} mask={`url(#${id}-child)`} />

    </svg>
  );
}

/**
 * القفل الرسمي في الترويسات والتذييل: الاسم متجهاً — يبقى حادّاً عند أي مقاس.
 */
export function IosoLockup({
  className,
  compact = false,
  onDark = false,
}: {
  className?: string;
  compact?: boolean;
  /** النسخة البيضاء فوق الأسطح الكحلية. */
  onDark?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)} dir="ltr">
      <IosoMark
        variant="wordmark"
        tone={onDark ? "white" : "color"}
        title="IOSO"
        className={cn("w-auto", compact ? "h-8" : "h-10")}
      />
      {!compact && (
        <span className="text-muted-foreground hidden text-[11px] font-medium sm:inline" dir="rtl">
          منظمة الرعاية الدولية لليتيم
        </span>
      )}
    </span>
  );
}
