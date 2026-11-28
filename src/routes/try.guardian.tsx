import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { GuardianBoard } from "@/components/guardian/GuardianBoard";
import { TryRoleHeader } from "@/components/try/TryRoleHeader";
import { pageTitle } from "@/config/brand";
import { useDemo } from "@/lib/demo-mode";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
import { registerGuardianDemos } from "@/lib/try-guardian";

const COPY = defineCopy("routes/try.guardian", {
  ar: {
    pageTitle: "مساحة ولي الأمر: عرض تفاعلي",
    role: "ولي أمر",
    real: "يرى الوليّ من ربطته الإدارة بحسابه بعد التحقّق من الوصاية، ولا يرى من يكفلهم",
    sample: "بطاقات خيالية",
    simulated: "الأطفال هنا خياليون، والموافقات تُحفظ في هذه الصفحة وحدها ولا تصل إلى أحد.",
  },
  en: {
    pageTitle: "Guardian space: interactive demo",
    role: "Guardian",
    real: "a guardian sees only children the admin team linked after verifying guardianship, and never who sponsors them",
    sample: "Fictional cards",
    simulated:
      "The children here are fictional, and consents are kept on this page only and reach no one.",
  },
});

export const Route = createFileRoute("/try/guardian")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).pageTitle, true, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: TryGuardian,
});

function TryGuardian() {
  // النسخ التجريبية تُسجَّل صراحةً قبل الرسم (sideEffects: false).
  const locale = useLocale();
  useState(() => registerGuardianDemos(locale));
  const t = useCopy(COPY);
  const demo = useDemo();
  if (!demo)
    return <div aria-hidden="true" className="h-64 animate-pulse rounded-2xl bg-secondary" />;
  return (
    <GuardianBoard
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
