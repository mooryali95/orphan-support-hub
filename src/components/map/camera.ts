/**
 * الكاميرا — انتقالٌ بين موضعين على الخارطة كما تفعل الطائرة: تبتعد قليلاً
 * ثم تقترب، فيرى الزائر من أين جاء وإلى أين ذهب (van Wijk & Nuij 2003،
 * وهو ما يستعمله d3.interpolateZoom). القيم بإحداثيات العالم المسقَط.
 */
export type View = { x: number; y: number; w: number; h: number };

const RHO = 1.35;

/** يعيد دالّة t∈[0,1] ← View، ومدّةً مقترحة بالملّي ثانية. */
export function flight(from: View, to: View) {
  const ux0 = from.x + from.w / 2,
    uy0 = from.y + from.h / 2,
    w0 = from.w;
  const ux1 = to.x + to.w / 2,
    uy1 = to.y + to.h / 2,
    w1 = to.w;
  const aspect = from.h / from.w;
  const dx = ux1 - ux0,
    dy = uy1 - uy0,
    d2 = dx * dx + dy * dy;

  let at: (t: number) => [number, number, number];
  let S: number;
  if (d2 < 1e-12) {
    S = Math.log(w1 / w0) / RHO;
    at = (t) => [ux0, uy0, w0 * Math.exp(RHO * t * S)];
  } else {
    const d1 = Math.sqrt(d2);
    const b0 = (w1 * w1 - w0 * w0 + RHO ** 4 * d2) / (2 * w0 * RHO ** 2 * d1);
    const b1 = (w1 * w1 - w0 * w0 - RHO ** 4 * d2) / (2 * w1 * RHO ** 2 * d1);
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
    const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
    S = (r1 - r0) / RHO;
    const cosh = (x: number) => (Math.exp(x) + Math.exp(-x)) / 2;
    const sinh = (x: number) => (Math.exp(x) - Math.exp(-x)) / 2;
    const tanh = (x: number) => sinh(x) / cosh(x);
    at = (t) => {
      const s = t * S;
      const coshr0 = cosh(r0);
      const u = (w0 / (RHO * RHO * d1)) * (coshr0 * tanh(RHO * s + r0) - sinh(r0));
      return [ux0 + u * dx, uy0 + u * dy, (w0 * coshr0) / cosh(RHO * s + r0)];
    };
  }

  // أطول قليلاً ممّا تحسبه اليد ضرورياً: الطيران مشهدٌ نادر، وما يقلّ عن
  // ثانيةٍ ونصف يُحَسّ قفزةً لا رحلة.
  const duration = Math.min(2600, Math.max(1400, Math.abs(S) * 950));
  return {
    duration,
    at(t: number): View {
      const [cx, cy, w] = at(t);
      // الارتفاع يتبع النسبة الأولى، ثم يُصحَّح خطّياً نحو نسبة الهدف.
      const h = w * (aspect + (to.h / to.w - aspect) * t);
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    },
  };
}

/**
 * منحنى الطيران: جيبيٌّ لطيف. مسار van Wijk يوازن السرعة المحسوسة بنفسه،
 * فالمنحنى التكعيبي القويّ فوقه يضغط الرحلة كلّها في ثُلثها الأوسط وتصير قفزة.
 */
export const easeInOut = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOut = (t: number) => 1 - (1 - t) ** 4;

/** إطار يحيط بالصندوق [x,y,w,h] بنسبة الحاوية، مع هامش. */
export function fit(
  box: [number, number, number, number],
  aspect: number,
  pad = 1.35,
  min = 0,
): View {
  const [x, y, bw, bh] = box;
  let w = Math.max(bw * pad, (bh * pad) / aspect, min);
  let h = w * aspect;
  if (h < bh * pad) {
    h = bh * pad;
    w = h / aspect;
  }
  return { x: x + bw / 2 - w / 2, y: y + bh / 2 - h / 2, w, h };
}
