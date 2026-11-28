import { createFileRoute } from "@tanstack/react-router";

import { AskView } from "@/components/ask/AskView";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
import { localTryChild, TRY_CHILDREN } from "@/lib/try-demo";

const COPY = defineCopy("routes/try.ask", {
  ar: {
    pageTitle: "مساعد الداعمين: عرض تفاعلي",
    sample: "إجابات نموذجية",
    simulated: "الإجابات هنا محاكاة جاهزة، ولا يُرسل سؤالك إلى أيّ خدمة.",
  },
  en: {
    pageTitle: "Supporter assistant: interactive demo",
    sample: "Sample answers",
    simulated: "Answers here are simulated in advance, and your question is sent to no service.",
  },
});

export const Route = createFileRoute("/try/ask")({
  // الإجابات الجاهزة تُسجَّل صراحةً قبل الرسم (sideEffects: false).
  beforeLoad: () => import("@/lib/try-ask").then((m) => m.registerAskDemos()),
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).pageTitle, true, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: TryAsk,
});

function TryAsk() {
  const t = useCopy(COPY);
  const locale = useLocale();
  // The fictional children's public cards, cut to the same two fields as the real picker.
  const topics = TRY_CHILDREN.map((child) => {
    const k = localTryChild(child, locale);
    return { id: k.id, code: k.code, name: k.name };
  });
  return (
    <AskView
      topics={topics}
      badge={
        <div className="mt-2 flex flex-col items-start gap-2">
          <span className="inline-flex items-center rounded-full bg-bridge-bright/15 px-3 py-1 text-xs font-semibold text-bridge-ink">
            {t.sample}
          </span>
          <p className="text-xs leading-6 text-muted-foreground">{t.simulated}</p>
        </div>
      }
    />
  );
}
