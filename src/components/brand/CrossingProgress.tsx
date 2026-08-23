import { cn } from "@/lib/utils";

/**
 * شريط «العبور» — تمويل الملف مقروءاً بلغة الهوية.
 *
 * المسار الفارغ أزرق باهت: الشاطئ الأول، ما لم يُغطَّ بعد من الاحتياج.
 * المُعبَّأ ذهبي: الجسر، أي ما أنجزته الكفالات فعلاً.
 * وعند الاكتمال يتحوّل الشريط كله أخضر: بلغ الملف مرحلة العمران.
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
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const arrived = clamped >= 100;

  return (
    <div
      className={cn(
        "h-2 w-full overflow-hidden rounded-full",
        arrived ? "bg-shore-thrive/25" : "bg-shore-need/15",
        className,
      )}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "نسبة تغطية الاحتياج الشهري"}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
          arrived
            ? "bg-shore-thrive"
            : "bg-[linear-gradient(to_left,var(--color-bridge),color-mix(in_oklch,var(--color-bridge)_72%,white))]",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
