/**
 * مبالغ مقترحة من حاجة الطفل نفسها لا أرقامٌ ثابتة: 25/50/100 تصلح لليورو وتضيع
 * بالجنيه أو الريال. ربع الحاجة ونصفها وكاملها، مقرّبةً تقريباً «لطيفاً» بحسب حجمها.
 */
export function niceRound(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const step = n < 50 ? 5 : n < 200 ? 10 : n < 1000 ? 50 : n < 5000 ? 100 : 500;
  return Math.max(step, Math.round(n / step) * step);
}

/** up to three distinct amounts (≥ 5), excluding the gap itself, which has its own «fill» button */
export function amountPresets(need: number, gap: number): number[] {
  const base = need > 0 ? need : 100;
  const out: number[] = [];
  for (const k of [0.25, 0.5, 1]) {
    const v = niceRound(base * k);
    if (v >= 5 && v !== Math.round(gap) && !out.includes(v)) out.push(v);
  }
  return out;
}
