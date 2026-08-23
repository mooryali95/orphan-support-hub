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

/**
 * القفل الرسمي — الشعار كما هو في حقيبة الهوية، صورةً لا مساراً متجهياً.
 *
 * الحقيبة تعرض الشعار بصيغتين، وقياس البكسل أثبت أنهما لا تتطابقان:
 * ملفّ SVG **تتبُّعٌ آلي** للصورة، وقد صهر كل الأشكال في مسار واحد
 * وقرّب ألوانها بتدرّج خطّي وحيد. والأصل ليس تدرّجاً: عند x=2060 يكون
 * القوس الأعلى رمادياً (116,125,131) والحرف تحته أزرق (35,90,159) —
 * لونان عند الإحداثي الأفقي نفسه. والتدرّج الخطّي يمنح كل إحداثي لوناً
 * واحداً، فلا يمكنه أن يصف هذا أبداً.
 *
 * أي أن التتبّع أتلف الربط بين الشكل ولونه إتلافاً لا يُستردّ، فلا سبيل
 * إلى أمانة لونية من ذلك الملفّ مهما عُولج. والصورة النقطية هي الأصل
 * الذي اشتُقّ منه التتبّع لا العكس، فاعتمادها أوفى وأخفّ معاً: هذه
 * النسخ مقصوصة الهوامش ومصغَّرة إلى المقاسات المستعملة فعلاً ومكمَّمة
 * إلى 256 لوناً (الشعار مسطّحات لونية لا تدرّجات فوتوغرافية)، فجاءت
 * أصغر من الملفّ المتتبَّع ومطابقةً للأصل في آن.
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
  const base = onDark ? "/brand/ioco-wordmark-white" : "/brand/ioco-wordmark";

  return (
    <span className={cn("flex items-center gap-2.5", className)} dir="ltr">
      <picture>
        <source type="image/webp" srcSet={`${base}-240.webp 1x, ${base}-480.webp 2x`} />
        <img
          src={`${base}-240.png`}
          srcSet={`${base}-240.png 1x, ${base}-480.png 2x`}
          alt="IOCO"
          // نسبة الأصل بعد قصّ الهوامش 1557×813.
          className={cn("w-auto", compact ? "h-8" : "h-10")}
          width={1557}
          height={813}
        />
      </picture>
      {!compact && (
        <span className="text-muted-foreground hidden text-[11px] font-medium sm:inline" dir="rtl">
          منصة كفالة الأيتام
        </span>
      )}
    </span>
  );
}
