import { createFileRoute } from "@tanstack/react-router";

import { DonorReport, REPORT_COPY } from "@/components/donor/DonorReport";
import { pageTitle } from "@/config/brand";
import { copyOf } from "@/lib/locale";

export const Route = createFileRoute("/_authenticated/donor/$entityId/report")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(REPORT_COPY, l).title, true, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: DonorReportPage,
});

/** تقرير الأثر للجهة المانحة؛ الرسم كلّه في `DonorReport` فيشاركه العرض التفاعلي. */
function DonorReportPage() {
  const { entityId } = Route.useParams();
  return <DonorReport entityId={entityId} backTo={`/donor/${entityId}`} />;
}
