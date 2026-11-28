import { createFileRoute } from "@tanstack/react-router";

import { DashboardShell } from "@/components/DashboardShell";
import { NotificationPrefsBoard } from "@/components/account/NotificationPrefsBoard";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy } from "@/lib/locale";

// عنوان الصفحة وحده هنا: نسخة الشاشة كلّها تبقى في قطعتها ولا تدخل الحزمة الأولى.
const HEAD = defineCopy("routes/settings.notifications.head", {
  ar: { title: "تفضيلات الإشعارات" },
  en: { title: "Notification preferences" },
});

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(HEAD, l).title, false, l) },
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
