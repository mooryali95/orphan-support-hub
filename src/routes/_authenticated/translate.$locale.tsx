import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { DashboardShell } from "@/components/DashboardShell";
import { TRANSLATE_COPY, TranslateBoard } from "@/components/translate/TranslateBoard";
import { pageTitle } from "@/config/brand";
import { supabase } from "@/integrations/supabase/client";
import { copyOf } from "@/lib/locale";

export const Route = createFileRoute("/_authenticated/translate/$locale")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(TRANSLATE_COPY, l).pageTitle, false, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: ReviewPage,
});

/**
 * مراجعة الترجمة: لمراجع اللغة من مكتب الدولة، وللإدارة. الشاشة في `TranslateBoard`،
 * وتشاركها نسختها التجريبية.
 */
function ReviewPage() {
  const { locale } = Route.useParams();
  const { roles } = Route.useRouteContext();
  const isAdmin = roles.includes("admin");
  // النشر للإدارة بجلسة aal2 (is_admin في القاعدة يرفض aal1 لمن فعّل عاملاً ثانياً).
  // هنا نعرف ذلك قبل الضغط، فيُعطَّل الزرّ بسببٍ مقروء ورابطٍ إلى التحقّق بدل خطأٍ بعد النداء.
  const [needsStepUp, setNeedsStepUp] = useState(false);
  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (live && data) setNeedsStepUp(data.currentLevel !== "aal2" && data.nextLevel === "aal2");
    });
    return () => {
      live = false;
    };
  }, [isAdmin]);
  return (
    <TranslateBoard
      locale={locale}
      isAdmin={isAdmin}
      needsStepUp={needsStepUp}
      links={{ admin: "/admin", workspaces: "/workspaces" }}
      shell={({ title, description, children }) => (
        <DashboardShell title={title} description={description}>
          {children}
        </DashboardShell>
      )}
    />
  );
}
