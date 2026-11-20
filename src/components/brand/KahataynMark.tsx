import { cn } from "@/lib/utils";
import { BRAND as BRAND_TEXT } from "@/config/brand";
import { COLORS } from "@/config/brand-colors";

/**
 * علامة المنتج «الإصبعان» — من الحديث «أنا وكافل اليتيم في الجنة هكذا» وأشار بالسبّابة والوسطى.
 *
 * التشريح: قرصٌ بلون الشعار يعبره شقّان متوازيان بزاوية شقّ الألف في شعار الشريك (الإصبعان:
 * الكافل واليتيم متجاورَين)، وهلالٌ يركب الحافّة كما في شعار الشريك. علامةٌ شقيقةٌ لشعار
 * «الأهلية للأيتام» لا نسخةٌ منه: هندسته فقط، وخطّه لا يُمسّ.
 *
 * ألوان مسطّحة بلا تدرّج، فتصمد في الطباعة والأيقونة والختم. النسخة الكاملة تحمل حلقةً
 * رفيعة داخل القرص؛ و`compact` تُسقطها فتبقى مقروءةً حتى 16px.
 */

export const BRAND = {
  green: COLORS.light.green,
  greenDeep: COLORS.light.greenDeep,
  gold: COLORS.light.gold,
  goldLight: COLORS.light.goldBright,
  cream: COLORS.light.paper,
} as const;

/** the disc with its two slots (the two fingers), centred on 0,0 with radius 100 */
const DISC =
  "M100 0C100 17.55 95.38 34.8 86.6 50C77.83 65.2 65.2 77.83 50 86.6C34.8 95.38 17.55 100 0 100C-17.55 100 -34.8 95.38 -50 86.6C-65.2 77.83 -77.83 65.2 -86.6 50C-95.38 34.8 -100 17.55 -100 0C-100 -17.55 -95.38 -34.8 -86.6 -50C-77.83 -65.2 -65.2 -77.83 -50 -86.6C-34.8 -95.38 -17.55 -100 0 -100C17.52 -100 34.74 -95.39 49.92 -86.65L-23.23 26H-4.15L63.11 -77.57C66 -75.22 68.75 -72.72 71.35 -70.06L29.75 -6H48.82L82.05 -57.16C83.66 -54.85 85.18 -52.46 86.6 -50C95.38 -34.8 100 -17.55 100 0Z";
/** the hairline ring inside the rim, broken where the slots cross it (full version only) */
const RING =
  "M90.8 0C90.8 -15.58 86.79 -30.89 79.17 -44.46L78.18 -42.94C85.41 -29.79 89.2 -15.02 89.2 0C89.2 15.66 85.08 31.04 77.25 44.6C69.42 58.16 58.16 69.42 44.6 77.25C31.04 85.08 15.66 89.2 0 89.2C-15.66 89.2 -31.04 85.08 -44.6 77.25C-58.16 69.42 -69.42 58.16 -77.25 44.6C-85.08 31.04 -89.2 15.66 -89.2 0C-89.2 -15.66 -85.08 -31.04 -77.25 -44.6C-69.42 -58.16 -58.16 -69.42 -44.6 -77.25C-31.04 -85.08 -15.66 -89.2 0 -89.2C13.93 -89.2 27.64 -85.94 40.05 -79.7L40.93 -81.05C28.26 -87.45 14.24 -90.8 0 -90.8C-15.94 -90.8 -31.6 -86.6 -45.4 -78.64C-59.2 -70.67 -70.67 -59.2 -78.64 -45.4C-86.6 -31.6 -90.8 -15.94 -90.8 0C-90.8 15.94 -86.6 31.6 -78.64 45.4C-70.67 59.2 -59.2 70.67 -45.4 78.64C-31.6 86.6 -15.94 90.8 0 90.8C15.94 90.8 31.6 86.6 45.4 78.64C59.2 70.67 70.67 59.2 78.64 45.4C86.6 31.6 90.8 15.94 90.8 0Z";
