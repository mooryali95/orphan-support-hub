import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { NotificationPrefsBoard } from "@/components/account/NotificationPrefsBoard";
import { TryRoleHeader } from "@/components/try/TryRoleHeader";
import { pageTitle } from "@/config/brand";
import { useDemo } from "@/lib/demo-mode";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
import { registerAccountDemos } from "@/lib/try-account";

const COPY = defineCopy("routes/try.settings.notifications", {
  ar: {
    pageTitle: "تفضيلات الإشعارات: عرض تفاعلي",
    role: "صاحب حساب",
    real: "يقرّر كلّ صاحب حسابٍ ما يصل بريده، وتفرض القاعدة ذلك عند كل إرسال",
    sample: "تفضيلات نموذجية",
    simulated: "التفضيلات هنا تُحفظ في هذه الصفحة وحدها، ولا يُرسل بريدٌ إلى أحد.",
  },
  en: {
    pageTitle: "Notification preferences: interactive demo",
    role: "Account holder",
    real: "each account holder decides what reaches their inbox, and the database enforces it on every send",
    sample: "Sample preferences",
    simulated: "Preferences here are kept on this page only, and no email is sent to anyone.",
  },
});

export const Route = createFileRoute("/try/settings/notifications")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).pageTitle, true, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: TryNotificationPrefs,
});

function TryNotificationPrefs() {
  // النسخ التجريبية تُسجَّل صراحةً قبل الرسم (sideEffects: false).
  const locale = useLocale();
  useState(() => registerAccountDemos(locale));
  const t = useCopy(COPY);
  const demo = useDemo();
  if (!demo)
    return <div aria-hidden="true" className="h-64 animate-pulse rounded-2xl bg-secondary" />;
  return (
    <NotificationPrefsBoard
      shell={({ title, description, children }) => (
        <div>
          <TryRoleHeader role={t.role} title={title} lead={description} real={t.real}>
            <span className="inline-flex items-center rounded-full bg-bridge-bright/15 px-3 py-1 text-xs font-semibold text-bridge-ink">
              {t.sample}
            </span>
          </TryRoleHeader>
          <p className="mt-4 text-sm text-muted-foreground">{t.simulated}</p>
          <div className="mt-6">{children}</div>
        </div>
      )}
    />
  );
}
