import { createFileRoute } from "@tanstack/react-router";

import { DashboardShell } from "@/components/DashboardShell";
import { WORKSPACES_COPY, WorkspacesBoard } from "@/components/workspaces/WorkspacesBoard";
import { brandFor, pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";

const HEAD = defineCopy("routes/workspaces", {
  ar: { description: (name: string) => `كل أدوارك في ${name} في مكانٍ واحد.` },
  en: { description: (name: string) => `All your roles on ${name} in one place.` },
});

export const Route = createFileRoute("/_authenticated/workspaces")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(WORKSPACES_COPY, l).title, false, l) },
        { name: "description", content: copyOf(HEAD, l).description(brandFor(l).name) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: WorkspacesPage,
});

function WorkspacesPage() {
  const c = useCopy(WORKSPACES_COPY);
  return (
    <DashboardShell title={c.title} description={c.lead}>
      <WorkspacesBoard />
    </DashboardShell>
  );
}
