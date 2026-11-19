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
import { TRY_CURRENCY, type TryChild } from "@/lib/try-demo";

/**
 * «هذا ما يصلك كل شهر»: نموذجُ التقرير الشهري قبل الدفع، ليعرف الداعم ما سيراه بعده. نموذجٌ
 * افتراضي صريح، بلا تواريخ حقيقية ولا مستندٍ حقيقي.
 */
export function TryReportPreview({ child, amount }: { child: TryChild; amount: number }) {
  const rows = [
    {
      icon: Send,
      title: "حُوِّل عطاؤك إلى جهة الرعاية",
      text: `${formatMoney(amount, TRY_CURRENCY, "ar")} في الأسبوع الأول من الشهر، برقم تحويلٍ تراه.`,
    },
    {
      icon: FileCheck2,
      title: `سُلِّم لـ${child.name} بمستند`,
      text: "إيصال استلامٍ موقَّع من وليّ الأمر، مرفوعٌ في ملفّ الكفالة.",
    },
    {
      icon: HandCoins,
      title: "فيمَ صُرف",
      text: `${child.covers}.`,
    },
    {
      icon: MessageSquareText,
      title: "كلمة المشرف",
      text: `«${child.name} مواظبٌ هذا الشهر، وتحسّن حضوره وتحصيله.»`,
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
            <span className="block font-bold">هذا ما يصلك كل شهر</span>
            <span className="block text-xs text-muted-foreground">
              شاهد نموذج التقرير الشهري قبل أن تبدأ
            </span>
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pe-6">
            <DialogTitle className="font-display text-2xl">تقرير الشهر</DialogTitle>
            <span className="rounded-full bg-bridge/10 px-3 py-1 text-xs font-bold text-bridge-ink">
              نموذج
            </span>
          </div>
          <DialogDescription className="leading-7">
            كفالة {child.name} · يصلك مثله كل شهر في «أثري» وعلى بريدك.
          </DialogDescription>
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
          نموذجٌ افتراضي للتوضيح. في المنصّة الحقيقية يحمل التقرير تواريخه ومستنداته الفعلية.
        </p>
      </DialogContent>
    </Dialog>
  );
}
