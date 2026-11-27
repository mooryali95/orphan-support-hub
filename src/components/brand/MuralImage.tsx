import { BrandHalo } from "@/components/brand/BrandPattern";
import { defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/brand/MuralImage", {
  ar: {
    needAlt: (name: string) => `صورة تعبيرية لحالة ملفّ ${name}`,
    thriveAlt: (name: string) => `${name} بعد اكتمال كفالته`,
  },
  en: {
    needAlt: (name: string) => `Illustrative image for ${name}'s file`,
    thriveAlt: (name: string) => `${name} after their sponsorship was completed`,
  },
});

/**
 * نظام «الجداريات» — معالجة صور الملفات كما تعرّفها الاستراتيجية البصرية للعمران.
 *
 * الصورة في كهاتين ليست توثيقاً بل «أداة نفوذ تقود مسار التغيير الأسي نحو
 * الاستخلاف»، ولها سجلّان متقابلان:
 *
 *   need   — الجداريات المؤلمة: المنهج التفكيكي النقدي. تصوير مقرّب جداً يعزل
 *            التفاصيل ليُصدر حكماً بصرياً بضرورة التدخل، مع قيد صريح في
 *            الدليل: «دون امتهان كرامة الطفل». لذلك أحادي اللون، ولا وجه.
 *
 *   omran  — الجداريات الملهمة: نظم العمران والابتكار. لون كامل ودفء وتواصل
 *            بصري مباشر — «النظرة الواثقة تؤكد تحقق مراتب الوعي العليا وتعلن
 *            عن انتقال اليتيم من الهامش إلى المركز».
 *
 * السجلّ يُشتق من حالة الملفّ ولا يُختار يدوياً، فتكون القاعدة الأخلاقية
 * مفروضة في الكود لا متروكة لاجتهاد من يرفع الصورة.
 *
 * الافتراضي عند غياب الصورة هو العلامة الرمزية لا حرفٌ ولا وجه — وهو الافتراض
 * الصحيح حتى يصل حقل `photo_consent` في المرحلة 2. لا تُعرض صورة شخصية
 * لملف في حالة الاحتياج قبل توثيق إقرار ولي الأمر.
 */

type Register = "need" | "omran";

export function MuralImage({
  photoUrl,
  displayName,
  register,
  className,
  imgClassName,
  priority = false,
}: {
  photoUrl: string | null;
  displayName: string;
  register: Register;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
}) {
  const c = useCopy(COPY);
  if (!photoUrl) {
    return (
      // no photo: a quiet wine field with the child's initial in the display face, so each card is
      // personal rather than a repeated mark, over one large halo drawn from the logo's ring and crescent
      <div
        className={cn(
          "mural-placeholder relative flex items-center justify-center overflow-hidden",
          className,
        )}
      >
        <BrandHalo className="-end-[18%] -bottom-[55%] h-[190%] text-[color:var(--bridge-bright)] opacity-25" />
        <span
          aria-hidden="true"
          className="relative font-display text-[clamp(2.5rem,6vw,4rem)] leading-none font-bold text-[color:var(--bridge-bright)]"
        >
          {displayName.trim().charAt(0)}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <img
        src={photoUrl}
        alt={register === "need" ? c.needAlt(displayName) : c.thriveAlt(displayName)}
        loading={priority ? "eager" : "lazy"}
        className={cn(
          "size-full object-cover",
          // الجدارية المؤلمة أحادية اللون: الحكم البصري على الحالة لا على الشخص
          register === "need" && "contrast-[1.08] grayscale",
          imgClassName,
        )}
      />
      {register === "need" && (
        <div className="from-shore-need/35 pointer-events-none absolute inset-0 bg-gradient-to-t to-transparent" />
      )}
    </div>
  );
}

/** حالة الملفّ تحدّد السجلّ: بلغ العمران أم ما يزال في الاحتياج. */
export function registerFor(status: string, percent: number): Register {
  return status === "fully_sponsored" || percent >= 100 ? "omran" : "need";
}
