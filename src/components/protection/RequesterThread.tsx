import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { getAccessThread, postAccessMessage } from "@/lib/scopes.functions";
import { cn } from "@/lib/utils";

/**
 * محادثة صاحب الطلب مع الإدارة — في صفحة الطفل نفسها، فلا يُسأل في
 * مكانٍ ويُجاب في آخر.
 */
export function RequesterThread({ requestId }: { requestId: string }) {
  const qc = useQueryClient();
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
      <p className="text-xs font-semibold">المحادثة مع الإدارة</p>
      {thread.length > 0 && (
        <ul className="mt-2 space-y-2">
          {thread.map((m) => (
            <li
              key={m.id}
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                m.from_admin ? "me-6 bg-background" : "ms-6 bg-primary/10",
              )}
            >
              <p className="whitespace-pre-line">{m.body}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {m.from_admin ? "الإدارة" : "أنت"} · {formatDate(m.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex gap-2">
        <Textarea
          rows={2}
          placeholder="أضف توضيحاً أو أجب عن سؤال الإدارة…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button
          size="icon"
          aria-label="إرسال"
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
