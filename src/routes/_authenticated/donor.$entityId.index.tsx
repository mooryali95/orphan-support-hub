import { createFileRoute } from "@tanstack/react-router";

import { DashboardShell } from "@/components/DashboardShell";
import { DONOR_COPY, DonorBoard } from "@/components/donor/DonorBoard";
import { pageTitle } from "@/config/brand";
import { copyOf } from "@/lib/locale";

export const Route = createFileRoute("/_authenticated/donor/$entityId/")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(DONOR_COPY, l).title, false, l) },
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
