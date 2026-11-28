import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { DashboardShell } from "@/components/DashboardShell";
import { ACCOUNT_COPY, AccountBoard } from "@/components/account/AccountBoard";
import { MfaSettings } from "@/components/account/MfaSettings";
import { pageTitle } from "@/config/brand";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { wipeBrowserUserData } from "@/lib/client-state";
import { copyOf } from "@/lib/locale";

export const Route = createFileRoute("/_authenticated/account")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(ACCOUNT_COPY, l).title, false, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: AccountPage,
});

/** حسابي: الشاشة في `AccountBoard`، وتشاركها نسختها التجريبية. */
function AccountPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <AccountBoard
      user={
        user
          ? {
              id: user.id,
              email: user.email,
              phone: user.phone,
              created_at: user.created_at,
              full_name: String(user.user_metadata?.["full_name"] ?? ""),
              google: !!user.identities?.some((i) => i.provider === "google"),
            }
          : null
      }
      mfa={<MfaSettings />}
      links={{
        sponsorships: "/dashboard",
        workspaces: "/workspaces",
        notifications: "/settings/notifications",
      }}
      onSignOut={async () => {
        // يُمحى ما في المتصفّح قبل الخروج نفسه: الجهاز قد يكون مشتركاً (UX-05).
        wipeBrowserUserData();
        await supabase.auth.signOut();
        await navigate({ to: "/" });
      }}
      shell={({ title, description, children }) => (
        <DashboardShell title={title} description={description}>
          {children}
        </DashboardShell>
      )}
    />
  );
}
