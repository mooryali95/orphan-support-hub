import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { DecisionPanel } from "@/components/admin/DecisionInbox";
import { SOURCES_COPY } from "@/components/admin/data/sources-copy";
import { AlertDetail } from "@/components/admin/data/sources/Alerts";
import { V } from "@/components/admin/data/sources/shared";
import { useWorkErr } from "@/components/admin/data/WorkTools";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { countryName } from "@/lib/countries";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { resolveAlert, resolveConflict } from "@/lib/golden-record.functions";
import { useCopy, useLocale } from "@/lib/locale";

import { TODAY_COPY } from "./copy";

import { type QueueItem } from "./queue";
import { ChildUpdateReview } from "@/components/admin/data/sources/ChildUpdatesCard";

import type { FullScreen, WorkTab } from "./TodayQueue";

/* لوح القرار الجانبي في «اليوم» وحسمه المباشر. */
type SettleInput =
  | {
      kind: "alert";
      id: string;
      status: "reviewed" | "false_positive" | "confirmed";
      note?: string;
    }
  | {
      kind: "conflict";
      id: string;
      choice: "accept" | "keep" | "use_wamy" | "use_office";
    };

/** الحسم بأبواب «مصادر التحقق» نفسها: القاعدة ترفض ما لا يحقّ، والخطأ يُقرأ بلغة الواجهة. */
export function useSettle() {
  const qc = useQueryClient();
  const dk = useDataKey([]);
  const err = useWorkErr();
  const alert = useDataFn("golden.resolveAlert", resolveAlert);
  const conflict = useDataFn("golden.resolveConflict", resolveConflict);
  return useMutation({
    mutationFn: async (v: SettleInput) => {
      const res =
        v.kind === "alert"
          ? await alert({
              data: { id: v.id, status: v.status, ...(v.note ? { note: v.note } : {}) },
            })
          : await conflict({ data: { id: v.id, choice: v.choice } });
      return res as { ok: boolean; error?: string };
    },
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      for (const k of [
        "golden-alerts",
        "golden-conflicts",
        "data-health",
        "child-file",
        "queue-counts",
        "today-strip",
        "decision-log",
      ])
        void qc.invalidateQueries({ queryKey: [...dk, k] });
      for (const k of ["trust-overview", "trust-aging"])
        void qc.invalidateQueries({ queryKey: [...dk, k] });
    },
  });
}

