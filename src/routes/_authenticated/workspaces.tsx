import { createFileRoute } from "@tanstack/react-router";

import { DashboardShell } from "@/components/DashboardShell";
import { WorkspacesBoard } from "@/components/workspaces/WorkspacesBoard";
import { brandFor, pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";

// The head's copy lives here, not in the board: importing the board into the route's head would
// pull it and its server functions into every page's bundle.
const HEAD = defineCopy("routes/workspaces", {
  ar: {
    title: "بواباتي",
    lead: "كل دورٍ لك في المنصّة بابٌ مستقل. ترى هنا ما يحقّ لك وحده.",
    description: (name: string) => `كل أدوارك في ${name} في مكانٍ واحد.`,
  },
  en: {
    title: "My workspaces",
    lead: "Each role you hold on the platform is its own door. Here you see only what is yours.",
    description: (name: string) => `All your roles on ${name} in one place.`,
  },
});

export const Route = createFileRoute("/_authenticated/workspaces")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const c = copyOf(HEAD, l);
    return {
      meta: [
        { title: pageTitle(c.title, false, l) },
        { name: "description", content: c.description(brandFor(l).name) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: WorkspacesPage,
});

function WorkspacesPage() {
  const c = useCopy(HEAD);
  return (
    <DashboardShell title={c.title} description={c.lead}>
      <WorkspacesBoard />
    </DashboardShell>
  );
}
