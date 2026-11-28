import { createFileRoute, redirect } from "@tanstack/react-router";

import { DashboardShell } from "@/components/DashboardShell";
import { GuardianBoard, GUARDIAN_COPY } from "@/components/guardian/GuardianBoard";
import { ImpactPanel } from "@/components/impact/ImpactPanel";
import { OrgInbox } from "@/components/org/OrgInbox";
import { brandFor, pageTitle } from "@/config/brand";
import { copyOf } from "@/lib/locale";

export const Route = createFileRoute("/_authenticated/guardian")({
  /* أولياء الأمور وحدهم: راحة لا حماية، والحارس الحقيقي في القاعدة. */
  beforeLoad: ({ context }) => {
    if (!context.roles.includes("guardian")) throw redirect({ to: "/dashboard" });
  },
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(GUARDIAN_COPY, l).title, true, l) },
        { name: "description", content: brandFor(l).description },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: GuardianPage,
});

function GuardianPage() {
  return (
    <GuardianBoard
      shell={({ title, description, children }) => (
        <DashboardShell title={title} description={description}>
          {children}
          <div className="mt-8">
            <OrgInbox />
          </div>
        </DashboardShell>
      )}
      extras={(o) => <ImpactPanel orphanId={o.id} orphanName={o.display_name} />}
    />
  );
}