export function Detail({
  item,
  reject,
  demo,
  busy,
  onSettle,
  onInboxDone,
  onOpenFile,
  onOpenCountry,
  onOpenFull,
}: {
  item: QueueItem;
  reject: boolean;
  demo: boolean;
  busy: boolean;
  onSettle: (v: SettleInput) => void;
  onInboxDone: () => void;
  onOpenFile: (id: string) => void;
  onOpenCountry: (tab: WorkTab) => void;
  onOpenFull: ((s: FullScreen) => void) | undefined;
}) {
  const t = useCopy(TODAY_COPY);
  const s = useCopy(SOURCES_COPY);
  const locale = useLocale();
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!reject) return;
    requestAnimationFrame(() => (noteRef.current ?? keepRef.current)?.focus());
  }, [reject]);
  const fields = s.fields as Record<string, string>;

  if (item.source === "inbox" && item.inbox) {
    const full: FullScreen | null =
      item.kind === "orphan"
        ? "orphan"
        : item.kind === "unlock" || item.kind === "discrepancy"
          ? "integrity"
          : null;
    if (!demo && !full) return <DecisionPanel item={item.inbox} onDone={onInboxDone} />;
    return (
      <div className="space-y-4">
        <Head item={item} />
        {full && onOpenFull ? (
          <Button type="button" className="min-h-11" onClick={() => onOpenFull(full)}>
            {t.openFull}
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm leading-7">{t.sampleDecision}</p>
        )}
      </div>
    );
  }

  const blocked = !item.can_settle && (
    <p
      role="note"
      className="border-border bg-secondary/50 rounded-xl border p-3 text-sm leading-7"
    >
      <strong>{item.settle_block_reason ? t.reasons[item.settle_block_reason] : null}</strong>
      {": "}
      {item.settle_block_reason === "own_upload" ? t.ownHint : t.scopeHint}{" "}
      {item.country_code
        ? t.whoSettles.replace("{0}", countryName(item.country_code, locale))
        : t.whoSettlesAny}
    </p>
  );

  return (
    <div className="space-y-4 pb-20 sm:pb-0">
      <Head item={item} />
      {item.update && (
        <ChildUpdateReview item={item.update} canApprove={item.can_settle} onDone={onInboxDone} />
      )}
      {item.alert && (
        <>
          <p className="text-sm">
            <span className="font-bold">{s.signals[item.alert.signal]}</span>
            {" · "}
            {fields[item.alert.field] ?? item.alert.field}
          </p>
          <AlertDetail a={item.alert} />
        </>
      )}
      {item.conflict && (
        <>
          <p className="text-sm">
            <span className="font-bold">{s.kinds[item.conflict.kind]}</span>
            {" · "}
            {fields[item.conflict.field] ?? item.conflict.field}
          </p>
          <dl className="bg-secondary/60 grid grid-cols-2 gap-2 rounded-xl p-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">{s.current}</dt>
              <dd>
                <V v={item.conflict.current} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{s.proposed}</dt>
              <dd>
                <V v={item.conflict.proposed} />
              </dd>
            </div>
          </dl>
        </>
      )}
      {item.link && <p className="text-muted-foreground text-sm leading-7">{t.linkHint}</p>}
      {blocked}

      {item.can_settle && (item.alert || item.conflict) && (
        // شريط القرار ثابتٌ أسفل اللوح على الجوال: الإبهام يصل إليه بلا تمرير.
        <div className="bg-background border-border fixed inset-x-0 bottom-0 z-10 border-t p-3 sm:static sm:border-0 sm:bg-transparent sm:p-0">
          {item.alert ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim())
                  onSettle({ kind: "alert", id: item.id, status: "confirmed", note: note.trim() });
              }}
            >
              <label className="sr-only" htmlFor="today-note">
                {t.rejectNote}
              </label>
              <Textarea
                id="today-note"
                ref={noteRef}
                rows={2}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t.rejectNote}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => onSettle({ kind: "alert", id: item.id, status: "reviewed" })}
                >
                  {t.reviewed}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() =>
                    onSettle({
                      kind: "alert",
                      id: item.id,
                      status: "false_positive",
                      ...(note.trim() ? { note: note.trim() } : {}),
                    })
                  }
                >
                  {t.falsePositive}
                </Button>
                <Button
                  type="submit"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive ms-auto min-h-11"
                  disabled={busy || !note.trim()}
                >
                  {s.confirmFraud}
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              {item.conflict!.kind === "disagreement" ? (
                <>
                  <Button
                    type="button"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => onSettle({ kind: "conflict", id: item.id, choice: "use_wamy" })}
                  >
                    {t.useWamy}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() =>
                      onSettle({ kind: "conflict", id: item.id, choice: "use_office" })
                    }
                  >
                    {t.useOffice}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => onSettle({ kind: "conflict", id: item.id, choice: "accept" })}
                >
                  {t.acceptProposed}
                </Button>
              )}
              <Button
                ref={keepRef}
                type="button"
                variant="ghost"
                className="min-h-11"
                disabled={busy}
                onClick={() => onSettle({ kind: "conflict", id: item.id, choice: "keep" })}
              >
                {t.keepCurrent}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {item.orphan_id && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => onOpenFile(item.orphan_id!)}
          >
            {t.openFile}
          </Button>
        )}
        {item.country_code && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11"
            onClick={() =>
              onOpenCountry(
                item.source === "alert"
                  ? "alerts"
                  : item.source === "conflict"
                    ? "conflicts"
                    : item.source === "update"
                      ? "updates"
                      : "links",
              )
            }
          >
            {t.openCountry}
          </Button>
        )}
      </div>
    </div>
  );
}

export function Head({ item }: { item: QueueItem }) {
  const t = useCopy(TODAY_COPY);
  const locale = useLocale();
  return (
    <SheetHeader className="pe-10 text-start">
      <SheetTitle className="flex flex-wrap items-center gap-2">
        {t.kinds[item.kind]}
        {item.severity === "critical" && (
          <span className="text-destructive inline-flex items-center gap-1 text-sm">
            <AlertTriangle className="size-4" aria-hidden="true" />
            {t.critical}
          </span>
        )}
      </SheetTitle>
      <SheetDescription>
        {item.title ? <bdi dir="ltr">{item.title}</bdi> : t.countryWide}
        {item.subtitle ? (
          <>
            {" · "}
            <bdi dir="auto">{item.subtitle}</bdi>
          </>
        ) : null}
        {item.country_code ? ` · ${countryName(item.country_code, locale)}` : null}
      </SheetDescription>
    </SheetHeader>
  );
}