/**
 * the same ring as one stroked arc (radius 90, between the two slots), for the one place where
 * the mark draws itself: `pathLength="1"` + `.mo-draw` (src/styles/motion.css)
 */
const RING_ARC = "M78.68 -43.7A90 90 0 1 1 40.44 -80.4";
/** the crescent riding the rim */
const CRESCENT =
  "M88.04 -57.21 94.54 -67.22C98.6 -61.51 102.15 -55.42 105.13 -49.02C113.01 -32.12 116.7 -13.57 115.89 5.06C115.08 23.69 109.78 41.85 100.46 58L90.93 52.5C99.37 37.88 104.16 21.44 104.9 4.58C105.64 -12.28 102.3 -29.08 95.16 -44.37C93.09 -48.83 90.71 -53.12 88.04 -57.21Z";

/** the same shapes for the hall's gate, where the mark is the door (src/routes/hall.lazy.tsx) */
export const MARK2_VIEWBOX = "-102 -102 220 204";
export const MARK2_RING = RING;
export const MARK2_CRESCENT = CRESCENT;
/**
 * the two slots of DISC, read from its path: in the frame x' = x + k·y (the slot angle) each slot
 * is a plain band from `x` to `x + w`, open at the rim and closed by a level edge at y = `end`.
 */
export const MARK2_SLOTS = {
  k: -0.64936,
  w: 19.08,
  a: { x: -6.35, end: 26 },
  b: { x: 25.85, end: -6 },
} as const;

type Tone = "color" | "white" | "current";

export function KahataynMark({
  className,
  compact = false,
  tone = "color",
  title,
  draw = false,
}: {
  className?: string;
  compact?: boolean;
  tone?: Tone;
  title?: string;
  /** the inner ring traces itself once (700ms, no overshoot); reduced motion shows it complete */
  draw?: boolean;
}) {
  const solid = tone === "white" ? "#FFFFFF" : tone === "current" ? "currentColor" : null;
  // بالألوان: القرص بلون الهوية الرئيس فيتبع المظهر الداكن (عاجيّ على النبيذي العميق)،
  // والقيمة الثابتة احتياطٌ لما يُرسم خارج الصفحة (البريد والصور).
  const disc = solid ?? `var(--primary, ${COLORS.light.logo})`;

  return (
    <svg
      viewBox="-102 -102 220 204"
      className={cn("size-full", className)}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      {/* the ring is drawn in the page's background over the disc, so it reads as a cut hairline */}
      <path d={DISC} fill={disc} />
      {!compact &&
        (draw ? (
          <path
            d={RING_ARC}
            pathLength={1}
            fill="none"
            strokeWidth={1.6}
            className="mo-draw"
            style={{ stroke: "var(--background, #fff)" }}
            opacity={0.9}
          />
        ) : (
          <path d={RING} style={{ fill: "var(--background, #fff)" }} opacity={0.9} />
        ))}
      <path
        d={CRESCENT}
        {...(solid
          ? { fill: solid }
          : { className: "fill-[color:var(--logo-deep)] dark:fill-[color:var(--bridge)]" })}
      />
    </svg>
  );
}

/**
 * القفل في الترويسات: العلامة + «كهاتين» + «نكفل… ونبني».
 * الاسم نصٌّ بخطّ أميري لا صورة، فيبقى حادّاً ويُقرأ لقارئ الشاشة.
 */
export function KahataynLockup({
  className,
  compact = false,
  onDark = false,
}: {
  className?: string;
  compact?: boolean;
  onDark?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <KahataynMark
        compact
        tone={onDark ? "white" : "color"}
        className={cn("w-auto shrink-0", compact ? "h-8" : "h-10")}
      />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-serif font-bold",
            compact ? "text-xl" : "text-2xl",
            onDark ? "text-white" : "text-primary",
          )}
        >
          {BRAND_TEXT.name}
        </span>
        {!compact && (
          <span
            className={cn(
              "mt-1 hidden text-xs font-medium sm:block",
              onDark ? "text-white/75" : "text-bridge-ink",
            )}
          >
            {BRAND_TEXT.tagline}
          </span>
        )}
      </span>
    </span>
  );
}
