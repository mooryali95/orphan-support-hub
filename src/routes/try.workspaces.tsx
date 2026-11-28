import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { TryRoleHeader } from "@/components/try/TryRoleHeader";
import { WorkspacesBoard } from "@/components/workspaces/WorkspacesBoard";
import { pageTitle } from "@/config/brand";
import { useDemo } from "@/lib/demo-mode";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
import { registerWorkspacesDemos, TRY_DONOR_ID } from "@/lib/try-workspaces";

const COPY = defineCopy("routes/try.workspaces", {
  ar: {
    pageTitle: "بواباتي: عرض تفاعلي",
    role: "حسابٌ بعدّة أدوار",
    title: "بواباتي",
    lead: "حسابٌ نموذجي يحمل أدواراً عدّة، كلّ دورٍ ببطاقته وحاله وخطوته التالية. افتح أيّ بابٍ لترى شاشته ببياناتٍ نموذجية.",
    real: "يرى كلّ حسابٍ أدواره هو وحده، وتمنح الإدارة كلّ دورٍ بعد مراجعة",
    account: "حسابي",
    notifications: "تفضيلات الإشعارات",
  },
  en: {
    pageTitle: "My workspaces: interactive demo",
    role: "An account with several roles",
    title: "My workspaces",
    lead: "A sample account holding several roles, each with its card, status and next step. Open any door to see its screen with sample data.",
    real: "each account sees only its own roles, and the admin team grants each role after review",
    account: "My account",
    notifications: "Notification preferences",
  },
});

export const Route = createFileRoute("/try/workspaces")({
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
  // نسخ «بواباتي» التجريبية تُسجَّل صراحةً في المتصفّح قبل أن تُرسم اللوحة (sideEffects: false).
  const locale = useLocale();
  useState(() => registerWorkspacesDemos(locale));
  // the trial session starts in the shell's effect, after this screen mounts: until it does,
  // nothing is fetched, so no call ever reaches the real server from the trial.
  const t = useCopy(COPY);
  const demo = useDemo();
  if (!demo)
    return <div aria-hidden="true" className="h-64 animate-pulse rounded-2xl bg-secondary" />;
  return (
    <div>
      <TryRoleHeader role={t.role} title={t.title} lead={t.lead} real={t.real} />
      <nav className="mt-4 flex flex-wrap gap-4 text-sm" aria-label={t.account}>
        <Link
          to="/try/account"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          {t.account}
        </Link>
        <Link
          to="/try/settings/notifications"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          {t.notifications}
        </Link>
      </nav>
      <div className="mt-8">
        <WorkspacesBoard
          links={{
            dashboard: "/try/journey",
            org: "/try/org",
            guardian: "/try/guardian",
            country: "/try/country",
            supervisor: "/try/supervisor",
            admin: "/try/admin",
            office: () => "/try/office",
            donor: () => `/try/donor/${TRY_DONOR_ID}`,
            translate: (code) => `/try/translate/${code}`,
          }}
        />
      </div>
    </div>
  );
}
