import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePicker } from "@/components/kit/FilePicker";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Inbox, Loader2, PackageCheck, X } from "lucide-react";

import { Failed } from "@/components/admin/overview/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { formatDate, formatMoney, isolate } from "@/lib/format";
import { createDocumentUploadUrl } from "@/lib/intake.functions";
import {
  confirmDelivery,
  getOrgInbox,
  moderateMessage,
  type PendingDelivery,
} from "@/lib/ledger.functions";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { Name } from "@/components/kit/Name";
import { Skeleton } from "@/components/ui/skeleton";

export const INBOX_COPY = defineCopy("components/org/OrgInbox", {
  ar: {
    title: "ما ينتظرك",
    failed: "تعذّرت قراءة ما ينتظرك",
    failedText: "قد تنتظرك رسائل أو تأكيدات لا تظهر الآن.",
    retry: "أعد المحاولة",
    moderateFailed: "تعذّرت المراجعة",
    deliveriesH: "تأكيد وصول دعم الشهر",
    deliveriesP:
      "ارفع إيصالاً أو صورة استلام. تُحفظ في ملفّ الطفل الخاص ولا يراها الكافل؛ يرى أنها موثّقة.",
    messagesH: "رسائل الكفلاء للأطفال",
    messagesP: "اعتمد ما يصلح أن يقرأه الطفل. لا يظهر اسم الكافل للطفل.",
    to: "إلى",
    approve: "اعتماد",
    reject: "رفض",
    approveFor: (n: string) => `اعتماد رسالة ${n}`,
    rejectFor: (n: string) => `رفض رسالة ${n}`,
    signFailed: "تعذّر تجهيز الرفع",
    putFailed: "تعذّر رفع المستند",
    confirmFailed: "تعذّر التأكيد",
    confirmed: "أُكّد الوصول، وأُبلغ الكافل",
    sent: (d: string) => `حُوِّل ${d}`,
    proof: "مستند الاستلام",
    proofFor: (n: string) => `مستند استلام ${n}`,
    note: "ملاحظة",
    notePh: "ملاحظة (اختياري)",
    confirm: "تأكيد الوصول",
  },
  en: {
    title: "Waiting for you",
    failed: "What is waiting for you could not be read",
    failedText: "Messages or confirmations may be waiting that do not show right now.",
    retry: "Try again",
    moderateFailed: "The review could not be saved",
    deliveriesH: "Confirm this month's support arrived",
    deliveriesP:
      "Upload a receipt or a photo of the handover. It is kept in the child's private file and the sponsor never sees it; they see that it is documented.",
    messagesH: "Sponsor messages to children",
    messagesP:
      "Approve what is fit for the child to read. The sponsor's name is never shown to the child.",
    to: "To",
    approve: "Approve",
    reject: "Reject",
    approveFor: (n: string) => `Approve the message to ${n}`,
    rejectFor: (n: string) => `Reject the message to ${n}`,
    signFailed: "The upload could not be prepared",
    putFailed: "The document could not be uploaded",
    confirmFailed: "The confirmation could not be saved",
    confirmed: "Arrival confirmed, and the sponsor was told",
    sent: (d: string) => `Transferred ${d}`,
    proof: "Receipt document",
    proofFor: (n: string) => `Receipt document for ${n}`,
    note: "Note",
    notePh: "Note (optional)",
    confirm: "Confirm arrival",
  },
});

/**
 * «ما ينتظرك»: أول ما تراه الجهة الميدانية.
 *
 * رسائل الكفلاء لا تصل الطفل قبل مراجعتها هنا، ودعم الشهر لا يُعدّ
 * واصلاً حتى يُرفع مستندٌ يثبته، فيُبلَّغ الكافل تلقائياً. القراءة والمراجعة
 * عبر منفذ البيانات، فيرسمها العرض التفاعلي برسائل نموذجية.
 */
