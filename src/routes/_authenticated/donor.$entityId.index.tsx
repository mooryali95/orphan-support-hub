import { createFileRoute } from "@tanstack/react-router";

import { DashboardShell } from "@/components/DashboardShell";
import { DonorBoard } from "@/components/donor/DonorBoard";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy } from "@/lib/locale";

// Kept here, not imported from the board, so the route head stays out of the shared bundle.
const HEAD = defineCopy("routes/donor", {
  ar: { title: "الجهة المانحة" },
  en: { title: "Donor entity" },
});

export const Route = createFileRoute("/_authenticated/donor/$entityId/")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(HEAD, l).title, false, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: DonorPage,
});

function DonorPage() {
  const { entityId } = Route.useParams();
  return (
    <DonorBoard
      entityId={entityId}
      reportHref={`/donor/${entityId}/report`}
      shell={({ title, description, children }) => (
        <DashboardShell title={title} {...(description ? { description } : {})}>
          {children}
        </DashboardShell>
      )}
    />
  );
}
