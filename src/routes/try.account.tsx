import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AccountBoard } from "@/components/account/AccountBoard";
import { TryMfaSample } from "@/components/try/TryMfaSample";
import { TryRoleHeader } from "@/components/try/TryRoleHeader";
import { pageTitle } from "@/config/brand";
import { useDemo } from "@/lib/demo-mode";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
import { registerAccountDemos, tryAccountUser } from "@/lib/try-account";

const COPY = defineCopy("routes/try.account", {
  ar: {
    pageTitle: "حسابي: عرض تفاعلي",
    role: "صاحب حساب",
    real: "يرى كلّ صاحب حسابٍ بياناته وحده، ويُدار الدخول والبصمة في خادم المصادقة",
    sample: "حساب نموذجي",
    simulated:
      "هذا حسابٌ نموذجي. تعديل الاسم والبصمات يبقى في هذه الصفحة، وتسجيل الخروج يعيدك إلى بداية العرض.",
  },
  en: {
    pageTitle: "My account: interactive demo",
    role: "Account holder",
    real: "each account holder sees only their own details, and sign-in and passkeys are managed by the auth server",
    sample: "Sample account",
    simulated:
      "This is a sample account. Name and passkey edits stay on this page, and signing out takes you back to the start of the demo.",
  },
});

export const Route = createFileRoute("/try/account")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).pageTitle, true, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: TryAccount,
});

function TryAccount() {
  // النسخ التجريبية تُسجَّل صراحةً قبل الرسم (sideEffects: false).
  const locale = useLocale();
  useState(() => registerAccountDemos(locale));
  const t = useCopy(COPY);
  const navigate = useNavigate();
  const demo = useDemo();
  if (!demo)
    return <div aria-hidden="true" className="h-64 animate-pulse rounded-2xl bg-secondary" />;
  return (
    <AccountBoard
      user={tryAccountUser(locale)}
      mfa={<TryMfaSample />}
      links={{
        sponsorships: "/try/journey",
        workspaces: "/try/workspaces",
        notifications: "/try/settings/notifications",
      }}
      onSignOut={async () => {
        await navigate({ to: "/try" });
      }}
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
