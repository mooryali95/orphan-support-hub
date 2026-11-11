import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CANCEL_REASONS,
  cancelSponsorship,
  changeSponsorshipAmount,
  pauseSponsorship,
  resumeSponsorship,
  type MySponsorship,
} from "@/lib/sponsorships.functions";
import { formatDate, formatMoney, isolate } from "@/lib/format";

/**
 * أدوات الكافل على كفالته (APP-02 / UX-02 / UX-13).
 *
 * الإنهاء بتأكيدٍ يسمّي الطفل والمبلغ وموعد النفاذ، وبسببٍ اختياري، ويعرض
 * البديلين قبله: إيقافاً مؤقّتاً أو مبلغاً أقلّ. والجارية لا تنتهي فوراً:
 * تبقى حتى آخر الشهر المدفوع ثم تنتهي — والنصّ يقول ذلك قبل الضغط.
 *
 * كفالة البطاقة (اشتراكٌ لدى المزوّد) لا تُوقَف ولا يُعدَّل مبلغها من هنا
 * بعد؛ فالزرّان لا يظهران لها بدل أن يَعِدا بما لا يحدث.
 */
type Mode = "cancel" | "pause" | "amount" | null;

export function SponsorshipControls({ s }: { s: MySponsorship }) {
  const [mode, setMode] = useState<Mode>(null);
  const qc = useQueryClient();
  const resume = useServerFn(resumeSponsorship);
  const [busy, setBusy] = useState(false);
  const name = s.orphan?.display_name ?? "الطفل";
  const card = Boolean(s.provider_subscription_id);
  const ending = Boolean(s.cancel_effective_at);
  const live = s.status === "active" || s.status === "paused";

  const refresh = () => qc.invalidateQueries({ queryKey: ["my-sponsorships"] });

  if (!live && s.status !== "pending_payment") return null;

  return (
    <>
      {s.status === "paused" && s.paused_until && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await resume({ data: { id: s.id } });
            setBusy(false);
            if (!res.ok) return void toast.error(res.error);
            toast.success("استُؤنفت الكفالة");
            await refresh();
          }}
        >
          استئناف الآن
        </Button>
      )}
      {s.status === "active" && !ending && !card && (
        <Button size="sm" variant="outline" onClick={() => setMode("pause")}>
          إيقاف مؤقّت
        </Button>
      )}
      {!ending && !card && (
        <Button size="sm" variant="outline" onClick={() => setMode("amount")}>
          تعديل المبلغ
        </Button>
      )}
      {!ending && (
        <Button size="sm" variant="ghost" onClick={() => setMode("cancel")}>
          {s.status === "pending_payment" ? "إلغاء الطلب" : "إنهاء الكفالة"}
        </Button>
      )}

      <Dialog open={mode !== null} onOpenChange={(v) => !v && setMode(null)}>
        <DialogContent className="sm:max-w-lg">
          {mode === "cancel" && (
            <CancelForm
              s={s}
              name={name}
              card={card}
              onAlternative={(m) => setMode(m)}
              onDone={async () => {
                setMode(null);
                await refresh();
              }}
            />
          )}
          {mode === "pause" && (
            <PauseForm
              s={s}
              name={name}
              onDone={async () => {
                setMode(null);
                await refresh();
              }}
            />
          )}
          {mode === "amount" && (
            <AmountForm
              s={s}
              name={name}
              onDone={async () => {
                setMode(null);
                await refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CancelForm({
  s,
  name,
  card,
  onAlternative,
  onDone,
}: {
  s: MySponsorship;
  name: string;
  card: boolean;
  onAlternative: (m: "pause" | "amount") => void;
  onDone: () => Promise<void>;
}) {
  const cancel = useServerFn(cancelSponsorship);
  const [reason, setReason] = useState<keyof typeof CANCEL_REASONS | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = s.status === "pending_payment";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await cancel({
          data: {
            id: s.id,
            ...(reason ? { reason } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
          },
        });
        setBusy(false);
        if (!res.ok) return void toast.error(res.error);
        toast.success(
          res.immediate
            ? "أُلغيت الكفالة"
            : `سُجّل الإنهاء — تبقى الكفالة جاريةً حتى ${formatDate(res.effectiveAt)}`,
        );
        await onDone();
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {pending ? "إلغاء طلب كفالة" : "إنهاء كفالة"} {isolate(name)}
        </DialogTitle>
        <DialogDescription className="leading-7">
          {pending ? (
            <>لم يُدفع شيءٌ بعد، فيُلغى الطلب الآن ولا يُطلب منك تحويل.</>
          ) : (
            <>
              {formatMoney(s.amount, s.currency)} شهرياً. لا تنتهي الكفالة فوراً: تبقى جاريةً حتى
              آخر الشهر الذي دفعته فيصل الطفلَ كاملاً، ثم تنتهي ولا يُحصَّل منك شيءٌ بعدها.
              {card && " ويُلغى اشتراك البطاقة لدى مزوّد الدفع عند نهاية الدورة نفسها."} تُبلَّغ جهة
              الرعاية والإدارة بموعد الانتهاء.
            </>
          )}
        </DialogDescription>
      </DialogHeader>

      {!pending && !card && (
        <div className="mt-4 rounded-xl bg-secondary/60 p-3 text-sm leading-7">
          إن كان الظرف مؤقّتاً أو المبلغ ثقيلاً، فهناك بديلان:
          <div className="mt-2 flex flex-wrap gap-2">
            {s.status === "active" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onAlternative("pause")}
              >
                أوقفها مؤقّتاً
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onAlternative("amount")}
            >
              خفّض المبلغ
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        <div>
          <Label htmlFor="cancel-reason">السبب (اختياري)</Label>
          <select
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
            className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm"
          >
            <option value="">لا أريد ذكر سبب</option>
            {(Object.keys(CANCEL_REASONS) as Array<keyof typeof CANCEL_REASONS>).map((k) => (
              <option key={k} value={k}>
                {CANCEL_REASONS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="cancel-note">كلمةٌ للجهة (اختياري)</Label>
          <Textarea
            id="cancel-note"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1.5"
          />
        </div>
      </div>

      <DialogFooter className="mt-6 gap-2">
        <Button type="submit" variant="destructive" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {pending ? "ألغِ الطلب" : "أنهِ الكفالة آخر الشهر المدفوع"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function PauseForm({
  s,
  name,
  onDone,
}: {
  s: MySponsorship;
  name: string;
  onDone: () => Promise<void>;
}) {
  const pause = useServerFn(pauseSponsorship);
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await pause({ data: { id: s.id, months } });
        setBusy(false);
        if (!res.ok) return void toast.error(res.error);
        toast.success(`أُوقفت مؤقّتاً — تُستأنف في ${formatDate(res.pausedUntil)}`);
        await onDone();
      }}
    >
      <DialogHeader>
        <DialogTitle>إيقاف كفالة {isolate(name)} مؤقّتاً</DialogTitle>
        <DialogDescription className="leading-7">
          يبدأ الإيقاف بعد آخر شهرٍ دفعته، ولا يُنتظر منك تحويلٌ خلاله، ثم تُستأنف الكفالة تلقائياً.
          يبقى مكانك مع الطفل، وتعلم جهة الرعاية بمدّة الإيقاف. يمكنك الاستئناف قبل ذلك متى شئت.
        </DialogDescription>
      </DialogHeader>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium">المدّة</legend>
        <div className="mt-2 flex gap-2">
          {[1, 2, 3].map((m) => (
            <Button
              key={m}
              type="button"
              variant={months === m ? "default" : "outline"}
              aria-pressed={months === m}
              onClick={() => setMonths(m)}
            >
              {m === 1 ? "شهر" : m === 2 ? "شهران" : "ثلاثة أشهر"}
            </Button>
          ))}
        </div>
      </fieldset>
      <DialogFooter className="mt-6">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          أوقفها مؤقّتاً
        </Button>
      </DialogFooter>
    </form>
  );
}

function AmountForm({
  s,
  name,
  onDone,
}: {
  s: MySponsorship;
  name: string;
  onDone: () => Promise<void>;
}) {
  const change = useServerFn(changeSponsorshipAmount);
  const [value, setValue] = useState(String(Math.round(Number(s.amount))));
  const [busy, setBusy] = useState(false);
  const amount = Number(value);
  const valid = Number.isInteger(amount) && amount >= 5 && amount <= 100000;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        const res = await change({ data: { id: s.id, amount } });
        setBusy(false);
        if (!res.ok) return void toast.error(res.error);
        toast.success("تغيّر المبلغ — يسري من التحويل القادم");
        await onDone();
      }}
    >
      <DialogHeader>
        <DialogTitle>تعديل مبلغ كفالة {isolate(name)}</DialogTitle>
        <DialogDescription className="leading-7">
          المبلغ الحالي {formatMoney(s.amount, s.currency)} شهرياً. الجديد يسري من التحويل القادم،
          وما دُفع قبله لا يتغيّر. تعلم جهة الرعاية بالتعديل.
        </DialogDescription>
      </DialogHeader>
      <div className="mt-4">
        <Label htmlFor="new-amount">المبلغ الشهري الجديد ({s.currency})</Label>
        <Input
          id="new-amount"
          dir="ltr"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
          className="mt-1.5"
          aria-invalid={!valid}
        />
        {!valid && <p className="mt-1 text-xs text-destructive">مبلغٌ صحيح من 5 فأكثر.</p>}
      </div>
      <DialogFooter className="mt-6">
        <Button type="submit" disabled={busy || !valid}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          احفظ المبلغ
        </Button>
      </DialogFooter>
    </form>
  );
}
