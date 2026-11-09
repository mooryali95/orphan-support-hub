import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { getAccessThread, postAccessMessage } from "@/lib/scopes.functions";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/protection/RequesterThread", {
  ar: {
    title: "المحادثة مع الإدارة",
    admin: "الإدارة",
    you: "أنت",
    requester: "صاحب الطلب",
    placeholder: "أضف توضيحاً أو أجب عن سؤال الإدارة…",
    adminPlaceholder: "اطلب توضيحاً من صاحب الطلب أو اشرح قرارك…",
    send: "إرسال",
  },
  en: {
    title: "Conversation with the administration",
    admin: "Administration",
    you: "You",
    requester: "Requester",
    placeholder: "Add a clarification or answer the administration's question…",
    adminPlaceholder: "Ask the requester for a clarification or explain your decision…",
    send: "Send",
  },
});

/**
 * محادثة صاحب الطلب مع الإدارة — في صفحة الطفل نفسها، فلا يُسأل في
 * مكانٍ ويُجاب في آخر.
 */
export function RequesterThread({
  requestId,
  viewer = "requester",
}: {
  requestId: string;
  /** الإدارة ترى المحادثة نفسها من طرفها: «أنت» هي الإدارة. */
  viewer?: "requester" | "admin";
}) {
  const mine = (fromAdmin: boolean) => (viewer === "admin" ? fromAdmin : !fromAdmin);
  const qc = useQueryClient();
  const locale = useLocale();
  const c = useCopy(COPY);
  const fetchThread = useServerFn(getAccessThread);
  const post = useServerFn(postAccessMessage);
  const { data: thread = [] } = useQuery({
    queryKey: ["access-thread", requestId],
    queryFn: () => fetchThread({ data: { requestId } }),
  });
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-5 rounded-2xl bg-secondary/40 p-4">
      <p className="text-xs font-semibold">{c.title}</p>
      {thread.length > 0 && (
        <ul className="mt-2 space-y-2">
          {thread.map((m) => (
            <li
              key={m.id}
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                mine(m.from_admin) ? "ms-6 bg-primary/10" : "me-6 bg-background",
              )}
            >
              <p className="whitespace-pre-line">{m.body}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {mine(m.from_admin) ? c.you : viewer === "admin" ? c.requester : c.admin} ·{" "}
                {formatDate(m.created_at, locale)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex gap-2">
        <Textarea
          rows={2}
          placeholder={viewer === "admin" ? c.adminPlaceholder : c.placeholder}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button
          size="icon"
          aria-label={c.send}
          disabled={busy || body.trim().length < 2}
          onClick={async () => {
            setBusy(true);
            await post({ data: { requestId, body } });
            setBusy(false);
            setBody("");
            await qc.invalidateQueries({ queryKey: ["access-thread", requestId] });
          }}
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
