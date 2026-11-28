import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { TranslateBoard } from "@/components/translate/TranslateBoard";
import { TryRoleHeader } from "@/components/try/TryRoleHeader";
import { pageTitle } from "@/config/brand";
import { useDemo } from "@/lib/demo-mode";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";
import { registerTranslateDemos } from "@/lib/try-translate";

const COPY = defineCopy("routes/try.translate", {
  ar: {
    pageTitle: "مراجعة الترجمة: عرض تفاعلي",
    role: "مراجع لغة",
    real: "يعيّن مكتبُ الدولة مراجعَ كل لغة، ولا يُنشر نصٌّ إلا بعد أن يراجعه شخصٌ غير من حرّره",
    sample: "نصوص نموذجية",
    simulated:
      "هذه عيّنةٌ من نصوص الواجهة. الحفظ والمراجعة والنشر تبقى في هذه الصفحة ولا تغيّر الموقع. النصوص التي حرّرتها أنت لا تستطيع مراجعتها: جرّب لترى.",
  },
  en: {
    pageTitle: "Translation review: interactive demo",
    role: "Language reviewer",
    real: "the country office assigns each language's reviewer, and no string is published until someone other than its editor reviews it",
    sample: "Sample strings",
    simulated:
      "This is a sample of interface strings. Saving, reviewing and publishing stay on this page and do not change the site. You cannot review strings you edited yourself: try it to see.",
  },
});

export const Route = createFileRoute("/try/translate/$locale")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).pageTitle, true, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: TryTranslate,
});

function TryTranslate() {
  const { locale } = Route.useParams();
  // النسخ التجريبية تُسجَّل صراحةً قبل الرسم (sideEffects: false).
  useState(() => registerTranslateDemos());
  const t = useCopy(COPY);
  const demo = useDemo();
  if (!demo)
    return <div aria-hidden="true" className="h-64 animate-pulse rounded-2xl bg-secondary" />;
  return (
    <TranslateBoard
      locale={locale}
      isAdmin
      needsStepUp={false}
      canPreview={false}
      links={{ admin: "/try/admin", workspaces: "/try/workspaces" }}
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
