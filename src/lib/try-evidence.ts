/**
 * سجلّ التجربة: الأشهر نفسها التي يقدّمها الزائر بزرّ «قدّم شهراً»، بصيغة «سجلّ الأثر
 * الموثّق». كلّ ما فيه نموذج: مراجعه تبدأ بـDEMO-، ولا يُحفظ ولا يغيّر شيئاً. الشهر الذي
 * مضى كاملاً سُلِّم بمستند ومعه سطر تقريره (من `monthStory`)؛ والشهر الجاري دُفع وينتظر.
 */
import { addMonths, type EvidenceMonth } from "@/lib/impact-evidence";
import type { Locale } from "@/lib/locale";
import { localTryChild, monthStory, TRY_CURRENCY, tryChild, type TryGift } from "@/lib/try-demo";

export function tryEvidence(gifts: TryGift[], ahead: number, locale: Locale): EvidenceMonth[] {
  const n = Math.max(0, Math.floor(ahead));
  return gifts.flatMap((g) => {
    const k = tryChild(g.childId);
    if (!k) return [];
    const child = localTryChild(k, locale);
    const start = g.at.slice(0, 7);
    // a one-time gift is one month only; a monthly one has `n` full months and the current one
    const count = g.cadence === "monthly" ? n + 1 : 1;
    return Array.from({ length: count }, (_, i): EvidenceMonth => {
      const month = addMonths(start, i);
      const full = i < n;
      const note = full && g.cadence === "monthly";
      return {
        id: `${g.id}:${month}`,
        month,
        child: child.name,
        amount: g.amount,
        currency: TRY_CURRENCY,
        reached: full ? 3 : 1,
        upcoming: false,
        receipt: full ? `${k.code}-${month}` : null,
        note: note
          ? (monthStory(child, g.amount, i + 1, locale).find((s) => s.key === "note")?.text ?? null)
          : null,
      };
    });
  });
}
