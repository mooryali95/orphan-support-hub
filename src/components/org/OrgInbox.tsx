import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePicker } from "@/components/kit/FilePicker";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Inbox, Loader2, PackageCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoney, isolate } from "@/lib/format";
import { createDocumentUploadUrl } from "@/lib/intake.functions";
import {
  confirmDelivery,
  getOrgInbox,
  moderateMessage,
  type PendingDelivery,
} from "@/lib/ledger.functions";
import { Name } from "@/components/kit/Name";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * «ما ينتظرك» — أول ما تراه الجهة الميدانية.
 *
 * رسائل الكفلاء لا تصل الطفل قبل مراجعتها هنا، ودعم الشهر لا يُعدّ
 * واصلاً حتى يُرفع مستندٌ يثبته — فيُبلَّغ الكافل تلقائياً.
 */
export function OrgInbox() {
  const fetchInbox = useServerFn(getOrgInbox);
  const moderate = useServerFn(moderateMessage);
  const qc = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ["org-inbox"], queryFn: () => fetchInbox() });
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
  const messages = data?.messages ?? [];
  const deliveries = data?.deliveries ?? [];
  if (messages.length === 0 && deliveries.length === 0) return null;

  async function decide(id: string, approve: boolean) {
    setBusy(id);
    const res = await moderate({ data: { sponsorshipId: id, approve } });
    setBusy(null);
    if (!res.ok) toast.error("تعذّرت المراجعة");
    await qc.invalidateQueries({ queryKey: ["org-inbox"] });
  }

  return (
    <section className="mb-10 rounded-2xl border border-bridge/50 bg-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Inbox className="size-5 text-bridge-ink" aria-hidden="true" />
        ما ينتظرك
        <span className="text-sm font-normal text-muted-foreground">
          ({messages.length + deliveries.length})
        </span>
      </h2>

      {deliveries.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">تأكيد وصول دعم الشهر</h3>
          <p className="text-xs text-muted-foreground">
            ارفع إيصالاً أو صورة استلام — تُحفظ في ملف الطفل الخاص ولا يراها الكافل؛ يرى أنها
            موثّقة.
          </p>
          <ul className="mt-3 divide-y divide-border">
            {deliveries.map((d) => (
              <DeliveryRow key={d.id} d={d} />
            ))}
          </ul>
        </div>
      )}

      {messages.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold">رسائل الكفلاء للأطفال</h3>
          <p className="text-xs text-muted-foreground">
            اعتمد ما يصلح أن يقرأه الطفل. لا يظهر اسم الكافل للطفل.
          </p>
          <ul className="mt-3 divide-y divide-border">
            {messages.map((m) => (
              <li
                key={m.sponsorship_id}
                className="flex flex-wrap items-start justify-between gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    إلى <Name>{m.orphan}</Name> · {formatDate(m.created_at)}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm">{m.message}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy === m.sponsorship_id}
                    onClick={() => decide(m.sponsorship_id, true)}
                  >
                    <Check className="size-4" /> اعتماد
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === m.sponsorship_id}
                    onClick={() => decide(m.sponsorship_id, false)}
                  >
                    <X className="size-4" /> رفض
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
  const signUpload = useServerFn(createDocumentUploadUrl);
  const confirm = useServerFn(confirmDelivery);
  const qc = useQueryClient();
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
        toast.error("تعذّر تجهيز الرفع");
        return;
      }
      const put = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) {
        toast.error("تعذّر رفع المستند");
        return;
      }
      const res = await confirm({
        data: { disbursementId: d.id, proofPath: signed.path, note: note || undefined },
      });
      if (!res.ok) {
        toast.error("تعذّر التأكيد");
        return;
      }
      toast.success("أُكّد الوصول، وأُبلغ الكافل");
      await qc.invalidateQueries({ queryKey: ["org-inbox"] });
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
          {d.period_start ? formatDate(d.period_start) : ""} — حُوِّل {formatDate(d.created_at)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* زرّ عربيّ يحمل اسم الملف لا «Choose File» المتصفّح (UX-17). */}
        <FilePicker
          label="مستند الاستلام"
          accessibleLabel={`مستند استلام ${isolate(d.orphan)}`}
          onPick={setFile}
        />
        <Input
          aria-label="ملاحظة"
          placeholder="ملاحظة (اختياري)"
          className="w-40"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button size="sm" disabled={!file || busy} onClick={submit}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
          تأكيد الوصول
        </Button>
      </div>
    </li>
  );
}
