import { useState } from "react";
import { useDataFn, useDataKey } from "@/lib/data-port";
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
import { useLedger } from "@/components/sponsorship/ledger-query";
import { formatDate, formatMoney, isolate } from "@/lib/format";
import { coverageWith, endsOn, resumesOn } from "@/lib/sponsor-center";
import { defineCopy, pluralOf, useCopy, useLocale } from "@/lib/locale";

const COPY = defineCopy("components/sponsorship/SponsorshipControls", {
  ar: {
    child: "الطفل",
    resumed: "استُؤنفت الكفالة",
    resumeNow: "استئناف الآن",
    pause: "إيقاف مؤقّت",
    changeAmount: "تعديل المبلغ",
    cancelRequest: "إلغاء الطلب",
    endSponsorship: "إنهاء الكفالة",
    cancel: {
      cancelled: "أُلغيت الكفالة",
      ending: (date: string) => `سُجّل الإنهاء: تبقى الكفالة جاريةً حتى ${date}`,
      titlePending: (name: string) => `إلغاء طلب كفالة ${name}`,
      title: (name: string) => `إنهاء كفالة ${name}`,
      leadPending: "لم يُدفع شيءٌ بعد، فيُلغى الطلب الآن ولا يُطلب منك تحويل.",
      lead: (money: string) =>
        `${money} شهرياً. لا تنتهي الكفالة فوراً: تبقى جاريةً حتى آخر الشهر الذي دفعته فيصل الطفلَ كاملاً، ثم تنتهي ولا يُحصَّل منك شيءٌ بعدها.`,
      card: "ويُلغى اشتراك البطاقة لدى مزوّد الدفع عند نهاية الدورة نفسها.",
      notify: "تُبلَّغ الجهة الميدانية والإدارة بموعد الانتهاء.",
      alternatives: "إن كان الظرف مؤقّتاً أو المبلغ ثقيلاً، فهناك بديلان:",
      pauseInstead: "أوقفها مؤقّتاً",
      lowerAmount: "خفّض المبلغ",
      reason: "السبب (اختياري)",
      noReason: "لا أريد ذكر سبب",
      reasons: {
        financial: "ظرفٌ مالي",
        another_child: "أريد كفالة طفلٍ آخر",
        dissatisfied: "لست راضياً عن المتابعة",
        temporary: "أحتاج توقّفاً مؤقّتاً",
        other: "سببٌ آخر",
      } satisfies Record<keyof typeof CANCEL_REASONS, string>,
      note: "كلمةٌ للجهة (اختياري)",
      submitPending: "ألغِ الطلب",
      submit: "أنهِ الكفالة آخر الشهر المدفوع",
      effective: (date: string) => `تنتهي الكفالة في ${date}.`,
      effectiveNow: "يُلغى الطلب فور التأكيد.",
      stays: "يبقى ملفّ الطفل في رعاية الندوة وجهتها الميدانية بعد الإنهاء.",
    },
    pauseForm: {
      paused: (date: string) => `أُوقفت مؤقّتاً: تُستأنف في ${date}`,
      title: (name: string) => `إيقاف كفالة ${name} مؤقّتاً`,
      lead: "يبدأ الإيقاف بعد آخر شهرٍ دفعته، ولا يُنتظر منك تحويلٌ خلاله، ثم تُستأنف الكفالة تلقائياً. يبقى مكانك مع الطفل، وتعلم الجهة الميدانية بمدّة الإيقاف. يمكنك الاستئناف قبل ذلك متى شئت.",
      duration: "المدّة",
      months: pluralOf(
        { one: "شهر", two: "شهران", few: "{0} أشهر", many: "{0} شهراً", other: "{0} شهر" },
        0,
        "ar",
      ),
      submit: "أوقفها مؤقّتاً",
      resumesOn: (date: string) => `تُستأنف في ${date}.`,
    },
    amountForm: {
      changed: "تغيّر المبلغ: يسري من التحويل القادم",
      title: (name: string) => `تعديل مبلغ كفالة ${name}`,
      lead: (money: string) =>
        `المبلغ الحالي ${money} شهرياً. الجديد يسري من التحويل القادم، وما دُفع قبله لا يتغيّر. تعلم الجهة الميدانية بالتعديل.`,
      label: (currency: string) => `المبلغ الشهري الجديد (${currency})`,
      invalid: "مبلغٌ صحيح من 5 فأكثر.",
      submit: "احفظ المبلغ",
      coverage: (name: string, pct: number) => `ستُغطّى حاجة ${name} الشهرية بنسبة ${pct}%.`,
    },
  },
  en: {
    child: "the child",
    resumed: "Sponsorship resumed",
    resumeNow: "Resume now",
    pause: "Pause",
    changeAmount: "Change amount",
    cancelRequest: "Cancel request",
    endSponsorship: "End sponsorship",
    cancel: {
      cancelled: "Sponsorship cancelled",
      ending: (date: string) => `Ending recorded: the sponsorship continues until ${date}`,
      titlePending: (name: string) => `Cancel the sponsorship request for ${name}`,
      title: (name: string) => `End the sponsorship of ${name}`,
      leadPending:
        "Nothing has been paid yet, so the request is cancelled now and no transfer is expected from you.",
      lead: (money: string) =>
        `${money} a month. The sponsorship does not end at once: it continues until the end of the month you paid for, so the child receives it in full, then it ends and nothing more is charged.`,
      card: "Your card subscription with the payment provider is cancelled at the end of the same cycle.",
      notify: "The field organization and the administration are told the end date.",
      alternatives:
        "If the situation is temporary or the amount feels heavy, there are two alternatives:",
      pauseInstead: "Pause it",
      lowerAmount: "Lower the amount",
      reason: "Reason (optional)",
      noReason: "I'd rather not say",
      reasons: {
        financial: "Financial circumstances",
        another_child: "I want to sponsor another child",
        dissatisfied: "I'm not satisfied with the follow-up",
        temporary: "I need a temporary break",
        other: "Another reason",
      } satisfies Record<keyof typeof CANCEL_REASONS, string>,
      note: "A note for the organization (optional)",
      submitPending: "Cancel the request",
      submit: "End at the close of the paid month",
      effective: (date: string) => `The sponsorship ends on ${date}.`,
      effectiveNow: "The request is cancelled as soon as you confirm.",
      stays: "The child's file stays in care with WAMY and its field organization after it ends.",
    },
    pauseForm: {
      paused: (date: string) => `Paused: resumes on ${date}`,
      title: (name: string) => `Pause the sponsorship of ${name}`,
      lead: "The pause starts after the last month you paid for, no transfer is expected during it, and the sponsorship then resumes automatically. Your place with the child is kept, and the field organization is told how long the pause lasts. You can resume earlier whenever you like.",
      duration: "Duration",
      months: pluralOf({ one: "{0} month", other: "{0} months" }),
      submit: "Pause it",
      resumesOn: (date: string) => `Resumes on ${date}.`,
    },
    amountForm: {
      changed: "Amount changed: it applies from the next transfer",
      title: (name: string) => `Change the amount for ${name}`,
      lead: (money: string) =>
        `The current amount is ${money} a month. The new amount applies from the next transfer; what was paid before stays the same. The field organization is told about the change.`,
      label: (currency: string) => `New monthly amount (${currency})`,
      invalid: "Enter a whole amount of 5 or more.",
      submit: "Save amount",
      coverage: (name: string, pct: number) => `${name}'s monthly need will be ${pct}% covered.`,
    },
  },
});

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
  const listKey = useDataKey(["my-sponsorships"]);
  const resume = useDataFn("sponsor.manage.resume", resumeSponsorship);
  const [busy, setBusy] = useState(false);
  const t = useCopy(COPY);
  const name = s.orphan?.display_name ?? t.child;
  const card = Boolean(s.provider_subscription_id);
  const ending = Boolean(s.cancel_effective_at);
  const live = s.status === "active" || s.status === "paused";

  const refresh = () => qc.invalidateQueries({ queryKey: listKey });

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
            toast.success(t.resumed);
            await refresh();
          }}
        >
          {t.resumeNow}
        </Button>
      )}
      {s.status === "active" && !ending && !card && (
        <Button size="sm" variant="outline" onClick={() => setMode("pause")}>
          {t.pause}
        </Button>
      )}
      {!ending && !card && (
        <Button size="sm" variant="outline" onClick={() => setMode("amount")}>
          {t.changeAmount}
        </Button>
      )}
      {!ending && (
        <Button size="sm" variant="ghost" onClick={() => setMode("cancel")}>
          {s.status === "pending_payment" ? t.cancelRequest : t.endSponsorship}
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

export function CancelForm({
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
  const cancel = useDataFn("sponsor.manage.cancel", cancelSponsorship);
  const [reason, setReason] = useState<keyof typeof CANCEL_REASONS | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = s.status === "pending_payment";
  const t = useCopy(COPY).cancel;
  const locale = useLocale();
  const ledger = useLedger(s.id, !pending);
  const ends = endsOn(s, ledger.data?.ledger?.sponsorship.next_charge_at ?? null);

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
        toast.success(res.immediate ? t.cancelled : t.ending(formatDate(res.effectiveAt, locale)));
        await onDone();
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {pending ? t.titlePending(isolate(name)) : t.title(isolate(name))}
        </DialogTitle>
        <DialogDescription className="leading-7">
          {pending ? (
            t.leadPending
          ) : (
            <>
              {t.lead(formatMoney(s.amount, s.currency, locale))}
              {card && ` ${t.card}`} {t.notify}
            </>
          )}
        </DialogDescription>
      </DialogHeader>

      <p className="mt-4 rounded-xl bg-bridge/8 p-3 text-sm leading-7">
        <strong>
          {ends.immediate ? t.effectiveNow : t.effective(formatDate(ends.at, locale))}
        </strong>{" "}
        {t.stays}
      </p>
      {!pending && !card && (
        <div className="mt-4 rounded-xl bg-secondary/60 p-3 text-sm leading-7">
          {t.alternatives}
          <div className="mt-2 flex flex-wrap gap-2">
            {s.status === "active" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onAlternative("pause")}
              >
                {t.pauseInstead}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onAlternative("amount")}
            >
              {t.lowerAmount}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        <div>
          <Label htmlFor="cancel-reason">{t.reason}</Label>
          <select
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
            className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm"
          >
            <option value="">{t.noReason}</option>
            {(Object.keys(CANCEL_REASONS) as Array<keyof typeof CANCEL_REASONS>).map((k) => (
              <option key={k} value={k}>
                {t.reasons[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="cancel-note">{t.note}</Label>
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
          {pending ? t.submitPending : t.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function PauseForm({
  s,
  name,
  onDone,
}: {
  s: MySponsorship;
  name: string;
  onDone: () => Promise<void>;
}) {
  const pause = useDataFn("sponsor.manage.pause", pauseSponsorship);
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const t = useCopy(COPY).pauseForm;
  const locale = useLocale();
  const ledger = useLedger(s.id);
  const resumes = resumesOn(ledger.data?.ledger?.sponsorship.next_charge_at ?? null, months);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await pause({ data: { id: s.id, months } });
        setBusy(false);
        if (!res.ok) return void toast.error(res.error);
        toast.success(t.paused(formatDate(res.pausedUntil, locale)));
        await onDone();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t.title(isolate(name))}</DialogTitle>
        <DialogDescription className="leading-7">{t.lead}</DialogDescription>
      </DialogHeader>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium">{t.duration}</legend>
        <div className="mt-2 flex gap-2">
          {[1, 2, 3].map((m) => (
            <Button
              key={m}
              type="button"
              variant={months === m ? "default" : "outline"}
              aria-pressed={months === m}
              onClick={() => setMonths(m)}
            >
              {t.months(m)}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-sm font-semibold" aria-live="polite">
          {t.resumesOn(formatDate(resumes, locale))}
        </p>
      </fieldset>
      <DialogFooter className="mt-6">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AmountForm({
  s,
  name,
  onDone,
}: {
  s: MySponsorship;
  name: string;
  onDone: () => Promise<void>;
}) {
  const change = useDataFn("sponsor.manage.amount", changeSponsorshipAmount);
  const [value, setValue] = useState(String(Math.round(Number(s.amount))));
  const [busy, setBusy] = useState(false);
  const amount = Number(value);
  const valid = Number.isInteger(amount) && amount >= 5 && amount <= 100000;
  const t = useCopy(COPY).amountForm;
  const locale = useLocale();
  const coverage = coverageWith(s, amount);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        const res = await change({ data: { id: s.id, amount } });
        setBusy(false);
        if (!res.ok) return void toast.error(res.error);
        toast.success(t.changed);
        await onDone();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t.title(isolate(name))}</DialogTitle>
        <DialogDescription className="leading-7">
          {t.lead(formatMoney(s.amount, s.currency, locale))}
        </DialogDescription>
      </DialogHeader>
      <div className="mt-4">
        <Label htmlFor="new-amount">{t.label(s.currency)}</Label>
        <Input
          id="new-amount"
          dir="ltr"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
          className="mt-1.5"
          aria-invalid={!valid}
        />
        {!valid && <p className="mt-1 text-xs text-destructive">{t.invalid}</p>}
        {valid && coverage !== null && (
          <p className="mt-3 text-sm leading-7" aria-live="polite">
            {t.coverage(isolate(name), coverage)}
          </p>
        )}
      </div>
      <DialogFooter className="mt-6">
        <Button type="submit" disabled={busy || !valid}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}
