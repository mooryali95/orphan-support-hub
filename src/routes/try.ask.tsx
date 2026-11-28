import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AskView } from "@/components/ask/AskView";
import { pageTitle } from "@/config/brand";
import { useDemo } from "@/lib/demo-mode";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
import { registerAskDemos } from "@/lib/try-ask";
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
  // الإجابات الجاهزة تُسجَّل صراحةً في المتصفّح قبل الرسم (sideEffects: false).
  useState(registerAskDemos);
  // the trial session starts in the shell's effect, after this screen mounts: until it does,
  // nothing is fetched, so no call ever reaches the real server from the trial.
  const t = useCopy(COPY);
  const locale = useLocale();
  const demo = useDemo();
  if (!demo)
    return <div aria-hidden="true" className="h-64 animate-pulse rounded-2xl bg-secondary" />;
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
