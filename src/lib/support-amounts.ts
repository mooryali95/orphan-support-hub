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

/** ثلاث درجات: الشهر كلّه، نصفه، ربعه — بلا كسور. */
export function suggestionsFor(gap: number): [number, number, number] {
  const g = Math.max(1, Math.ceil(gap));
  return [g, Math.ceil(g / 2), Math.ceil(g / 4)];
}

/** المبلغ الذي يبدأ به المسار: نصف الشهر — محسوسٌ بلا ثقل. */
export function defaultAmount(gap: Gap | null, fallback: number): number {
  return gap ? suggestionsFor(gap.gap)[1] : fallback;
}
