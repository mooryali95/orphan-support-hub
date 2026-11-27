import { createFileRoute } from "@tanstack/react-router";

import { SponsorshipReport } from "@/components/sponsorship/SponsorshipReport";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy } from "@/lib/locale";

const COPY = defineCopy("routes/sponsorships.report", {
  ar: { pageTitle: "تقرير الكفالة" },
  en: { pageTitle: "Sponsorship report" },
});

export const Route = createFileRoute("/_authenticated/sponsorships/$sponsorshipId/report")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).pageTitle, false, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: ReportPage,
});

/** تقرير الكفالة السنوي: الشاشة المشتركة `SponsorshipReport` على سجلّ الكفالة من الخادم. */
function ReportPage() {
  const { sponsorshipId } = Route.useParams();
  return (
    <main id="main" tabIndex={-1}>
      <SponsorshipReport sponsorshipId={sponsorshipId} />
    </main>
  );
}
