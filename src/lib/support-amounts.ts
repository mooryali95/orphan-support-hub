/**
 * «ادعم في دقيقتين»: المبلغ المقترح من فجوة الهدف — حسابٌ خالص.
 *
 * الطفل يحمل فجوته في رابطه (من ملفّه)، والدولة أو المنطقة تأخذها من مصدر
 * الجغرافيا (`geo_stats.gap/currency`) المحجوب سلفاً إن صغر الحشد.
 */
import type { MapStats } from "@/components/map/demo-stats";
import { normalize } from "@/lib/countries";

export type Gap = { gap: number; currency: string };

export function gapOfTarget(args: {
  targetType: string | null;
  target: string;
  country: string;
  stats: MapStats;
  orphanGap?: number | undefined;
  orphanCurrency?: string | undefined;
}): Gap | null {
  const { targetType, target, country, stats, orphanGap, orphanCurrency } = args;
  if (targetType === "orphan") {
    return orphanGap && orphanGap > 0
      ? { gap: Math.ceil(orphanGap), currency: orphanCurrency ?? "EUR" }
      : null;
  }
  const cs = country ? stats[country] : undefined;
  if (!cs) return null;
  let s: { gap: number | null; currency: string | null } | undefined;
  if (targetType === "country") s = cs;
  else if (targetType === "region" && target) {
    s = Object.entries(cs.regions).find(([k]) => normalize(k) === normalize(target))?.[1];
  }
  if (!s || s.gap == null || s.gap <= 0) return null;
  return { gap: Math.ceil(s.gap), currency: s.currency ?? "EUR" };
}

/**
 * مبالغ الفرد (UX-11): أرقامٌ ثابتة يعرفها الناس (25/50/100)، و«سدّ المتبقّي»
 * حين تُعرف الفجوة — لا كسور فجوةٍ جماعية («يسدّ الشهر 1,440 €») يُقترح على
 * فردٍ أن يحملها وحده. كسور الفجوة تبقى للجهات (`suggestionsFor`).
 */
export const INDIVIDUAL_AMOUNTS = [25, 50, 100] as const;

export type Preset = { kind: "fixed"; value: number } | { kind: "rest"; value: number };

export function individualPresets(gap: Gap | null): Preset[] {
  const out: Preset[] = INDIVIDUAL_AMOUNTS.map((value) => ({ kind: "fixed" as const, value }));
  const rest = gap ? Math.ceil(gap.gap) : 0;
  // المتبقّي إن كان أحد الأرقام الثابتة لا يُكرَّر؛ يُوسم ذلك الرقم بدلاً منه.
  if (rest > 0 && !INDIVIDUAL_AMOUNTS.some((v) => v === rest)) {
    out.push({ kind: "rest", value: rest });
  }
  return out;
}

/** المبلغ الذي يبدأ به الفرد: 50 — أو المتبقّي كلّه إن كان أقلّ منها. */
export function defaultIndividualAmount(gap: Gap | null): number {
  const rest = gap ? Math.ceil(gap.gap) : 0;
  return rest > 0 && rest < 50 ? rest : 50;
}

/** ثلاث درجات: الشهر كلّه، نصفه، ربعه — بلا كسور. */
export function suggestionsFor(gap: number): [number, number, number] {
  const g = Math.max(1, Math.ceil(gap));
  return [g, Math.ceil(g / 2), Math.ceil(g / 4)];
}

/** المبلغ الذي يبدأ به المسار: نصف الشهر — محسوسٌ بلا ثقل. */
export function defaultAmount(gap: Gap | null, fallback: number): number {
  return gap ? suggestionsFor(gap.gap)[1] : fallback;
}
