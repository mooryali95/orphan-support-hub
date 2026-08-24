import { Sparkles } from "lucide-react";

import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * العطاء فوق الاحتياج.
 *
 * الفائض لا يُعرض بشريط عند 140٪ — شريط يتجاوز طرفه يُقرأ عطلاً لا كرماً.
 * يُعرض شارةً مستقلّة فوق الشريط المكتمل: الشريط بلغ العمران، وهذا شيء
 * **زائد عليه**.
 *
 * وأهمّ ما فيها أنها تقول ما يفتحه الفائض لا مقداره وحده. «فائض 45$»
 * رقمٌ معلّق؛ و«يكفي لبرنامج المهارات الرقمية» عطاءٌ له وجه.
 */
export function SurplusBadge({
  surplus,
  currency,
  unlocks,
  className,
}: {
  surplus: number;
  currency: string;
  unlocks?: { title: string; monthly_price: number } | null;
  className?: string;
}) {
  if (surplus <= 0) return null;

  return (
    <div
      className={cn(
        // الذهبي البنيوي حدّاً وأرضيةً، والنصّ بالذهبي الداكن المقروء.
        "border-bridge/45 bg-[linear-gradient(to_left,color-mix(in_oklch,var(--color-bridge)_14%,transparent),transparent)] rounded-xl border p-3",
        className,
      )}
    >
      <p className="flex items-center gap-2 text-sm font-bold">
        <Sparkles className="text-bridge-ink size-4 shrink-0" aria-hidden="true" />
        <span className="text-bridge-ink">عطاء فوق الاحتياج</span>
        <span className="text-bridge-ink ms-auto tabular-nums">
          +{formatMoney(surplus, currency)}
        </span>
      </p>

      <p className="text-muted-foreground mt-1.5 text-xs leading-6">
        {unlocks ? (
          <>
            اكتمل احتياجه الشهري، وهذا الفائض يفتح له{" "}
            <strong className="text-foreground font-medium">{unlocks.title}</strong> —{" "}
            {formatMoney(unlocks.monthly_price, currency)} شهرياً.
          </>
        ) : (
          <>
            اكتمل احتياجه الشهري، وهذا الفائض يُوجَّه إلى برنامج إضافي تختاره جهة الرعاية وتعتمده
            الإدارة.
          </>
        )}
      </p>
    </div>
  );
}
