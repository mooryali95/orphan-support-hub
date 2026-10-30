import { Link } from "@tanstack/react-router";
import { ArrowLeft, HeartHandshake, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import type { SuggestedOrphan } from "@/lib/sponsorships.functions";

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
  return (
    <div className="border-bridge/40 bg-bridge/8 mt-3 rounded-xl border p-4">
      <p className="flex items-start gap-2 text-sm leading-7">
        <Sparkles className="text-bridge-ink mt-1 size-4 shrink-0" aria-hidden="true" />
        <span>
          هذا الملف يحتاج <strong>{formatMoney(gap, currency)}</strong> فقط لإكمال احتياجه الشهري،
          فيزيد مبلغك عنه بـ<strong>{formatMoney(excess, currency)}</strong>.
        </span>
      </p>

      {suggestions.length > 0 && (
        <>
          <p className="text-muted-foreground mt-3 text-xs">
            وهؤلاء ينتظرون قريباً ممّا يزيد عندك:
          </p>
          <ul className="mt-2 space-y-1.5">
            {suggestions.map((s) => (
              <li key={s.id}>
                <Link
                  to="/orphans/$orphanId"
                  params={{ orphanId: s.id }}
                  className="border-border bg-card hover:border-bridge flex items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors"
                >
                  <HeartHandshake className="text-shore-need size-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1">
                    {s.display_name}
                    {s.city && <span className="text-muted-foreground"> — {s.city}</span>}
                  </span>
                  <span className="text-bridge-ink text-xs font-bold tabular-nums">
                    يحتاج {formatMoney(s.gap, s.currency)}
                  </span>
                  <ArrowLeft className="ltr:-scale-x-100 text-muted-foreground size-3.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onUseGapOnly}>
          اجعله {formatMoney(gap, currency)}
        </Button>
        {/* الإصرار حقّ: قد يكون اختار هذا الطفل لسبب. */}
        <Button size="sm" onClick={onConfirm} disabled={pending}>
          أكمل لهذا الطفل
        </Button>
      </div>
    </div>
  );
}