export function OrgInbox() {
  const c = useCopy(INBOX_COPY);
  const locale = useLocale();
  const fetchInbox = useDataFn("org.inbox", getOrgInbox);
  const moderate = useDataFn("org.moderate", moderateMessage);
  const qc = useQueryClient();
  const key = useDataKey(["org-inbox"]);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: key,
    queryFn: () => fetchInbox(),
  });
  const [busy, setBusy] = useState<string | null>(null);

  // أثناء التحميل هيكلٌ بارتفاع الصندوق لا «لا شيء» (RT-07): كان الصندوق يُدرج
  // فوق قائمة الأطفال بعد ثوانٍ فيدفعها خارج الشاشة (CLS 0.64).
  if (isPending)
    return (
      <div
        className="mb-10 rounded-2xl border border-border bg-card p-5"
        aria-hidden="true"
        data-testid="org-inbox-skeleton"
      >
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-4 h-14 w-full" />
      </div>
    );
  if (isError || data?.ok === false)
    return (
      <div className="mb-10">
        <Failed
          title={c.failed}
          text={c.failedText}
          retry={c.retry}
          onRetry={() => void refetch()}
        />
      </div>
    );
  const messages = data?.messages ?? [];
  const deliveries = data?.deliveries ?? [];
  if (messages.length === 0 && deliveries.length === 0) return null;

  async function decide(id: string, approve: boolean) {
    setBusy(id);
    const res = await moderate({ data: { sponsorshipId: id, approve } });
    setBusy(null);
    if (!res.ok) toast.error(c.moderateFailed);
    await qc.invalidateQueries({ queryKey: key });
  }

  return (
    <section
      aria-labelledby="org-inbox-h"
      className="mb-10 rounded-2xl border border-bridge/50 bg-card p-5"
    >
      <h2 id="org-inbox-h" className="flex items-center gap-2 text-lg font-bold">
        <Inbox className="size-5 text-bridge-ink" aria-hidden="true" />
        {c.title}
        <span className="text-sm font-normal text-muted-foreground">
          ({messages.length + deliveries.length})
        </span>
      </h2>

      {deliveries.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">{c.deliveriesH}</h3>
          <p className="text-xs text-muted-foreground">{c.deliveriesP}</p>
          <ul className="mt-3 divide-y divide-border">
            {deliveries.map((d) => (
              <DeliveryRow key={d.id} d={d} />
            ))}
          </ul>
        </div>
      )}

      {messages.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold">{c.messagesH}</h3>
          <p className="text-xs text-muted-foreground">{c.messagesP}</p>
          <ul className="mt-3 divide-y divide-border">
            {messages.map((m) => (
              <li
                key={m.sponsorship_id}
                className="flex flex-wrap items-start justify-between gap-3 py-3"
              >
                <div className="min-w-[min(100%,16rem)] flex-1">
                  <p className="text-xs text-muted-foreground">
                    {c.to} <Name>{m.orphan}</Name> · {formatDate(m.created_at, locale)}
                  </p>
                  <p dir="auto" className="mt-1 whitespace-pre-line text-sm">
                    {m.message}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    className="min-h-11"
                    aria-label={c.approveFor(isolate(m.orphan))}
                    disabled={busy === m.sponsorship_id}
                    onClick={() => decide(m.sponsorship_id, true)}
                  >
                    <Check className="size-4" aria-hidden="true" /> {c.approve}
                  </Button>
                  <Button
                    className="min-h-11"
                    variant="outline"
                    aria-label={c.rejectFor(isolate(m.orphan))}
                    disabled={busy === m.sponsorship_id}
                    onClick={() => decide(m.sponsorship_id, false)}
                  >
                    <X className="size-4" aria-hidden="true" /> {c.reject}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function DeliveryRow({ d }: { d: PendingDelivery }) {
  const c = useCopy(INBOX_COPY);
  const locale = useLocale();
  const signUpload = useDataFn("org.signUpload", createDocumentUploadUrl);
  const confirm = useDataFn("org.confirmDelivery", confirmDelivery);
  const qc = useQueryClient();
  const key = useDataKey(["org-inbox"]);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!file) return;
    setBusy(true);
    try {
      const signed = await signUpload({
        data: { orphanId: d.orphan_id, kind: "other", fileName: `delivery-${d.id}-${file.name}` },
      });
      if (!signed.ok) {
        toast.error(c.signFailed);
        return;
      }
      const put = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) {
        toast.error(c.putFailed);
        return;
      }
      const res = await confirm({
        data: { disbursementId: d.id, proofPath: signed.path, note: note || undefined },
      });
      if (!res.ok) {
        toast.error(c.confirmFailed);
        return;
      }
      toast.success(c.confirmed);
      await qc.invalidateQueries({ queryKey: key });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="grid gap-2 py-3 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <p className="text-sm font-medium">
          <Name>{d.orphan}</Name> · {formatMoney(d.amount, d.currency)}
        </p>
        <p className="text-xs text-muted-foreground">
          {[
            d.period_start ? formatDate(d.period_start, locale) : "",
            c.sent(formatDate(d.created_at, locale)),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* زرٌّ يحمل اسم الملفّ لا «Choose File» المتصفّح (UX-17). */}
        <FilePicker
          label={c.proof}
          accessibleLabel={c.proofFor(isolate(d.orphan))}
          onPick={setFile}
        />
        <Input
          aria-label={c.note}
          placeholder={c.notePh}
          className="min-h-11 w-40"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button className="min-h-11" disabled={!file || busy} onClick={submit}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <PackageCheck className="size-4" aria-hidden="true" />
          )}
          {c.confirm}
        </Button>
      </div>
    </li>
  );
}
