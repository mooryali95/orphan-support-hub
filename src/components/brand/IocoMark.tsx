import { cn } from "@/lib/utils";
import { IOCO_BLUE_PATH, IOCO_GOLD_PATH, IOCO_TRANSFORM, IOCO_VIEWBOX } from "./ioco-paths";

/**
 * شعار IOCO — المسارات المتجهة مستخرَجة من العلامة الرسمية نفسها
 * (وثيقة «الهوية المؤسسية: بناء العمران»، شريحة «تجلي الشعار»).
 *
 * التشريح كما تعرّفه الوثيقة:
 *   الخيط المتصل (رسم بقلم واحد) — الرعاية المستمرة وتماسك المؤسسة.
 *   المضيق (الطفل في الفراغ السالب) — عبور آمن نحو المستقبل؛ لا يُرسم الطفل
 *     بل يُترك للعين تُكمله، وهي «استراتيجية الفراغ» بعينها.
 *   الشطّان (الكفّان الحاضنتان) — نظام المجتمع الذي يحتضن اليتيم.
 *
 * لونان لا ثالث لهما في العلامة: الأزرق الملوكي (شط الفقد، النزاهة) والذهبي
 * الدافئ (المضيق، فعل الاحتضان). ولذلك لا يُعاد تلوين الشعار بألوان الحالة.
 */

type Variant = keyof typeof IOCO_VIEWBOX;
type Tone = "color" | "white" | "navy" | "current";

const TONE_FILL: Record<Exclude<Tone, "color">, string> = {
  white: "#FFFFFF",
  navy: "#17538F",
  current: "currentColor",
};

export function IocoMark({
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
  const gradientId = `ioco-${variant}-${tone}`;
  const solid = tone === "color" ? null : TONE_FILL[tone];

  return (
    <svg
      viewBox={IOCO_VIEWBOX[variant]}
      className={cn("size-full", className)}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}

      {!solid && (
        <defs>
          <linearGradient id={`${gradientId}-b`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#17538F" />
            <stop offset="0.62" stopColor="#1D5AA3" />
            <stop offset="1" stopColor="#5E7488" />
          </linearGradient>
          <linearGradient id={`${gradientId}-g`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#B48C46" />
            <stop offset="0.5" stopColor="#C9A058" />
            <stop offset="1" stopColor="#DCBB7C" />
          </linearGradient>
        </defs>
      )}

      <g transform={IOCO_TRANSFORM} fillRule="evenodd">
        <path fill={solid ?? `url(#${gradientId}-b)`} d={IOCO_BLUE_PATH} />
        <path fill={solid ?? `url(#${gradientId}-g)`} d={IOCO_GOLD_PATH} />
      </g>
    </svg>
  );
}

/**
 * القفل الرسمي في الترويسات والتذييل: الاسم متجهاً — يبقى حادّاً عند أي مقاس
 * ولا يحتاج نسخاً نقطية متعددة الكثافات كما كان قبل استخراج المسارات.
 */
export function IocoLockup({
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
      <IocoMark
        variant="wordmark"
        tone={onDark ? "white" : "color"}
        title="IOCO"
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
