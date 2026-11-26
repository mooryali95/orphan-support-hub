import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { pageTitle } from "@/config/brand";
import { supabase } from "@/integrations/supabase/client";
import { defineCopy, useCopy } from "@/lib/locale";
import { safeNext } from "@/lib/sso/launch-token";

const COPY = defineCopy("routes/sso", {
  ar: {
    title: "الدخول من منصّة الندوة",
    working: "نُكمل دخولك من منصّة الندوة…",
    failed: "تعذّر إكمال الدخول من منصّة الندوة.",
    retry: "عد إلى منصّة الندوة وافتح الرابط من جديد، أو سجّل الدخول هنا مباشرة.",
    signIn: "تسجيل الدخول",
    reasons: {
      expired: "انتهت صلاحية الرابط. الرابط يعمل دقيقتين فقط.",
      token_used: "استُعمل هذا الرابط من قبل. كل رابطٍ يعمل مرّةً واحدة.",
      email_unverified: "بريدك غير موثَّق في منصّة الندوة.",
      subject_taken: "هذا البريد مربوطٌ بحسابٍ آخر من منصّة الندوة. تواصل مع الإدارة.",
      not_configured: "الدخول من منصّة الندوة لم يُفعَّل بعد.",
    } as Record<string, string>,
  },
  en: {
    title: "Sign in from WAMY",
    working: "Completing your sign-in from WAMY's platform…",
    failed: "We couldn't complete your sign-in from WAMY's platform.",
    retry: "Go back to WAMY's platform and open the link again, or sign in here directly.",
    signIn: "Sign in",
    reasons: {
      expired: "The link expired. It works for two minutes only.",
      token_used: "This link was already used. Each link works once.",
      email_unverified: "Your email isn't verified on WAMY's platform.",
      subject_taken: "This email is linked to another WAMY account. Contact the admin team.",
      not_configured: "Sign-in from WAMY's platform isn't enabled yet.",
    } as Record<string, string>,
  },
});

export const Route = createFileRoute("/sso")({
  head: () => ({
    meta: [
      { title: pageTitle("الدخول من منصّة الندوة", false) },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SsoPage,
});

/**
 * يُكمل الدخول القادم من `/api/sso/wamy`: الرمز في جزء الرابط (#) لا يبلغ الخادم،
 * ويُمسح من الشريط فور قراءته، ثم يُنقل المستخدم إلى صفحته.
 */
function SsoPage() {
  const c = useCopy(COPY);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, "", window.location.pathname);
    const err = params.get("error");
    const th = params.get("th");
    if (err || !th) {
      setError(err ?? "missing");
      return;
    }
    void supabase.auth.verifyOtp({ token_hash: th, type: "email" }).then(({ error: e }) => {
      if (e) return setError("session_failed");
      void navigate({ to: safeNext(params.get("next")) as "/workspaces", replace: true });
    });
  }, [navigate]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-bold text-balance">{c.title}</h1>
      {error ? (
        <>
          <p role="alert" className="text-sm leading-7">
            {c.reasons[error] ?? c.failed}
          </p>
          <p className="text-sm leading-7 text-muted-foreground">{c.retry}</p>
          <Button asChild className="min-h-11">
            <a href="/auth">{c.signIn}</a>
          </Button>
        </>
      ) : (
        <p role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {c.working}
        </p>
      )}
    </main>
  );
}
