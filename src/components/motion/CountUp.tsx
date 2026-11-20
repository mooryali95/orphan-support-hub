import { useCountUp } from "@/lib/motion/use-count-up";
import { useInView } from "@/lib/motion/use-in-view";

/**
 * رقمٌ يُعدّ حتى قيمته مرّةً واحدة حين يدخل الشاشة — 700ms بلا ارتداد.
 *
 * الخادم ومن بلا سكربت ومن طلب تقليل الحركة يرون القيمة النهائية؛ والرقم الظاهر عند فتح
 * الصفحة لا يُعدّ (لا يختفي ما رآه الزائر). ضع `tabular-nums` على الحاوي.
 */
export function CountUp({ value }: { value: number }) {
  const [ref, inView] = useInView<HTMLSpanElement>();
  const shown = useCountUp(value, { run: inView });
  return <span ref={ref}>{shown}</span>;
}
