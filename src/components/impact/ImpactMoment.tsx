import { useEffect, useRef, useState } from "react";

import { monthLabel, type ImpactMoment as Moment } from "@/lib/impact-evidence";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/impact/ImpactMoment", {
  ar: {
    eyebrow: "قُيّد في سجلّك",
    completedTitle: (child: string) => `اكتملت حاجة ${child} الشهرية`,
    completedText: "بحصّتك بلغت تغطية الحاجة الشهرية 100%، وأنت من الكافلين.",
    deliveredTitle: "وصل أوّل تسليمٍ موثّق",
    deliveredText: (child: string, month: string) =>
      `${month}: سُلِّمت دفعتك لكفالة ${child} بمستند، وهو محفوظٌ في سجلّك أدناه.`,
    begunTitle: (child: string) => `بدأ عطاؤك لكفالة ${child}`,
    begunText: "قُيّدت دفعتك الأولى. التالي: تحويلها إلى الجهة الميدانية، ثم مستند التسليم.",
  },
  en: {
    eyebrow: "Entered in your record",
    completedTitle: (child: string) => `${child}'s monthly need is complete`,
    completedText:
      "With your share, the monthly need is 100% covered, and you are among the sponsors.",
    deliveredTitle: "Your first documented delivery",
    deliveredText: (child: string, month: string) =>
      `${month}: your payment for ${child}'s sponsorship was delivered with a document, kept in your record below.`,
    begunTitle: (child: string) => `Your giving for ${child}'s sponsorship has begun`,
    begunText:
      "Your first payment is recorded. Next: its transfer to the field organization, then the delivery record.",
  },
});

/**
 * «لحظة الأثر»: إقرارٌ رسميّ هادئ حين يقع شيءٌ حقيقي (اكتمال حاجة، أوّل تسليمٍ موثّق، أوّل
 * دفعة). سطرٌ واحد بختمٍ يستقرّ وعلامةٍ تُرسم — بلا قصاصات ولا تراكب. يُعرض ما استجدّ للتوّ،
 * وإلا فأثقل ما هو قائم؛ ومن طلب تقليل الحركة يراه ساكناً مكتملاً.
 */
export function ImpactMoment({ moments, className }: { moments: Moment[]; className?: string }) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const keys = moments.map((m) => m.key).join(",");
  const seen = useRef<string[] | null>(null);
  const [fresh, setFresh] = useState<Moment["key"] | null>(null);
  useEffect(() => {
    const now = keys ? (keys.split(",") as Moment["key"][]) : [];
    // the first render shows the weightiest standing fact; afterwards, whatever is new
    const gained = seen.current ? now.find((k) => !seen.current!.includes(k)) : undefined;
    seen.current = now;
    setFresh((was) => gained ?? (was && now.includes(was) ? was : null));
  }, [keys]);
  const m = moments.find((x) => x.key === fresh) ?? moments[0];
  if (!m) return null;
  const [title, text] =
    m.key === "completed"
      ? [c.completedTitle(m.child), c.completedText]
      : m.key === "delivered"
        ? [c.deliveredTitle, c.deliveredText(m.child, monthLabel(m.month, locale))]
        : [c.begunTitle(m.child), c.begunText];
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-4 rounded-2xl border border-bridge/50 bg-card px-5 py-4 shadow-soft sm:gap-5 sm:px-7 sm:py-5",
        className,
      )}
    >
      {/* keyed by the moment, so the seal settles and the mark draws once for each new one */}
      <span key={m.key} aria-hidden="true" className="relative size-12 shrink-0">
        <span className="mo-seal absolute inset-0 rounded-full bg-primary ring-1 ring-bridge ring-offset-2 ring-offset-card" />
        <svg viewBox="0 0 48 48" className="absolute inset-0 text-primary-foreground">
          <path
            d="M15 25l6.5 6.5L34 17"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            className="mo-draw"
            style={{ ["--mo-delay" as string]: "240ms" }}
          />
        </svg>
      </span>
      <div key={`t-${m.key}`} className="mo-rise min-w-0">
        <p className="flex items-center gap-2 text-xs font-bold text-bridge-ink">
          <span aria-hidden="true" className="h-px w-6 bg-bridge" />
          {c.eyebrow}
        </p>
        <p className="mt-1 font-display text-xl font-bold leading-snug sm:text-2xl">{title}</p>
        <p className="mt-1 text-sm leading-7 text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
