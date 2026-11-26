import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

import { CrossingProgress } from "@/components/brand/CrossingProgress";
import { Name } from "@/components/kit/Name";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, fundingPercent } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { SIMILAR_READY_ID, useSimilarReady } from "@/components/orphans/similar-ready";

const COPY = defineCopy("components/orphans/SimilarReadyChildren", {
  ar: {
    title: "أطفالٌ جاهزون للكفالة الآن",
    lead: "ملفّاتٌ موثّقة تقبل كفالةً جديدة، باحتياجٍ قريبٍ من هذا الملف.",
    remaining: (amount: string) => `المتبقّي ${amount} شهرياً`,
    open: (name: string) => `اعرض ملف ${name}`,
  },
  en: {
    title: "Children ready for sponsorship now",
    lead: "Verified files that accept a new sponsorship, with a need close to this one.",
    remaining: (amount: string) => `${amount} still needed monthly`,
    open: (name: string) => `View ${name}'s file`,
  },
});

/**
 * تحت إشعار «قيد التحقق»: بدائل جاهزة لا طريقٌ مسدود. الاقتراح من القاعدة يستبعد
 * الملفات غير الموثّقة، ويُعرض بالبطاقة العامّة وحدها (اسم، احتياج، فجوة).
 * يغيب القسم كلّه إن لم يُوجد بديل أو تعذّر الاقتراح.
 */
export function SimilarReadyChildren({ orphanId, amount }: { orphanId: string; amount: number }) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const { data, isPending } = useSimilarReady(orphanId, amount);

  if (isPending) {
    return (
      <div className="space-y-2" aria-hidden="true">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }
  const list = data?.suggestions ?? [];
  if (list.length === 0) return null;

  return (
    <section id={SIMILAR_READY_ID} aria-labelledby="similar-ready-title" className="scroll-mt-24">
      <h3 id="similar-ready-title" className="text-base font-bold text-balance">
        {c.title}
      </h3>
      <p className="mt-1 text-sm leading-7 text-pretty text-muted-foreground">{c.lead}</p>
      <ul className="mt-3 space-y-2">
        {list.map((o) => (
          <li key={o.id}>
            <Link
              to="/orphans/$orphanId"
              params={{ orphanId: o.id }}
              aria-label={c.open(o.display_name)}
              className="block min-h-11 rounded-xl bg-card p-3 shadow-[0_0_0_1px_rgb(0_0_0/0.08)] transition-[box-shadow,transform] duration-150 hover:shadow-[0_0_0_1px_rgb(0_0_0/0.12),0_4px_12px_-4px_rgb(0_0_0/0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.99] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)]"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck
                  className="size-4 shrink-0 text-shore-thrive"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <Name className="min-w-0 truncate font-semibold">{o.display_name}</Name>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                {c.remaining(formatMoney(o.gap, o.currency, locale))}
              </span>
              <CrossingProgress
                percent={fundingPercent(o.monthly_need, o.funded_monthly)}
                className="mt-2"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
