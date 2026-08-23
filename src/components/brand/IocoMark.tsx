import { cn } from "@/lib/utils";

/**
 * شعار IOCO — مُعاد بناؤه من العلامة الرسمية كما تظهر في
 * «الاستراتيجية البصرية للعمران» (شريحة الختام: عدسة IOCO).
 *
 * التشريح كما يعرّفه دليل الهوية، وكل عنصر هنا يقابل واحداً منها:
 *   الكفّان المفتوحتان — الحماية والاحتضان. مصمتتان بثنية إبهام مقطوعة
 *     من المسار نفسه (fill-rule evenodd) فتظهر الأرضية خلالها كما في الأصل.
 *   الكرة الأرضية — الامتداد الدولي والرعاية العابرة للحدود.
 *   الطفل رافعاً يديه — مركزية اليتيم؛ «انتقاله من الهامش إلى المركز».
 *
 * لونان: الكفّان بالأزرق الملوكي (الشاطئ الأول)، والكرة والطفل بالذهبي
 * الدافئ (الجسر) — أي أن الرعاية تحتضن، والتدخل يُشرق.
 */

const HAND_LEFT =
  "M17,41 C9,68 22,95 52,109 L60,101 C34,89 24,66 29,45 C30,39 19,36 17,41 Z " +
  "M25,55 C24,72 33,86 50,95 L47,89 C34,81 28,69 28,56 Z";

const HAND_RIGHT =
  "M103,41 C111,68 98,95 68,109 L60,101 C86,89 96,66 91,45 C90,39 101,36 103,41 Z " +
  "M95,55 C96,72 87,86 70,95 L73,89 C86,81 92,69 92,56 Z";

export function IocoMark({
  className,
  globe = true,
  title,
}: {
  className?: string;
  /** الكرة الأرضية. تُطفأ تحت ~32px حيث تتحوّل خطوطها إلى ضوضاء. */
  globe?: boolean;
  title?: string;
}) {
  const cy = globe ? 42 : 44;

  return (
    <svg
      viewBox="0 0 120 120"
      className={cn("size-full", className)}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}

      <g className="text-shore-need" fill="currentColor" fillRule="evenodd">
        <path d={HAND_LEFT} />
        <path d={HAND_RIGHT} />
      </g>

      <g className="text-bridge">
        {globe && (
          <>
            <circle cx="60" cy={cy} r="26" fill="none" stroke="currentColor" strokeWidth={3} />
            <path
              d={`M60,${cy - 26} C50,${cy - 10} 50,${cy + 10} 60,${cy + 26} M60,${cy - 26} C70,${cy - 10} 70,${cy + 10} 60,${cy + 26} M35,${cy - 9} H85 M35,${cy + 9} H85`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              opacity={0.55}
            />
          </>
        )}
        <circle cx="60" cy={cy - 7} r="6" fill="currentColor" />
        <path
          d={`M60,${cy - 1} V${cy + 13} M60,${cy + 2} L49,${cy - 7} M60,${cy + 2} L71,${cy - 7} M60,${cy + 13} L53,${cy + 24} M60,${cy + 13} L67,${cy + 24}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** القفل الكامل: العلامة + الاسم + وصف المنصة. */
export function IocoLockup({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className={compact ? "size-9" : "size-11"}>
        <IocoMark globe={!compact} title="شعار IOCO" />
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "text-shore-need font-extrabold tracking-[0.14em]",
            compact ? "text-base" : "text-lg",
          )}
          dir="ltr"
        >
          IOCO
        </span>
        {!compact && (
          <span className="text-muted-foreground mt-1 text-[11px] font-medium">
            منصة كفالة الأيتام
          </span>
        )}
      </span>
    </span>
  );
}
