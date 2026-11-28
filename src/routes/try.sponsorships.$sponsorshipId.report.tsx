import { createFileRoute } from "@tanstack/react-router";

import { SponsorshipReport } from "@/components/sponsorship/SponsorshipReport";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy } from "@/lib/locale";

/**
 * «تقرير الكفالة» في التجربة: الشاشة الحقيقية نفسها على سجلّ الجلسة النموذجي
 * (`sponsor.ledger` من `try-sponsor-center`)، بعلامة «بيانات نموذجية» وعلامةٍ مائية.
 */
export const Route = createFileRoute("/try/sponsorships/$sponsorshipId/report")({
  // صريحٌ لا استيرادٌ مجرّد: الحزمة معلنة بلا آثار جانبية.
  loader: () =>
    import("@/lib/try-sponsor-center").then((m) => {
      m.registerSponsorCenterDemos();
      return null;
    }),
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).pageTitle, false, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: TryReportPage,
});

const COPY = defineCopy("routes/try.sponsorships.report", {
  ar: { pageTitle: "تقرير الكفالة · جرّب المنصّة" },
  en: { pageTitle: "Sponsorship report · Try the platform" },
});

function TryReportPage() {
  const { sponsorshipId } = Route.useParams();
  return <SponsorshipReport sponsorshipId={sponsorshipId} />;
}
