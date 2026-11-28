import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { Link } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type ChatTransport, type UIMessage, type UIMessageChunk } from "ai";
import { ArrowUp, Copy, FileText, ShieldCheck, Square, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { AuthDialog } from "@/components/auth/AuthDialog";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageAction,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useDataFn } from "@/lib/data-port";
import { useDemo } from "@/lib/demo-mode";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";

const COPY = defineCopy("components/SupporterAssistant", {
  ar: {
    suggestions: ["كيف أبدأ الكفالة؟", "هل يمكنني إيقاف الكفالة؟", "كيف تُحمى معلومات الطفل؟"],
    unreachable: "تعذّر الوصول إلى مساعد الأسئلة. حاول لاحقاً.",
    noAnswer: "لم تتوفر إجابة لهذا السؤال. لم يُسجّل أي طلب كفالة.",
    limit: "وصلت المحادثة إلى حدّها. ابدأ محادثة جديدة.",
    conversation: "محادثة مساعد الداعمين",
    publishedOnly: "المعلومات المنشورة فقط",
    newChat: "محادثة جديدة",
    log: "الأسئلة والإجابات",
    emptyTitle: "ما الذي تودّ معرفته؟",
    emptyText:
      "اختر سؤالاً شائعاً أو اكتب سؤالك. الإجابة من الملفّات المنشورة وشروط الكفالة وحدها.",
    reviewing: "مراجعة المعلومات",
    copyAnswer: "نسخ الإجابة",
    copied: "نُسخت الإجابة.",
    copyFailed: "تعذّر نسخ الإجابة.",
    waiting: "جارٍ مراجعة المعلومات المنشورة…",
    latest: "آخر إجابة",
    stopped: "تم إيقاف الإجابة، وبقي الجزء المكتوب.",
    yourQuestion: "سؤالك",
    placeholderFile: "اسأل عن المعلومات المنشورة لهذا الملفّ…",
    placeholder: "اكتب سؤالك عن الكفالة…",
    noPersonal: "لا تكتب بيانات شخصية أو معلومات دفع",
    stop: "إيقاف الإجابة",
    send: "إرسال السؤال",
    signIn: "سجّل الدخول لطرح سؤالك",
    disclaimer:
      "إجابات آلية قد تخطئ، والمرجع هو الملفّ المنشور وشروط الكفالة. المحادثة لهذه الجلسة فقط ولا تُحفظ في حسابك.",
    sampleDisclaimer:
      "إجابات العرض جاهزة مسبقاً من نصوص المنصّة المنشورة، ولا يُرسل سؤالك إلى أيّ خدمة.",
    steps: "خطوات الكفالة",
    file: "الملفّ المنشور",
  },
  en: {
    suggestions: [
      "How do I start a sponsorship?",
      "Can I pause a sponsorship?",
      "How is a child's information protected?",
    ],
    unreachable: "We couldn't reach the question assistant. Try again later.",
    noAnswer: "No answer was available for this question. No sponsorship request was recorded.",
    limit: "This conversation reached its limit. Start a new one.",
    conversation: "Supporter assistant conversation",
    publishedOnly: "Published information only",
    newChat: "New conversation",
    log: "Questions and answers",
    emptyTitle: "What would you like to know?",
    emptyText:
      "Pick a common question or write your own. Answers come only from published files and the sponsorship terms.",
    reviewing: "Reviewing the information",
    copyAnswer: "Copy answer",
    copied: "Answer copied.",
    copyFailed: "Couldn't copy the answer.",
    waiting: "Reviewing the published information…",
    latest: "Latest answer",
    stopped: "The answer was stopped. What was written stays.",
    yourQuestion: "Your question",
    placeholderFile: "Ask about this file's published information…",
    placeholder: "Write your question about sponsorship…",
    noPersonal: "Don't write personal details or payment information",
    stop: "Stop the answer",
    send: "Send question",
    signIn: "Sign in to ask your question",
    disclaimer:
      "Automated answers can be wrong. The published file and sponsorship terms are the reference. This conversation lasts for this session only and isn't saved to your account.",
    sampleDisclaimer:
      "Demo answers are prepared in advance from the platform's published text, and your question is sent to no service.",
    steps: "Sponsorship steps",
    file: "Published file",
  },
});

type ReplyInput = { data: { question: string; locale: string; orphanId?: string } };

/** Outside the trial there is no prepared answer: the port returns null and the gateway answers. */
const noPreparedAnswer = async (_input?: ReplyInput): Promise<string | null> => null;

