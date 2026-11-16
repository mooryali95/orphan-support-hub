import { normalize } from "@/lib/countries";

export type SearchItem = {
  key: string;
  label: string;
  /** أسماءٌ أخرى يُبحث بها (الاسم الإنجليزي، الرمز، الأسماء البديلة). */
  alt?: string[];
  sub?: string;
  kind: "country" | "region";
  go: () => void;
};

/** يطابق بداية الكلمة أوّلاً، ثم أيّ موضع — فـ«ألب» تأتي بألبانيا قبل ما يحويها. */
export function rankSearch(items: SearchItem[], q: string, limit = 8): SearchItem[] {
  const n = normalize(q.trim());
  if (!n) return items.slice(0, limit);
  const scored: Array<[number, SearchItem]> = [];
  for (const it of items) {
    let best = Infinity;
    for (const name of [it.label, ...(it.alt ?? [])]) {
      const h = normalize(name);
      const i = h.indexOf(n);
      if (i < 0) continue;
      const score = i === 0 ? 0 : h[i - 1] === " " ? 1 : 2;
      best = Math.min(best, score);
    }
    if (best < Infinity) scored.push([best + (it.kind === "region" ? 0 : 0.5), it]);
  }
  return scored
    .sort((a, b) => a[0] - b[0] || a[1].label.localeCompare(b[1].label))
    .slice(0, limit)
    .map((x) => x[1]);
}
