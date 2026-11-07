import { Link } from "@tanstack/react-router";
import { ArrowLeft, HeartHandshake, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import type { SuggestedOrphan } from "@/lib/sponsorships.functions";

const COPY = defineCopy("components/ExcessSuggestion", {
  ar: {
    needsA: "هذا الملف يحتاج ",
    needsB: " فقط لإكمال احتياجه الشهري، فيزيد مبلغك عنه بـ",
    waiting: "وهؤلاء ينتظرون قريباً ممّا يزيد عندك:",
    needs: (m: string) => `يحتاج ${m}`,
    makeIt: (m: string) => `اجعله ${m}`,
    confirm: "أكمل لهذا الطفل",
  },
  en: {
    needsA: "This file needs only ",
    needsB: " to complete its monthly need, so your amount is higher by ",
    waiting: "These children are waiting for close to what you have extra:",
    needs: (m: string) => `Needs ${m}`,
    makeIt: (m: string) => `Make it ${m}`,
    confirm: "Continue for this child",
  },
});

/**
 * حين يتجاوز المبلغ المتبقّي.
 *
 * لا رفض ولا تحذير. الكافل في لحظة عطاء، ومقابلتها بـ«خطأ» تُطفئها — وقد
 * لا يعود. فالمعروض هنا **توجيه**: هذا هو المتبقّي الحقيقي، وهؤلاء أطفال
 * يُكمل فائضك احتياجهم. والقرار يبقى له، وزرّ «أكمل لهذا الطفل» حاضر بلا
 * تردّد لأن اختياره قد يكون لسبب لا نعلمه.
 */
export function ExcessSuggestion({
  gap,
  excess,
  currency,
  suggestions,
  onUseGapOnly,
  onConfirm,
  pending,
}: {
  gap: number;
  excess: number;
  currency: string;
  suggestions: SuggestedOrphan[];
  onUseGapOnly: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const locale = useLocale();
  const t = useCopy(COPY);
  return (
    <div className="border-bridge/40 bg-bridge/8 mt-3 rounded-xl border p-4">
      <p className="flex items-start gap-2 text-sm leading-7">
        <Sparkles className="text-bridge-ink mt-1 size-4 shrink-0" aria-hidden="true" />
        <span>
          {t.needsA}
          <strong>{formatMoney(gap, currency, locale)}</strong>
          {t.needsB}
          <strong>{formatMoney(excess, currency, locale)}</strong>.
        </span>
      </p>

      {suggestions.length > 0 && (
        <>
          <p className="text-muted-foreground mt-3 text-xs">{t.waiting}</p>
          <ul className="mt-2 space-y-1.5">
            {suggestions.map((s) => (
              <li key={s.id}>
                <Link
                  to="/orphans/$orphanId"
                  params={{ orphanId: s.id }}
                  className="border-border bg-card hover:border-bridge flex items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors"
                >
                  <HeartHandshake className="text-shore-need size-4 shrink-0" aria-hidden="true" />
                  {/* الاسم وحده: لا مدينة ولا منطقة في اقتراحٍ يراه الزائر. */}
                  <span className="flex-1">{s.display_name}</span>
                  <span className="text-bridge-ink text-xs font-bold tabular-nums">
                    {t.needs(formatMoney(s.gap, s.currency, locale))}
                  </span>
                  <ArrowLeft
                    className="ltr:-scale-x-100 text-muted-foreground size-3.5"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onUseGapOnly}>
          {t.makeIt(formatMoney(gap, currency, locale))}
        </Button>
        {/* الإصرار حقّ: قد يكون اختار هذا الطفل لسبب. */}
        <Button size="sm" onClick={onConfirm} disabled={pending}>
          {t.confirm}
        </Button>
      </div>
    </div>
  );
}
