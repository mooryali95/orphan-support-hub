import { defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/brand/CrossingProgress", {
  ar: { label: "نسبة تغطية الاحتياج الشهري" },
  en: { label: "Share of the monthly need covered" },
});

/**
 * شريط «العبور» — تمويل الملفّ مقروءاً بلغة الهوية.
 *
 * المسار الفارغ محايد: ما لم يُغطَّ بعد من الاحتياج.
 * المُعبَّأ بلون الهوية الرئيس (نبيذيّ الشعار): ما أنجزته الكفالات فعلاً.
 * وعند الاكتمال يتحوّل الشريط كله أخضر: بلغ الملفّ مرحلة العمران.
 */
export function CrossingProgress({
  percent,
  className,
  label,
}: {
  percent: number;
  className?: string;
  label?: string;
}) {
  const c = useCopy(COPY);
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const arrived = clamped >= 100;

  return (
    <div
      className={cn(
        "h-2 w-full overflow-hidden rounded-full",
        arrived ? "bg-shore-thrive/25" : "bg-foreground/10",
        className,
      )}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? c.label}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
          arrived ? "bg-shore-thrive" : "bg-primary",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
