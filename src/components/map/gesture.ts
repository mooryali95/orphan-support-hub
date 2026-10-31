/**
 * إيماءات الخارطة — حسابٌ خالص بلا DOM، فيُختبر وحده.
 *
 * الإطار (`View`) بإحداثيات العالم المسقَط، والشاشة بالبكسل. قرصةٌ أو
 * عجلة تكبّر حول نقطةٍ ثابتة على الشاشة؛ سحبٌ ينقل؛ والحدود تمنع الضياع:
 * لا أبعد من العالم كلّه ولا أقرب من حدٍّ لا يُرى فيه شيء.
 */
import type { View } from "./camera";

export type Size = { w: number; h: number };
export type Point = { x: number; y: number };

/** أقصى تكبيرٍ: عرض الإطار لا يقلّ عن عرض العالم ÷ هذا. */
export const MAX_ZOOM = 48;

/** نقطة شاشةٍ ← نقطة عالم. */
export function toWorld(v: View, size: Size, p: Point): Point {
  return { x: v.x + (p.x / size.w) * v.w, y: v.y + (p.y / size.h) * v.h };
}

/**
 * تكبيرٌ بمعاملٍ حول نقطة شاشة: ما تحت الإصبع يبقى تحت الإصبع.
 * factor > 1 يقرّب، < 1 يبعّد.
 */
export function zoomAround(v: View, factor: number, at: Point, size: Size): View {
  const f = Math.max(1e-6, factor);
  const anchor = toWorld(v, size, at);
  const w = v.w / f;
  const h = v.h / f;
  return { x: anchor.x - (at.x / size.w) * w, y: anchor.y - (at.y / size.h) * h, w, h };
}

/** نقلٌ بمقدار بكسلات الشاشة. */
export function panBy(v: View, dx: number, dy: number, size: Size): View {
  return { ...v, x: v.x - (dx / size.w) * v.w, y: v.y - (dy / size.h) * v.h };
}

/**
 * قيدٌ على الإطار: لا يصغر عن `world.w / MAX_ZOOM` — أو عن `minW` إن أُعطي
 * أصغر، فالدولة الصغيرة على هاتفٍ ضيّق تبدأ أقرب من الحدّ العامّ ويجب أن
 * تظلّ قابلةً للتقريب — ولا يكبر عن إطار «الكلّ» (`outer`)، ويبقى مركزه
 * داخل العالم فلا يسحبه أحد إلى الفراغ.
 */
export function clampView(v: View, world: Size, outer: View, minW = world.w / MAX_ZOOM): View {
  const aspect = v.h / v.w;
  const maxW = outer.w;
  const w = Math.min(maxW, Math.max(minW, v.w));
  const h = w * aspect;
  const cx = Math.min(world.w, Math.max(0, v.x + v.w / 2));
  const cy = Math.min(world.h, Math.max(0, v.y + v.h / 2));
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** قرصةٌ بإصبعين: المركز والمسافة بينهما. */
export function pinchOf(a: Point, b: Point): { center: Point; dist: number } {
  return {
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    dist: Math.hypot(a.x - b.x, a.y - b.y),
  };
}

/** إطاران متقاربان بما يكفي ليُعدّا واحداً (لإخفاء زرّ «إعادة الضبط»). */
export function sameView(a: View | null, b: View | null, tol = 0.01): boolean {
  if (!a || !b) return a === b;
  const s = Math.max(a.w, b.w);
  return (
    Math.abs(a.x - b.x) / s < tol &&
    Math.abs(a.y - b.y) / s < tol &&
    Math.abs(a.w - b.w) / s < tol &&
    Math.abs(a.h - b.h) / s < tol
  );
}

export type Dir = "up" | "down" | "left" | "right";

/**
 * لوحة المفاتيح على الخارطة نفسها: من نقطةٍ، أقرب مرشّحٍ في اتّجاه السهم.
 * «في الاتّجاه» يعني داخل مخروط ٩٠° حوله؛ والأقرب بالمسافة الموزونة —
 * الانحراف الجانبي يُعاقَب فلا يقفز السهم إلى من بجواره بزاوية.
 */
export function nearestInDirection<T>(
  from: Point,
  candidates: T[],
  pointOf: (c: T) => Point,
  dir: Dir,
): T | null {
  let best: T | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const p = pointOf(c);
    const dx = p.x - from.x;
    const dy = p.y - from.y;
    if (dx === 0 && dy === 0) continue;
    // المحور الرئيسي بحسب الاتّجاه، والجانبي ما عداه.
    const main = dir === "left" ? -dx : dir === "right" ? dx : dir === "up" ? -dy : dy;
    const side = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
    if (main <= 0 || side > main) continue; // خارج المخروط
    const score = main + side * 2;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** في RTL السهم «يسار» يعني «إلى الأمام»؛ على الخارطة الجغرافيا لا تنقلب. */
export function dirOfKey(key: string): Dir | null {
  switch (key) {
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    default:
      return null;
  }
}
