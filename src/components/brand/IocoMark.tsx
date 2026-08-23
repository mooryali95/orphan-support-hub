import { cn } from "@/lib/utils";

/**
 * رمز IOCO — مستخرَج من دليل الهوية «الجسر الانسيابي».
 *
 * التشريح البصري كما يعرّفه الدليل، وكل عنصر هنا يقابل واحداً منها:
 *   انحناءات الكرة الأرضية (Globe Curves) — الامتداد الدولي والرعاية العابرة للحدود.
 *   اليدان المفتوحتان (Embracing Hands)   — زوايا منحنية دافئة تعبّر عن الحماية والاحتضان.
 *   مركزية اليتيم (The Core)              — النواة التي تحتضنها اليدان: الطفل رافعاً يديه بالأمل.
 *
 * الرمز خطّي بالكامل مثل الباترن نفسه، ويرث اللون من `currentColor`.
 */

/** اليدان المفتوحتان والإبهامان — العنصر الثابت في كل الأحجام. */
const HANDS = (
  <>
    <path d="M27,21 C15,52 25,80 60,99" />
    <path d="M93,21 C105,52 95,80 60,99" />
    <path d="M46,55 C40,47 47,41 51,48 C55,56 53,72 60,99" />
    <path d="M74,55 C80,47 73,41 69,48 C65,56 67,72 60,99" />
  </>
);

export function IocoMark({
  className,
  globe = true,
  title,
}: {
  className?: string;
  /** انحناءات الكرة الأرضية. تُطفأ تحت ~32px حيث تتحوّل إلى ضوضاء. */
  globe?: boolean;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={cn("size-full", className)}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={6.5}
      >
        {globe && (
          <>
            <circle cx="60" cy="58" r="49" strokeWidth={2} opacity={0.38} />
            <ellipse cx="60" cy="58" rx="20" ry="49" strokeWidth={1.7} opacity={0.24} />
          </>
        )}
        {HANDS}
      </g>
      <circle cx="60" cy="38" r="6.5" fill="currentColor" />
    </svg>
  );
}

/**
 * القفل الكامل: الرمز + الاسم + الوصف.
 * `IOCO` هوية المؤسسة، و«كافل» اسم المنصة تحتها.
 */
export function IocoLockup({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className={cn("text-bridge", compact ? "size-9" : "size-11")}>
        <IocoMark globe={!compact} title="شعار IOCO" />
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-extrabold tracking-[0.14em] text-shore-need",
            compact ? "text-base" : "text-lg",
          )}
          dir="ltr"
        >
          IOCO
        </span>
        {!compact && (
          <span className="mt-1 text-[11px] font-medium text-muted-foreground">
            منصة كفالة الأيتام
          </span>
        )}
      </span>
    </span>
  );
}
