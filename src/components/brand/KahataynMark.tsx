import { cn } from "@/lib/utils";
import { BRAND as BRAND_TEXT } from "@/config/brand";
import { COLORS } from "@/config/brand-colors";

/**
 * شعار «كهاتين» — «أنا وكافل اليتيم في الجنة كهاتين».
 *
 * التشريح: كفّان (ورقتان كبيرتان) تحتضنان طفلاً (رأسٌ وذراعان مرفوعتان
 * كورقتين صغيرتين)، ويعلوهما قوسان يلتقيان كقطرة: الذهبيّ والأخضر
 * متجاوران كالإصبعين في الحديث.
 *
 * ألوان مسطّحة بلا تدرّج — تصمد في الطباعة والأيقونة والختم. والنسخة
 * المضغوطة (`compact`) تُسقط القوسين، فتبقى مقروءة حتى 16px.
 */

export const BRAND = {
  green: COLORS.light.green,
  greenDeep: COLORS.light.greenDeep,
  gold: COLORS.light.gold,
  goldLight: COLORS.light.goldBright,
  cream: COLORS.light.paper,
} as const;

// نصف الشعار الأيسر؛ الأيمن انعكاسه حول x=100.
const OUTER_LEAF = "M100 186 C66 176 36 148 26 106 C60 114 92 142 100 186 Z";
const INNER_LEAF = "M98 152 C80 142 64 124 60 100 C80 106 94 124 98 152 Z";
const ARC = "M99 14 C72 40 40 62 34 108 C48 76 74 50 99 14 Z";

type Tone = "color" | "white" | "current";

export function KahataynMark({
  className,
  compact = false,
  tone = "color",
  title,
}: {
  className?: string;
  compact?: boolean;
  tone?: Tone;
  title?: string;
}) {
  const solid = tone === "white" ? "#FFFFFF" : tone === "current" ? "currentColor" : null;
  const green = solid ?? BRAND.green;
  const gold = solid ?? BRAND.gold;
  const mirror = "translate(200 0) scale(-1 1)";

  return (
    <svg
      viewBox={compact ? "18 60 164 132" : "18 8 164 184"}
      className={cn("size-full", className)}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      {!compact && (
        <>
          <path d={ARC} fill={gold} />
          <path d={ARC} fill={green} transform={mirror} />
        </>
      )}
      <path d={OUTER_LEAF} fill={green} />
      <path d={OUTER_LEAF} fill={green} transform={mirror} />
      <path d={INNER_LEAF} fill={green} />
      <path d={INNER_LEAF} fill={green} transform={mirror} />
      <circle cx="100" cy="84" r="15" fill={green} />
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
