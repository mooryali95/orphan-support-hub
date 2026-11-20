import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { FlaskConical, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { TryJourneyGuide } from "@/components/try/TryJourneyGuide";
import { pageTitle } from "@/config/brand";
import { dirOf, useLocale } from "@/lib/locale";
import { resetGifts } from "@/lib/try-demo";

/**
 * «جرّب المنصّة»: رحلة الداعم كاملةً للعميل بلا حساب ولا دفعٍ حقيقي — أطفالٌ افتراضيون،
 * ودفعٌ محاكى، و«أثري» من كفالاتٍ محفوظة في المتصفّح. منفصلةٌ عن الدليل والدفع الحقيقيين.
 */
export const Route = createFileRoute("/try")({
  head: () => ({
    meta: [
      { title: pageTitle("جرّب المنصّة") },
      {
        name: "description",
        content: "تجربةٌ كاملة لرحلة الكفالة ببياناتٍ افتراضية، دون حسابٍ ودون أي خصم.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TryLayout,
});

function TryLayout() {
  // نصوص التجربة عربيةٌ كلّها اليوم. فإن كانت لغة الواجهة غيرها أُعلن ذلك على الجزء
  // نفسه: قارئ الشاشة ينطقه بالعربية، والسطور والأسهم تأخذ اتجاهها الصحيح.
  const arabicPart = dirOf(useLocale()) === "rtl" ? {} : { lang: "ar", dir: "rtl" as const };
  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <div role="note" {...arabicPart} className="border-b border-bridge/25 bg-bridge/8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm">
          <span className="inline-flex items-center gap-2 font-bold text-bridge-ink">
            <FlaskConical className="size-4" aria-hidden="true" />
            وضع التجربة
          </span>
          <span className="order-last basis-full leading-6 text-foreground sm:order-none sm:flex-1 sm:basis-auto">
            <span className="sm:hidden">بياناتٌ افتراضية، ولا يُخصم شيء.</span>
            <span className="hidden sm:inline">
              الأطفال هنا افتراضيون بأسماءٍ مستعارة، والدفع محاكاة: لا يُخصم أي مبلغ ولا يُرسل شيء.
            </span>
          </span>
          <span className="flex-1 sm:hidden" />
          <TryJourneyGuide />
          <button
            type="button"
            onClick={() => {
              resetGifts();
              // بلا هذا لا يتغيّر شيءٌ أمام الزائر خارج «أثري»، فلا يعرف أنّ ضغطته سُجّلت.
              toast.success("بدأت التجربة من جديد");
            }}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">ابدأ من جديد</span>
            <span className="sr-only sm:hidden">ابدأ من جديد</span>
          </button>
        </div>
      </div>
      <main
        id="main"
        tabIndex={-1}
        {...arabicPart}
        className="try-page mx-auto max-w-6xl px-4 py-10"
      >
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
