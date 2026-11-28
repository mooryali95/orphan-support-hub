import { createFileRoute } from "@tanstack/react-router";

import { TryRoleHeader } from "@/components/try/TryRoleHeader";
import { WorkspacesBoard } from "@/components/workspaces/WorkspacesBoard";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";
import { TRY_DONOR_ID } from "@/lib/try-workspaces";

const COPY = defineCopy("routes/try.workspaces", {
  ar: {
    pageTitle: "بواباتي: عرض تفاعلي",
    role: "حسابٌ بعدّة أدوار",
    title: "بواباتي",
    lead: "حسابٌ نموذجي يحمل أدواراً عدّة، كلّ دورٍ ببطاقته وحاله وخطوته التالية. افتح أيّ بابٍ لترى شاشته ببياناتٍ نموذجية.",
    real: "يرى كلّ حسابٍ أدواره هو وحده، وتمنح الإدارة كلّ دورٍ بعد مراجعة",
  },
  en: {
    pageTitle: "My workspaces: interactive demo",
    role: "An account with several roles",
    title: "My workspaces",
    lead: "A sample account holding several roles, each with its card, status and next step. Open any door to see its screen with sample data.",
    real: "each account sees only its own roles, and the admin team grants each role after review",
  },
});

export const Route = createFileRoute("/try/workspaces")({
  // نسخ «بواباتي» التجريبية تُسجَّل صراحةً قبل الرسم (sideEffects: false).
  beforeLoad: () => import("@/lib/try-workspaces").then((m) => m.registerWorkspacesDemos()),
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).pageTitle, true, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: TryWorkspaces,
});

function TryWorkspaces() {
  const t = useCopy(COPY);
  return (
    <div>
      <TryRoleHeader role={t.role} title={t.title} lead={t.lead} real={t.real} />
      <div className="mt-8">
        <WorkspacesBoard
          links={{
            dashboard: "/try/journey",
            org: "/try/office",
            country: "/try/country",
            supervisor: "/try/supervisor",
            admin: "/try/admin",
            office: () => "/try/office",
            donor: () => `/try/donor/${TRY_DONOR_ID}`,
          }}
        />
      </div>
    </div>
  );
}
