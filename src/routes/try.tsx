import { createFileRoute } from "@tanstack/react-router";

import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy } from "@/lib/locale";

/**
 * «جرّب المنصّة»: رحلة الداعم كاملةً للعميل بلا حساب ولا دفعٍ حقيقي — أطفالٌ افتراضيون،
 * ودفعٌ محاكى، و«أثري» من كفالاتٍ محفوظة في المتصفّح. منفصلةٌ عن الدليل والدفع الحقيقيين.
 */
// الغلاف (TryShell) في try.lazy.tsx: لا يدخل الحزمة المشتركة لكلّ الصفحات.
export const Route = createFileRoute("/try")({
  // كتالوج بقية الدول يُحمَّل هنا قبل أيّ قراءة، فلا يدخل حزمة الدخول ويجده كل ما تحت «جرّب».
  beforeLoad: () =>
    Promise.all([
      import("@/lib/try-places"),
      import("@/lib/try-cycle"),
      // نسخ مركز الكافل التجريبية في منفذ البيانات: تُسجَّل قبل أن تُرسم أيّ شاشة تحت «جرّب».
      import("@/lib/try-sponsor-center"),
    ]).then(() => {}),
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
});

const COPY = defineCopy("routes/try", {
  ar: {
    section: "جرّب المنصّة",
    description: "تجربةٌ كاملة لرحلة الكفالة ببياناتٍ نموذجية، دون حسابٍ ودون أي خصم.",
  },
  en: {
    section: "Try the platform",
    description:
      "The complete sponsorship journey with sample data. No account, and nothing is charged.",
  },
});
