import { createFileRoute, Outlet } from "@tanstack/react-router";
import { FlaskConical, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { TryJourneyGuide } from "@/components/try/TryJourneyGuide";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";
import { resetGifts } from "@/lib/try-demo";

/**
 * «جرّب المنصّة»: رحلة الداعم كاملةً للعميل بلا حساب ولا دفعٍ حقيقي — أطفالٌ افتراضيون،
 * ودفعٌ محاكى، و«أثري» من كفالاتٍ محفوظة في المتصفّح. منفصلةٌ عن الدليل والدفع الحقيقيين.
 */
export const Route = createFileRoute("/try")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const c = copyOf(COPY, l);
    return {
      meta: [
        { title: pageTitle(c.section, true, l) },
        { name: "description", content: c.description },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: TryLayout,
});

const COPY = defineCopy("routes/try", {
  ar: {
    section: "جرّب المنصّة",
    description: "تجربةٌ كاملة لرحلة الكفالة ببياناتٍ افتراضية، دون حسابٍ ودون أي خصم.",
    mode: "وضع التجربة",
    noteShort: "بياناتٌ افتراضية، ولا يُخصم شيء.",
    noteLong:
      "الأطفال هنا افتراضيون بأسماءٍ مستعارة، والدفع محاكاة: لا يُخصم أي مبلغ ولا يُرسل شيء.",
    restarted: "بدأت التجربة من جديد",
    restart: "ابدأ من جديد",
  },
  en: {
    section: "Try the platform",
    description:
      "The complete sponsorship journey with sample data. No account, and nothing is charged.",
    mode: "Trial mode",
    noteShort: "Sample data. Nothing is charged.",
    noteLong:
      "The children here are fictional, under pseudonyms, and payment is simulated: nothing is charged and nothing is sent.",
    restarted: "The trial has started over",
    restart: "Start over",
  },
});

function TryLayout() {
  const c = useCopy(COPY);
  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <div role="note" className="border-b border-bridge/25 bg-bridge/8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm">
          <span className="inline-flex items-center gap-2 font-bold text-bridge-ink">
            <FlaskConical className="size-4" aria-hidden="true" />
            {c.mode}
          </span>
          <span className="order-last basis-full leading-6 text-foreground sm:order-none sm:flex-1 sm:basis-auto">
            <span className="sm:hidden">{c.noteShort}</span>
            <span className="hidden sm:inline">{c.noteLong}</span>
          </span>
          <span className="flex-1 sm:hidden" />
          <TryJourneyGuide />
          <button
            type="button"
            onClick={() => {
              resetGifts();
              // بلا هذا لا يتغيّر شيءٌ أمام الزائر خارج «أثري»، فلا يعرف أنّ ضغطته سُجّلت.
              toast.success(c.restarted);
            }}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{c.restart}</span>
            <span className="sr-only sm:hidden">{c.restart}</span>
          </button>
        </div>
      </div>
      <main id="main" tabIndex={-1} className="try-page mx-auto max-w-6xl px-4 py-10">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
