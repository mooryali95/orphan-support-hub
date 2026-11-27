import { createFileRoute } from "@tanstack/react-router";

import { DashboardShell } from "@/components/DashboardShell";
import { SponsorshipChildPage } from "@/components/sponsorship/SponsorshipChildPage";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("routes/_authenticated/sponsorships.index", {
  ar: { title: "كفالتي" },
  en: { title: "My sponsorship" },
});

export const Route = createFileRoute("/_authenticated/sponsorships/$sponsorshipId/")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).title, false, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: SponsorshipPage,
});

/** صفحة الطفل للكافل: المكوّن نفسه تعرضه التجربة على كفالات الجلسة (`/try/sponsorships/…`). */
function SponsorshipPage() {
  const { sponsorshipId } = Route.useParams();
  const c = useCopy(COPY);
  return (
    <DashboardShell title={c.title}>
      <SponsorshipChildPage sponsorshipId={sponsorshipId} />
    </DashboardShell>
  );
}
