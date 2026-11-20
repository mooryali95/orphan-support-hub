import { useEffect, useRef, useState } from "react";

/**
 * منحنى الاستقرار: نابضٌ حرج التخميد — يقترب من القيمة ولا يتجاوزها. هو نفسه
 * `--ease-settle` في motion.css، فالرقم والعنصر يتحرّكان بنفَسٍ واحد.
 */
const OMEGA = 9.2;
const END = 1 - (1 + OMEGA) * Math.exp(-OMEGA);
export function settle(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return (1 - (1 + OMEGA * t) * Math.exp(-OMEGA * t)) / END;
}

/** القيمة المعروضة عند اللحظة `t` (0–1): عددٌ صحيح لا يتجاوز الهدف. */
export function countAt(target: number, t: number): number {
  return Math.round(target * settle(t));
}

/**
 * عدّ الرقم حتى قيمته — مرّةً واحدة، حين ينقلب `run` من false إلى true.
 *
 * القيمة الأولى هي الهدف نفسه: الخادم ومن بلا سكربت ومن طلب تقليل الحركة
 * يرون الرقم الصحيح، ولا يُعرض صفرٌ على أنه حقيقة. اقرنه بـ useInView:
 * الرقم الظاهر عند التحميل يبقى ثابتاً، والذي تحت الطيّة يُعدّ حين يُرى.
 * ضع `tabular-nums` على العنصر حتى لا يهتزّ عرضه.
 */
export function useCountUp(
  target: number,
  { run, duration = 700 }: { run: boolean; duration?: number },
) {
  const [value, setValue] = useState(target);
  const wasIdle = useRef(false);

  useEffect(() => {
    if (!run) {
      wasIdle.current = true;
      return;
    }
    if (!wasIdle.current) {
      setValue(target);
      return;
    }
    wasIdle.current = false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let frame = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      setValue(countAt(target, t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    setValue(0);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      setValue(target);
    };
  }, [run, target, duration]);

  return value;
}
