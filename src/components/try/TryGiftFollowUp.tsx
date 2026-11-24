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
    strip: "جديدٌ من الميدان",
    stripLead: "ما سجّله المكتب والمشرف لأطفالك في هذه الجلسة.",
  },
  en: {
    visit: (date: string) => `Supervisor's visit · ${date}`,
    good: "Doing well",
    follow: "Needs follow-up",
    report: "The office's first monthly report has arrived",
    strip: "New from the field",
    stripLead: "What the office and the supervisor recorded for your children this session.",
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

/**
 * «جديدٌ من الميدان» في أعلى «أثري»: ما سجّله المكتب والمشرف لأطفال الكافل في الجلسة،
 * فيراه الحاضر فور وصوله إلى الصفحة دون أن يبحث عنه في قائمة الكفالات.
 */
export function TryFollowUpStrip({
  children: kids,
  className,
}: {
  children: Array<{ id: string; name: string }>;
  className?: string;
}) {
  const c = useCopy(COPY);
  const visits = useTrialValue<Visit[]>(loadVisits, []);
  const reported = useTrialValue(() => !!loadCycle().reportSent, false);
  const shown = kids.filter(
    (k, i, all) =>
      all.findIndex((x) => x.id === k.id) === i &&
      (visits.some((v) => v.childId === k.id) || (k.id === CYCLE_CHILD_ID && reported)),
  );
  if (shown.length === 0) return null;
  return (
    <section
      aria-labelledby="try-field"
      className={`rounded-2xl border border-bridge/60 bg-bridge/8 p-5 shadow-soft ${className ?? ""}`}
    >
      <h2 id="try-field" className="text-lg font-bold">
        {c.strip}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{c.stripLead}</p>
      <ul className="mt-3 space-y-3">
        {shown.map((k) => (
          <li key={k.id} className="flex flex-wrap gap-x-3">
            <span className="font-bold">{k.name}</span>
            <TryGiftFollowUp childId={k.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}
