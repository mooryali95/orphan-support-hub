import { Clock, ShieldCheck } from "lucide-react";

import { usePublicVerification } from "@/components/orphans/public-verification";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/orphans/VerificationBadge", {
  ar: {
    two_sources: "موثّق من مصدرين",
    primary_source: "موثّق من الندوة",
    under_review: "قيد التحقق",
    hintTwo: "طابقت المنصّة بيانات الملف بين الندوة ومكتبها في الدولة.",
    hintPrimary: "طابقت المنصّة بيانات الملف مع سجلّ الندوة.",
    hintReview: "يُراجَع الملف الآن قبل استقبال كفالةٍ جديدة.",
  },
  en: {
    two_sources: "Verified by two sources",
    primary_source: "Verified by WAMY",
    under_review: "Under verification",
    hintTwo: "The platform matched this file between WAMY and its country office.",
    hintPrimary: "The platform matched this file against WAMY's record.",
    hintReview: "This file is being reviewed before it takes a new sponsorship.",
  },
});

/**
 * شارة الثقة للكافل: درجةٌ من ثلاث وشهر آخر تحقّق. لا تذكر سبب تنبيهٍ ولا
 * حقلاً من الملف؛ تلك للإدارة وحدها. تغيب إن لم تُعرف.
 */
export function VerificationBadge({ orphanId }: { orphanId: string }) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const { data } = usePublicVerification(orphanId);
  if (!data) return null;
  const hint =
    data.level === "two_sources"
      ? c.hintTwo
      : data.level === "primary_source"
        ? c.hintPrimary
        : c.hintReview;
  // «نوفمبر 2026» بلغة الواجهة، لا «2026-11».
  const month = data.verified_month
    ? new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
        new Date(`${data.verified_month}-01T00:00:00Z`),
      )
    : null;
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold",
        data.level === "two_sources" && "bg-shore-thrive/12 text-shore-thrive",
        data.level === "primary_source" && "bg-secondary text-foreground",
        data.level === "under_review" && "border border-border text-muted-foreground",
      )}
    >
      {data.level === "under_review" ? (
        <Clock className="size-3.5" strokeWidth={2} aria-hidden="true" />
      ) : (
        <ShieldCheck className="size-3.5" strokeWidth={2} aria-hidden="true" />
      )}
      {c[data.level]}
      {month && <span className="font-normal opacity-80">· {month}</span>}
      {/* الشرح لقارئ الشاشة واللمس كذلك، لا في تلميحٍ يظهر بالمؤشّر وحده */}
      <span className="sr-only">. {hint}</span>
    </span>
  );
}
