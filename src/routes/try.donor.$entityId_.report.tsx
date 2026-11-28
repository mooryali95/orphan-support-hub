import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DonorReport } from "@/components/donor/DonorReport";
import { pageTitle } from "@/config/brand";
import { useDemo } from "@/lib/demo-mode";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
import { registerDonorDemos } from "@/lib/try-workspaces";

const COPY = defineCopy("routes/try.donor.report", {
  ar: {
    pageTitle: "تقرير الأثر: عرض تفاعلي",
    sample: "بيانات نموذجية",
    simulated: "هذا تقرير جهةٍ نموذجية، والأرقام فيه محاكاة وليست نتائج حقيقية.",
  },
  en: {
    pageTitle: "Impact report: interactive demo",
    sample: "Sample data",
    simulated: "This is a sample entity's report; its figures are simulated, not real results.",
  },
});

export const Route = createFileRoute("/try/donor/$entityId_/report")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).pageTitle, true, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: TryDonorReport,
});

function TryDonorReport() {
  // النسخ التجريبية تُسجَّل صراحةً قبل الرسم (sideEffects: false).
  const locale = useLocale();
  useState(() => registerDonorDemos(locale));
  const t = useCopy(COPY);
  const { entityId } = Route.useParams();
  const demo = useDemo();
  if (!demo)
    return <div aria-hidden="true" className="h-64 animate-pulse rounded-2xl bg-secondary" />;
  return (
    <div>
      <p className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 pt-6 text-sm text-muted-foreground sm:px-6 print:hidden">
        <span className="inline-flex items-center rounded-full bg-bridge-bright/15 px-3 py-1 text-xs font-semibold text-bridge-ink">
          {t.sample}
        </span>
        {t.simulated}
      </p>
      <DonorReport entityId={entityId} backTo={`/try/donor/${entityId}`} />
    </div>
  );
}
