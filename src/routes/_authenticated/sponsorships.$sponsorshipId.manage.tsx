import { createFileRoute } from "@tanstack/react-router";

import { DashboardShell } from "@/components/DashboardShell";
import { ManageSponsorship } from "@/components/sponsorship/ManageSponsorship";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/_authenticated/sponsorships/$sponsorshipId/manage")({
  head: () => ({
    meta: [{ title: pageTitle("إدارة الكفالة", false) }, { name: "robots", content: "noindex" }],
  }),
  component: ManagePage,
});

function ManagePage() {
  const { sponsorshipId } = Route.useParams();
  return (
    <DashboardShell
      title="إدارة الكفالة"
      description="إيقافٌ مؤقّت، أو استئناف، أو مبلغٌ جديد، أو إنهاء — بتأكيدٍ واضحٍ لكلّ خطوة."
    >
      <ManageSponsorship sponsorshipId={sponsorshipId} />
    </DashboardShell>
  );
}