/**
 * The trial's transport: the answer comes from the prepared replies the trial registers
 * (`assistant.reply`), streamed locally. Nothing reaches `/api` or the AI gateway.
 */
function preparedTransport(
  reply: (input: ReplyInput) => Promise<string | null>,
  orphanId: string | undefined,
  fallback: string,
  locale: string,
): ChatTransport<UIMessage> {
  return {
    async sendMessages({ messages }) {
      const last = messages.at(-1);
      const question = last?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ") ?? "";
      const text =
        (await reply({ data: { question, locale, ...(orphanId ? { orphanId } : {}) } })) ??
        fallback;
      const id = "prepared";
      const chunks: UIMessageChunk[] = [
        { type: "start" },
        { type: "text-start", id },
        { type: "text-delta", id, delta: text },
        { type: "text-end", id },
        { type: "finish" },
      ];
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      });
    },
    reconnectToStream: async () => null,
  };
}

export function SupporterAssistant({ orphanId }: { orphanId?: string }) {
  const { user } = useAuth();
  const demo = useDemo();
  return (
    <AssistantConversation
      key={`${demo ? "demo" : (user?.id ?? "guest")}:${orphanId ?? "general"}`}
      {...(orphanId ? { orphanId } : {})}
      signedIn={demo || Boolean(user)}
      demo={demo}
    />
  );
}
function AssistantConversation({
  orphanId,
  signedIn,
  demo,
}: {
  orphanId?: string;
  signedIn: boolean;
  demo: boolean;
}) {
  const c = useCopy(COPY);
  const locale = useLocale();
  const reply = useDataFn("assistant.reply", noPreparedAnswer);
  const [question, setQuestion] = useState("");
  const [notice, setNotice] = useState("");
  const [stopped, setStopped] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const focus = () => input.current?.focus({ preventScroll: true });
  const transport = useMemo<ChatTransport<UIMessage>>(
    () =>
      demo
        ? preparedTransport(reply, orphanId, c.noAnswer, locale)
        : new DefaultChatTransport({
            api: "/api/public/supporter-assistant",
            body: orphanId ? { orphanId } : {},
            headers: async () => {
              const { data } = await supabase.auth.getSession();
              return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
            },
            fetch: async (url, init) => {
              const response = await fetch(url, init);
              if (!response.ok) {
                let message = c.unreachable;
                try {
                  const body: unknown = await response.json();
                  if (
                    body &&
                    typeof body === "object" &&
                    "error" in body &&
                    typeof body.error === "string"
                  )
                    message = body.error;
                } catch {
                  /* Safe message remains. */
                }
                throw new Error(message);
              }
              return response;
            },
          }),
    [orphanId, demo, reply, c.noAnswer, c.unreachable, locale],
  );
  const { messages, sendMessage, status, error, stop, setMessages, clearError } = useChat({
    transport,
    onFinish: ({ message, isAbort, isError }) => {
      if (
        !isAbort &&
        !isError &&
        !message.parts.some((part) => part.type === "text" && part.text.trim())
      ) {
        setNotice(c.noAnswer);
      }
      focus();
    },
    onError: () => focus(),
  });
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => {
    if (signedIn) focus();
  }, [signedIn]);
  useEffect(() => {
    if (!busy && signedIn) input.current?.focus({ preventScroll: true });
  }, [busy, signedIn]);
  const allowedLinks = new Set([
    "/orphans",
    "/support",
    "/how-it-works",
    "/dashboard",
    ...(orphanId ? [`/orphans/${orphanId}`] : []),
  ]);
  const markdownComponents = {
    a: ({ href, children }: ComponentProps<"a">) =>
      href && allowedLinks.has(href) ? (
        <a href={href} className="text-primary underline">
          {children}
        </a>
      ) : (
        <span>{children}</span>
      ),
    img: () => null,
  };
  async function ask(text: string) {
    if (!signedIn || busy || !text.trim()) return;
    setNotice("");
    setStopped(false);
    clearError();
    if (messages.length >= 20) {
      setNotice(c.limit);
      return;
    }
    setQuestion("");
    focus();
    await sendMessage({ text: text.trim() });
  }
  const last = messages.at(-1);
  const waiting =
    busy &&
    (last?.role !== "assistant" || !last.parts.some((p) => p.type === "text" && p.text.trim()));
  return (
    <section aria-label={c.conversation} className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" /> {c.publishedOnly}
        </div>
        <Button
          variant="ghost"
          size="icon"
          title={c.newChat}
          aria-label={c.newChat}
          className="size-11"
          disabled={busy || messages.length === 0}
          onClick={() => {
            setMessages([]);
            clearError();
            setNotice("");
            setStopped(false);
            focus();
          }}
        >
          <Trash2 />
        </Button>
      </div>
      <Conversation className="h-[min(48dvh,560px)] min-h-64">
        <ConversationContent className="gap-6 px-0 py-6" role="log" aria-label={c.log}>
          {messages.length === 0 && (
            <div className="py-6">
              <h2 className="text-xl font-semibold">{c.emptyTitle}</h2>
              <p className="mt-2 max-w-prose text-sm leading-7 text-muted-foreground">
                {c.emptyText}
              </p>
              <div className="mt-6 flex flex-col items-start gap-2">
                {c.suggestions.map((text) => (
                  <Button
                    key={text}
                    variant="outline"
                    className="h-auto min-h-11 max-w-full whitespace-normal text-start"
                    disabled={!signedIn}
                    onClick={() => ask(text)}
                  >
                    {text}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message) => (
            <Message key={message.id} from={message.role} className="max-w-full">
              <MessageContent
                className={
                  message.role === "user"
                    ? "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground break-words"
                    : "w-full break-words leading-8"
                }
              >
                {message.parts.map((part, i) => {
                  if (part.type === "text")
                    return message.role === "user" ? (
                      <p key={i} className="whitespace-pre-wrap">
                        {part.text}
                      </p>
                    ) : (
                      <MessageResponse
                        key={i}
                        components={markdownComponents}
                        isAnimating={busy && message.id === last?.id}
                      >
                        {part.text}
                      </MessageResponse>
                    );
                  if (part.type === "reasoning" && part.text)
                    return (
                      <Reasoning
                        key={i}
                        defaultOpen={false}
                        isStreaming={busy && message.id === last?.id}
                      >
                        <ReasoningTrigger>{c.reviewing}</ReasoningTrigger>
                        <ReasoningContent>{part.text}</ReasoningContent>
                      </Reasoning>
                    );
                  return null;
                })}
              </MessageContent>
              {message.role === "assistant" &&
                !busy &&
                message.parts.some((p) => p.type === "text" && p.text) && (
                  <MessageAction
                    label={c.copyAnswer}
                    tooltip={c.copyAnswer}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          message.parts
                            .filter((p) => p.type === "text")
                            .map((p) => p.text)
                            .join("\n"),
                        );
                        setNotice(c.copied);
                      } catch {
                        setNotice(c.copyFailed);
                      }
                    }}
                  >
                    <Copy />
                  </MessageAction>
                )}
            </Message>
          ))}
          {waiting && (
            <div role="status">
              <Shimmer>{c.waiting}</Shimmer>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton aria-label={c.latest} />
      </Conversation>
      {error && (
        <p role="alert" className="mb-3 break-words text-sm text-destructive">
          {error.message}
        </p>
      )}
      {(notice || stopped) && (
        <p role="status" className="mb-3 text-sm text-muted-foreground">
          {notice || c.stopped}
        </p>
      )}
      {signedIn ? (
        <PromptInput onSubmit={({ text }) => ask(text)}>
          <PromptInputTextarea
            ref={input}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            aria-label={c.yourQuestion}
            placeholder={orphanId ? c.placeholderFile : c.placeholder}
            maxLength={2000}
            className="min-h-24 text-base"
          />
          <PromptInputFooter className="justify-between">
            <span className="text-xs text-muted-foreground">{c.noPersonal}</span>
            <PromptInputSubmit
              status={status}
              onStop={() => {
                stop();
                setStopped(true);
                focus();
              }}
              aria-label={busy ? c.stop : c.send}
              title={busy ? c.stop : c.send}
              disabled={!busy && !question.trim()}
              className="size-11 shrink-0"
            >
              {busy ? <Square /> : <ArrowUp />}
            </PromptInputSubmit>
          </PromptInputFooter>
        </PromptInput>
      ) : (
        <div className="border-t border-border py-5">
          <AuthDialog
            trigger={(open) => (
              <Button className="min-h-11" onClick={open}>
                {c.signIn}
              </Button>
            )}
          />
        </div>
      )}
      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        {demo ? c.sampleDisclaimer : c.disclaimer}
      </p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-primary">
        <Link to="/how-it-works" className="inline-flex min-h-11 items-center gap-1">
          <FileText className="size-4" aria-hidden="true" /> {c.steps}
        </Link>
        {orphanId && !demo && (
          <Link
            to="/orphans/$orphanId"
            params={{ orphanId }}
            className="inline-flex min-h-11 items-center"
          >
            {c.file}
          </Link>
        )}
      </div>
    </section>
  );
}
