import { lazy, Suspense, useState, type ReactNode } from "react";

import { SupporterAssistant } from "@/components/SupporterAssistant";
import type { AskTopic } from "@/components/ask/TopicCombobox";
import { Link } from "@tanstack/react-router";
import { useDemo } from "@/lib/demo-mode";
import { defineCopy, useCopy } from "@/lib/locale";
import { TRIAL_ENABLED, trialRoute } from "@/lib/trial-gate";

// The searchable list loads with its own chunk, after the page: the assistant shows first.
const TopicCombobox = lazy(() => import("@/components/ask/TopicCombobox"));

export const ASK_COPY = defineCopy("components/ask/AskView", {
  ar: {
    eyebrow: "اسأل باطمئنان",
    title: "مساعد الداعمين",
    topic: "موضوع السؤال",
    topicHint: "خطوات الكفالة عامّة، أو ملفٌّ منشور برمزه واسمه المنشور فقط.",
    listFailed: "تعذّر تحميل قائمة الملفات. يمكنك السؤال عن خطوات الكفالة.",
    noFiles: "لا ملفّات منشورة الآن. يمكنك السؤال عن خطوات الكفالة.",
    trial: "جرّب المساعد بإجاباتٍ نموذجية بلا حساب",
  },
  en: {
    eyebrow: "Ask with confidence",
    title: "Supporter assistant",
    topic: "Question topic",
    topicHint:
      "General sponsorship steps, or one published file by its code and published name only.",
    listFailed: "We couldn't load the list of files. You can still ask about sponsorship steps.",
    noFiles: "No files are published right now. You can still ask about sponsorship steps.",
    trial: "Try the assistant with sample answers, no account needed",
  },
});

/** The supporter assistant page body: a topic picker beside the conversation. */
export function AskView({
  topics,
  initial,
  failed,
  badge,
}: {
  topics: AskTopic[];
  initial?: string | undefined;
  failed?: boolean;
  /** a chip under the title (the trial's sample chip) */
  badge?: ReactNode;
}) {
  const c = useCopy(ASK_COPY);
  const demo = useDemo();
  const [selected, setSelected] = useState(initial ?? "general");
  return (
    <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-14">
      <aside className="min-w-0">
        <p className="mb-3 text-sm font-medium text-primary">{c.eyebrow}</p>
        <h1 className="text-3xl leading-relaxed font-semibold">{c.title}</h1>
        {badge}
        <label htmlFor="assistant-file" className="mt-6 mb-2 block text-sm font-medium">
          {c.topic}
        </label>
        <Suspense
          fallback={
            <div aria-hidden="true" className="h-11 animate-pulse rounded-md bg-secondary" />
          }
        >
          <TopicCombobox
            id="assistant-file"
            value={selected}
            onChange={setSelected}
            topics={topics}
            extra={initial}
          />
        </Suspense>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">{c.topicHint}</p>
        {failed ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {c.listFailed}
          </p>
        ) : (
          topics.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{c.noFiles}</p>
        )}
        {TRIAL_ENABLED && !demo && (
          <Link
            to={trialRoute("/try/ask")}
            className="mt-4 inline-flex min-h-11 items-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {c.trial}
          </Link>
        )}
      </aside>
      <div className="min-w-0">
        <SupporterAssistant {...(selected !== "general" ? { orphanId: selected } : {})} />
      </div>
    </div>
  );
}
