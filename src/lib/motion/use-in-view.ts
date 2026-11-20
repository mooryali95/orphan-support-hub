import { useCallback, useEffect, useRef, useState } from "react";

/**
 * هل دخل العنصر مجال الرؤية؟ — للظهور الزمنيّ مرّةً واحدة ولبدء عدّ الأرقام.
 *
 * يبدأ `true`: ما رسمه الخادم ظاهر، ومن غاب عنه السكربت يرى كل شيء. وبعد
 * التركيب يصير `false` للعناصر التي تحت الطيّة فقط (وهي خارج الشاشة فلا يُرى
 * اختفاؤها)، ثم `true` حين تدخل. ما كان ظاهراً عند التحميل لا يختفي أبداً.
 *
 *   const [ref, inView] = useInView<HTMLDivElement>();
 *   <div ref={ref} className="mo-reveal" data-inview={inView} />
 */
export function useInView<T extends Element>({
  once = true,
  margin = "0px 0px -12% 0px",
}: { once?: boolean; margin?: string } = {}) {
  const [inView, setInView] = useState(true);
  const [node, setNode] = useState<T | null>(null);
  const seen = useRef(false);
  const ref = useCallback((el: T | null) => setNode(el), []);

  useEffect(() => {
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          seen.current = true;
          setInView(true);
          if (once) io.disconnect();
        } else if (!(once && seen.current)) {
          setInView(false);
        }
      },
      { rootMargin: margin },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [node, once, margin]);

  return [ref, inView] as const;
}
