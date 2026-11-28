import { createFileRoute } from "@tanstack/react-router";

import { DashboardShell } from "@/components/DashboardShell";
import {
  NOTIFICATION_PREFS_COPY,
  NotificationPrefsBoard,
} from "@/components/account/NotificationPrefsBoard";
import { pageTitle } from "@/config/brand";
import { copyOf } from "@/lib/locale";

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(NOTIFICATION_PREFS_COPY, l).title, false, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: NotificationSettingsPage,
});

function NotificationSettingsPage() {
  return (
    <NotificationPrefsBoard
      shell={({ title, description, children }) => (
        <DashboardShell title={title} description={description}>
          {children}
        </DashboardShell>
      )}
    />
  );
}
