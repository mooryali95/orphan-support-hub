import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getPublicVerification } from "@/lib/public-verification.functions";
import { defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("components/orphans/VerificationBadge", {
  ar: {
    two_sources: "موثّق من مصدرين",
    primary_source: "موثّق من الندوة",
    under_review: "قيد التحقق",
    hintTwo: "طابقت المنصّة بيانات الملف بين الندوة ومكتبها في الدولة.",
    hintPrimary: "طابقت المنصّة بيانات الملف مع سجلّ الندوة.",
    hintReview: "يُراجَع الملف الآن قبل استقبال كفالةٍ جديدة.",
    month: (m: string) => `آخر تحقّق ${m}`,
  },
  en: {
    two_sources: "Verified by two sources",
    primary_source: "Verified by WAMY",
    under_review: "Under verification",
    hintTwo: "The platform matched this file between WAMY and its country office.",
    hintPrimary: "The platform matched this file against WAMY's record.",
    hintReview: "This file is being reviewed before it takes a new sponsorship.",
    month: (m: string) => `Last verified ${m}`,
  },
});

/**
 * شارة الثقة للكافل: درجةٌ من ثلاث وشهر آخر تحقّق. لا تذكر سبب تنبيهٍ ولا
 * حقلاً من الملف؛ تلك للإدارة وحدها. تغيب إن لم تُعرف.
 */
export function VerificationBadge({ orphanId }: { orphanId: string }) {
  const c = useCopy(COPY);
  const fetchIt = useServerFn(getPublicVerification);
  const { data } = useQuery({
    queryKey: ["public-verification", orphanId],
    queryFn: () => fetchIt({ data: { orphanId } }),
    staleTime: 10 * 60_000,
  });
  if (!data) return null;
  const hint =
    data.level === "two_sources"
      ? c.hintTwo
      : data.level === "primary_source"
        ? c.hintPrimary
        : c.hintReview;
  return (
    <Badge
      variant={data.level === "under_review" ? "outline" : "secondary"}
      title={data.verified_month ? `${hint} ${c.month(data.verified_month)}` : hint}
      className="gap-1"
    >
      {data.level !== "under_review" && <ShieldCheck className="size-3.5" aria-hidden="true" />}
      {c[data.level]}
    </Badge>
  );
}
