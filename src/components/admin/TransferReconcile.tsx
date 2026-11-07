import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, TriangleAlert } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getDecisionContext } from "@/lib/inbox.functions";
import { confirmManualTransfer } from "@/lib/manual-payments.functions";
import { formatDate, formatMoney } from "@/lib/format";

type TransferContext = {
  sponsorship_id: string;
  reference: string;
  amount: number;
  currency: string;
  type: string;
  created_at: string;
  person_name: string | null;
  person_email: string | null;
  code: string;
  name: string;
  awaiting: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * مطابقة التحويل البنكي قبل تفعيل الكفالة (UX-15).
 *
 * ما وصل فعلاً — المبلغ وتاريخ القيد والمرجع في كشف البنك — يُدخَل قبل
 * التفعيل، ويُعرض الكافل باسمه وبريده ليُطابَق بالمُرسِل. الفرق في المبلغ
 * يُنبَّه إليه ولا يمرّ إلا بإقرارٍ وملاحظة، والتأكيد يُطلب مرّةً ثانية
 * بملخّصه قبل أن يُكتب. القاعدة تفرض كلّ ذلك وتكتب الأثر.
 */
export function TransferReconcile({
  sponsorshipId,
  onDone,
}: {
  sponsorshipId: string;
  onDone?: () => void;
}) {
  const id = useId();
  const qc = useQueryClient();
  const fetchContext = useServerFn(getDecisionContext);
  const confirm = useServerFn(confirmManualTransfer);
  const { data: raw, isPending } = useQuery({
    queryKey: ["decision-context", "transfer", sponsorshipId],
    queryFn: () => fetchContext({ data: { kind: "transfer", id: sponsorshipId } }),
  });
  const ctx = raw ? (JSON.parse(raw) as TransferContext | null) : null;

  const [amount, setAmount] = useState("");
  const [valueDate, setValueDate] = useState(today);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [accept, setAccept] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (isPending) {
    return <Loader2 className="text-muted-foreground mx-auto my-6 size-5 animate-spin" />;
  }
  if (!ctx) return <p className="text-destructive text-sm">تعذّر تحميل التحويل.</p>;
  if (!ctx.awaiting) {
    return <p className="text-muted-foreground text-sm">هذه الكفالة لا تنتظر تحويلاً بنكياً.</p>;
  }

  const received = Number(amount);
  const amountOk = amount.trim() !== "" && Number.isFinite(received) && received > 0;
  const mismatch = amountOk && Math.abs(received - Number(ctx.amount)) > 0.004;
  const ready =
    amountOk &&
    /^\d{4}-\d{2}-\d{2}$/.test(valueDate) &&
    reference.trim().length >= 3 &&
    (!mismatch || (accept && note.trim().length >= 3));

  async function submit() {
    setBusy(true);
    try {
      const res = await confirm({
        data: {
          sponsorshipId,
          receivedAmount: received,
          currency: ctx!.currency,
          valueDate,
          bankReference: reference.trim(),
          ...(mismatch ? { acceptMismatch: true } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("طُوبق التحويل وفُعّلت الكفالة");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["decision-inbox"] }),
        qc.invalidateQueries({ queryKey: ["awaiting-transfers"] }),
        qc.invalidateQueries({ queryKey: ["admin-overview"] }),
      ]);
      onDone?.();
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }

  return (
    <div className="space-y-4">
      <dl className="border-border grid gap-2 rounded-xl border p-4 text-sm">
        <Row k="الكافل" v={ctx.person_name || "—"} />
        <Row k="بريده" v={ctx.person_email ?? "—"} ltr />
        <Row k="الطفل" v={`${ctx.name} — ${ctx.code}`} />
        <Row k="المتوقَّع" v={formatMoney(ctx.amount, ctx.currency)} />
        <Row k="مرجع الكافل" v={ctx.reference} ltr />
        <Row k="تعهّد في" v={formatDate(ctx.created_at)} />
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-amount`}>المبلغ المستلَم ({ctx.currency})</Label>
          <Input
            id={`${id}-amount`}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1.5"
            required
          />
        </div>
        <div>
          <Label htmlFor={`${id}-date`}>تاريخ القيد في الحساب</Label>
          <Input
            id={`${id}-date`}
            type="date"
            max={today()}
            value={valueDate}
            onChange={(e) => setValueDate(e.target.value)}
            className="mt-1.5"
            required
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`${id}-ref`}>المرجع البنكي (من كشف الحساب)</Label>
          <Input
            id={`${id}-ref`}
            dir="ltr"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="mt-1.5"
            required
          />
        </div>
      </div>

      {mismatch && (
        <div role="alert" className="bg-secondary/60 space-y-2 rounded-xl p-3 text-sm">
          <p className="flex items-center gap-1 font-medium">
            <TriangleAlert className="size-4" aria-hidden="true" />
            المستلَم {formatMoney(received, ctx.currency)} يخالف المتوقَّع{" "}
            {formatMoney(ctx.amount, ctx.currency)}.
          </p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
            أقرّ بالفرق وأقيّد ما وصل فعلاً
          </label>
        </div>
      )}
      <div>
        <Label htmlFor={`${id}-note`}>
          ملاحظة {mismatch ? "(إلزامية مع الفرق)" : "(اختيارية)"}
        </Label>
        <Textarea
          id={`${id}-note`}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1.5"
        />
      </div>

      <Button disabled={!ready || busy} onClick={() => setAsking(true)}>
        تأكيد الاستلام وتفعيل الكفالة
      </Button>

      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تفعيل كفالة {ctx.name}؟</AlertDialogTitle>
            <AlertDialogDescription>
              يُقيَّد {amountOk ? formatMoney(received, ctx.currency) : "—"} بتاريخ{" "}
              {formatDate(valueDate)} بالمرجع {reference.trim()} من {ctx.person_email ?? "الكافل"}،
              وتُفعَّل الكفالة ويُبلَّغ الكافل. لا يُتراجع عن القيد إلا بردٍّ مسجَّل.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>رجوع</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ k, v, ltr }: { k: string; v: string; ltr?: boolean }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2">
      <dt className="text-muted-foreground text-xs">{k}</dt>
      <dd dir={ltr ? "ltr" : undefined} className="break-words text-start">
        {v}
      </dd>
    </div>
  );
}
