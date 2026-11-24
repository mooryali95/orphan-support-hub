import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { Link } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
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

const suggestions = ["كيف أبدأ الكفالة؟", "هل يمكنني إيقاف الكفالة؟", "كيف تُحمى معلومات الطفل؟"];
export function SupporterAssistant({ orphanId }: { orphanId?: string }) {
  const { user } = useAuth();
  return (
    <AssistantConversation
      key={`${user?.id ?? "guest"}:${orphanId ?? "general"}`}
      {...(orphanId ? { orphanId } : {})}
      signedIn={Boolean(user)}
    />
  );
}
function AssistantConversation({ orphanId, signedIn }: { orphanId?: string; signedIn: boolean }) {
  const [question, setQuestion] = useState("");
  const [notice, setNotice] = useState("");
  const [stopped, setStopped] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const focus = () => input.current?.focus({ preventScroll: true });
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/public/supporter-assistant",
        body: orphanId ? { orphanId } : {},
        headers: async () => {
          const { data } = await supabase.auth.getSession();
          return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
        },
        fetch: async (url, init) => {
          const response = await fetch(url, init);
          if (!response.ok) {
            let message = "تعذّر الوصول إلى مساعد الأسئلة. حاول لاحقاً.";
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
    [orphanId],
  );
  const { messages, sendMessage, status, error, stop, setMessages, clearError } = useChat({
    transport,
    onFinish: ({ message, isAbort, isError }) => {
      if (
        !isAbort &&
        !isError &&
        !message.parts.some((part) => part.type === "text" && part.text.trim())
      ) {
        setNotice("لم تتوفر إجابة لهذا السؤال. لم يُسجّل أي طلب كفالة.");
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
      setNotice("وصلت المحادثة إلى حدّها؛ ابدأ محادثة جديدة.");
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
    <section aria-label="محادثة مساعد الداعمين" className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" /> المعلومات المنشورة فقط
        </div>
        <Button
          variant="ghost"
          size="icon"
          title="محادثة جديدة"
          aria-label="محادثة جديدة"
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
        <ConversationContent className="gap-6 px-0 py-6" role="log" aria-label="الأسئلة والإجابات">
          {messages.length === 0 && (
            <div className="py-6">
              <h2 className="text-xl font-semibold">ما الذي تودّ معرفته؟</h2>
              <div className="mt-6 flex flex-col items-start gap-2">
                {suggestions.map((text) => (
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
                        <ReasoningTrigger>مراجعة المعلومات</ReasoningTrigger>
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
                    label="نسخ الإجابة"
                    tooltip="نسخ الإجابة"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          message.parts
                            .filter((p) => p.type === "text")
                            .map((p) => p.text)
                            .join("\n"),
                        );
                        setNotice("نُسخت الإجابة.");
                      } catch {
                        setNotice("تعذّر نسخ الإجابة.");
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
              <Shimmer>جارٍ مراجعة المعلومات المنشورة…</Shimmer>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton aria-label="آخر إجابة" />
      </Conversation>
      {error && (
        <p role="alert" className="mb-3 break-words text-sm text-destructive">
          {error.message}
        </p>
      )}
      {(notice || stopped) && (
        <p role="status" className="mb-3 text-sm text-muted-foreground">
          {notice || "تم إيقاف الإجابة؛ بقي الجزء المكتوب."}
        </p>
      )}
      {signedIn ? (
        <PromptInput onSubmit={({ text }) => ask(text)}>
          <PromptInputTextarea
            ref={input}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            aria-label="سؤالك"
            placeholder={
              orphanId ? "اسأل عن المعلومات المنشورة لهذا الملفّ…" : "اكتب سؤالك عن الكفالة…"
            }
            maxLength={2000}
            className="min-h-24 text-base"
          />
          <PromptInputFooter className="justify-between">
            <span className="text-xs text-muted-foreground">
              لا تكتب بيانات شخصية أو معلومات دفع
            </span>
            <PromptInputSubmit
              status={status}
              onStop={() => {
                stop();
                setStopped(true);
                focus();
              }}
              aria-label={busy ? "إيقاف الإجابة" : "إرسال السؤال"}
              title={busy ? "إيقاف الإجابة" : "إرسال السؤال"}
              disabled={!busy && !question.trim()}
              className="size-11 shrink-0"
            >
              {busy ? <Square /> : <ArrowUp />}
            </PromptInputSubmit>
          </PromptInputFooter>
        </PromptInput>
      ) : (
        <div className="border-t border-border py-5">
          <AuthDialog trigger={(open) => <Button onClick={open}>سجّل الدخول لطرح سؤالك</Button>} />
        </div>
      )}
      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        إجابات آلية قد تخطئ؛ المرجع هو الملفّ المنشور وشروط الكفالة. المحادثة لهذه الجلسة فقط ولا
        تُحفظ في حسابك.
      </p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-primary">
        <Link to="/how-it-works" className="inline-flex items-center gap-1">
          <FileText className="size-4" /> خطوات الكفالة
        </Link>
        {orphanId && (
          <Link to="/orphans/$orphanId" params={{ orphanId }}>
            الملفّ المنشور
          </Link>
        )}
      </div>
    </section>
  );
}
