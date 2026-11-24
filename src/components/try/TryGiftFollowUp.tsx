import { ClipboardCheck, ScrollText } from "lucide-react";

import { formatDate } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { CYCLE_CHILD_ID, loadCycle } from "@/lib/try-cycle";
import { loadVisits, useTrialValue, type Visit } from "@/lib/try-role-state";

const COPY = defineCopy("components/try/TryGiftFollowUp", {
  ar: {
    visit: (date: string) => `زيارة المشرف · ${date}`,
    good: "بخير ومستقرّ",
    follow: "يحتاج متابعة",
    report: "وصل تقرير الشهر الأوّل من المكتب",
  },
  en: {
    visit: (date: string) => `Supervisor's visit · ${date}`,
    good: "Doing well",
    follow: "Needs follow-up",
    report: "The office's first monthly report has arrived",
  },
});

/**
 * ما يصل الكافل من الأدوار الأخرى في جلسة العرض: آخر زيارةٍ سجّلها المشرف لطفله، وتقرير
 * المكتب الأوّل لطفل «الدورة الكاملة». كما في المنصّة الحقيقية: المتابعة تصل «أثري».
 */
export function TryGiftFollowUp({ childId }: { childId: string }) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const visits = useTrialValue<Visit[]>(loadVisits, []);
  const report = useTrialValue(() => childId === CYCLE_CHILD_ID && !!loadCycle().reportSent, false);
  const last = visits.find((v) => v.childId === childId);
  if (!last && !report) return null;
  return (
    <span className="w-full space-y-1.5 border-t border-border pt-2 text-sm">
      {report && (
        <span className="flex items-center gap-2 font-bold text-shore-thrive">
          <ScrollText className="size-4 shrink-0" aria-hidden="true" />
          {c.report}
        </span>
      )}
      {last && (
        <span className="flex items-start gap-2">
          <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="font-bold">{c.visit(formatDate(last.at, locale))}</span>
            <span className={last.state === "good" ? "text-shore-thrive" : "text-bridge-ink"}>
              {" "}
              · {last.state === "good" ? c.good : c.follow}
            </span>
            {last.note && (
              <span className="block leading-6 text-muted-foreground">«{last.note}»</span>
            )}
          </span>
        </span>
      )}
    </span>
  );
}
