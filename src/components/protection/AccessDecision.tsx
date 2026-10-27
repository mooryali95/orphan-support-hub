import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, MessageSquare, Send, ShieldOff, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AccessRequestRow } from "@/integrations/supabase/types.extra";
import { formatDate } from "@/lib/format";
import { revokeAccessRequest } from "@/lib/protection.functions";
import {
  amendAccess,
  decideWithScopes,
  getAccessThread,
  getScopeCatalog,
  postAccessMessage,
} from "@/lib/scopes.functions";
import { cn } from "@/lib/utils";

const SENSITIVITY = ["", "عادي", "حسّاس", "شديد الحساسية"];

/**
 * قرار الإذن: الحزمة تملأ النطاقات، والإدارة تعدّل ما شاءت، والمحادثة
 * مع صاحب الطلب في المكان نفسه. لا يُمنح شيءٌ لم تُختر خانته.
 */
export function AccessDecision({
  row,
  mode,
  days,
}: {
  row: AccessRequestRow;
  mode: "pending" | "approved";
  days: number;
}) {
  const qc = useQueryClient();
  const fetchCatalog = useServerFn(getScopeCatalog);
  const fetchThread = useServerFn(getAccessThread);
  const post = useServerFn(postAccessMessage);
  const decide = useServerFn(decideWithScopes);
  const amend = useServerFn(amendAccess);
  const revoke = useServerFn(revokeAccessRequest);

  const { data: catalog } = useQuery({
    queryKey: ["scope-catalog"],
    queryFn: () => fetchCatalog(),
  });
  const { data: thread } = useQuery({
    queryKey: ["access-thread", row.id],
    queryFn: () => fetchThread({ data: { requestId: row.id } }),
  });

  // تبدأ بما طلبه صاحب الطلب أو بما مُنح سابقاً — والإدارة تعدّل.
  const [scopes, setScopes] = useState<string[]>(
    (mode === "approved" ? row.granted_scopes : row.package_scopes) ?? [],
  );
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function toggle(key: string) {
    setScopes((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  }

  async function run(p: Promise<{ ok: boolean; error?: string | null }>, done: string) {
    setBusy(true);
    const res = await p;
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "تعذّر التنفيذ");
      return;
    }
    toast.success(done);
    await qc.invalidateQueries({ queryKey: ["access-requests"] });
    await qc.invalidateQueries({ queryKey: ["access-thread", row.id] });
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div>
        <p className="text-xs font-semibold">ما يراه — حزمة جاهزة أو اختيارٌ مفصّل</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(catalog?.packages ?? []).map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setScopes(p.scopes)}
              title={p.description}
              className="rounded-full border border-border px-3 py-1 text-xs hover:border-primary"
            >
              {p.label}
            </button>
          ))}
        </div>
        <ul className="mt-3 space-y-1.5">
          {(catalog?.scopes ?? []).map((s) => (
            <li key={s.key}>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 accent-[var(--color-primary)]"
                  checked={scopes.includes(s.key)}
                  onChange={() => toggle(s.key)}
                />
                <span>
                  <span className="font-medium">{s.label}</span>
                  <span
                    className={cn(
                      "ms-2 text-[11px]",
                      s.sensitivity >= 3 ? "text-bridge-ink" : "text-muted-foreground",
                    )}
                  >
                    {SENSITIVITY[s.sensitivity]}
                  </span>
                  <span className="block text-xs text-muted-foreground">{s.description}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <Textarea
          className="mt-3"
          rows={2}
          placeholder="ملاحظة القرار (تصل صاحب الطلب)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {mode === "pending" ? (
            <>
              <Button
                size="sm"
                disabled={busy || scopes.length === 0}
                onClick={() =>
                  run(
                    decide({
                      data: {
                        requestId: row.id,
                        decision: "approved",
                        scopes,
                        days,
                        note: note || undefined,
                      },
                    }),
                    `أُذن بـ${scopes.length} نطاقات لمدّة ${days} يوماً`,
                  )
                }
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                إذن بالمختار
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(
                    decide({
                      data: {
                        requestId: row.id,
                        decision: "rejected",
                        scopes: [],
                        days,
                        note: note || undefined,
                      },
                    }),
                    "رُفض الطلب",
                  )
                }
              >
                <X className="size-4" /> رفض
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                disabled={busy || scopes.length === 0}
                onClick={() =>
                  run(
                    amend({ data: { requestId: row.id, scopes, note: note || undefined } }),
                    "عُدّلت النطاقات",
                  )
                }
              >
                تعديل النطاقات
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => run(revoke({ data: { requestId: row.id } }), "سُحب الإذن")}
              >
                <ShieldOff className="size-4" /> سحب الإذن
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-secondary/30 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <MessageSquare className="size-3.5" /> المحادثة مع صاحب الطلب
        </p>
        <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
          {(thread ?? []).length === 0 ? (
            <li className="text-xs text-muted-foreground">لا رسائل بعد.</li>
          ) : (
            (thread ?? []).map((m) => (
              <li
                key={m.id}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm",
                  m.from_admin ? "ms-6 bg-primary/10" : "me-6 bg-background",
                )}
              >
                <p className="whitespace-pre-line">{m.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {m.from_admin ? "الإدارة" : "صاحب الطلب"} · {formatDate(m.created_at)}
                </p>
              </li>
            ))
          )}
        </ul>
        <div className="mt-2 flex gap-2">
          <Textarea
            rows={2}
            placeholder="اكتب سؤالاً أو توضيحاً…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <Button
            size="icon"
            aria-label="إرسال"
            disabled={busy || reply.trim().length < 2}
            onClick={async () => {
              await run(post({ data: { requestId: row.id, body: reply } }), "أُرسلت الرسالة");
              setReply("");
            }}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
