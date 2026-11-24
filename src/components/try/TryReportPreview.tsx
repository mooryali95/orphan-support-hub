import { FileCheck2, HandCoins, MessageSquareText, ScrollText, Send } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { TRY_CURRENCY, type TryChild } from "@/lib/try-demo";

const COPY = defineCopy("components/try/TryReportPreview", {
  ar: {
    transferTitle: "حُوِّل عطاؤك إلى الجهة الميدانية",
    transferText: (amount: string) => `${amount} في الأسبوع الأول من الشهر، برقم تحويلٍ تراه.`,
    deliveredTitle: (name: string) => `سُلِّم لـ${name} بمستند`,
    deliveredText: "إيصال استلامٍ موقَّع من وليّ الأمر، مرفوعٌ في ملفّ الكفالة.",
    spentTitle: "فيمَ صُرف",
    spentText: (covers: string) => `${covers}.`,
    noteTitle: "كلمة المشرف",
    noteText: (name: string) => `«${name} مواظبٌ هذا الشهر، وتحسّن حضوره وتحصيله.»`,
    trigger: "هذا ما يصلك كل شهر",
    triggerHint: "شاهد نموذج التقرير الشهري قبل أن تبدأ",
    title: "تقرير الشهر",
    sample: "نموذج",
    description: (name: string) => `كفالة ${name} · يصلك مثله كل شهر في «أثري» وعلى بريدك.`,
    footnote: "نموذجٌ للتوضيح. في المنصّة الحقيقية يحمل التقرير تواريخه ومستنداته الفعلية.",
  },
  en: {
    transferTitle: "Your gift was transferred to the field organization",
    transferText: (amount: string) =>
      `${amount} in the first week of the month, with a transfer reference you can see.`,
    deliveredTitle: (name: string) => `Delivered to ${name}, with a receipt`,
    deliveredText: "A receipt signed by the guardian, filed in the sponsorship record.",
    spentTitle: "How it was spent",
    spentText: (covers: string) => `${covers}.`,
    noteTitle: "A note from the supervisor",
    noteText: (name: string) =>
      `“${name} attended regularly this month, and both attendance and results improved.”`,
    trigger: "What you receive each month",
    triggerHint: "See a sample monthly report before you begin",
    title: "Monthly report",
    sample: "Sample",
    description: (name: string) =>
      `${name}'s sponsorship · one like this reaches you each month in “My impact” and by email.`,
    footnote:
      "An illustrative sample. On the live platform, the report carries its actual dates and documents.",
  },
});

/**
 * «هذا ما يصلك كل شهر»: نموذجُ التقرير الشهري قبل الدفع، ليعرف الداعم ما سيراه بعده. نموذجٌ
 * افتراضي صريح، بلا تواريخ حقيقية ولا مستندٍ حقيقي.
 */
export function TryReportPreview({ child, amount }: { child: TryChild; amount: number }) {
  const locale = useLocale();
  const c = useCopy(COPY);
  const rows = [
    {
      icon: Send,
      title: c.transferTitle,
      text: c.transferText(formatMoney(amount, TRY_CURRENCY, locale)),
    },
    {
      icon: FileCheck2,
      title: c.deliveredTitle(child.name),
      text: c.deliveredText,
    },
    {
      icon: HandCoins,
      title: c.spentTitle,
      text: c.spentText(child.covers),
    },
    {
      icon: MessageSquareText,
      title: c.noteTitle,
      text: c.noteText(child.name),
    },
  ];
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="mt-4 flex min-h-11 w-full items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-start text-sm transition-colors hover:bg-secondary"
        >
          <ScrollText className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="block font-bold">{c.trigger}</span>
            <span className="block text-xs text-muted-foreground">{c.triggerHint}</span>
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pe-6">
            <DialogTitle className="font-display text-2xl">{c.title}</DialogTitle>
            <span className="rounded-full bg-bridge/10 px-3 py-1 text-xs font-bold text-bridge-ink">
              {c.sample}
            </span>
          </div>
          <DialogDescription className="leading-7">{c.description(child.name)}</DialogDescription>
        </DialogHeader>
        <ol className="relative mt-1 space-y-4 before:absolute before:inset-y-3 before:start-[1.1875rem] before:w-px before:bg-border">
          {rows.map((r) => (
            <li key={r.title} className="flex gap-3">
              <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full border border-border bg-card text-primary">
                <r.icon className="size-4.5" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-bold">{r.title}</span>
                <span className="mt-0.5 block text-sm leading-6 text-muted-foreground">
                  {r.text}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2 rounded-xl border border-dashed border-border p-3 text-xs leading-6 text-muted-foreground">
          {c.footnote}
        </p>
      </DialogContent>
    </Dialog>
  );
}
