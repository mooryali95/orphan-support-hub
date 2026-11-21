import { createFileRoute } from "@tanstack/react-router";

import { TryShell } from "@/components/try/TryShell";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy } from "@/lib/locale";

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
  component: TryShell,
});

const COPY = defineCopy("routes/try", {
  ar: {
    section: "جرّب المنصّة",
    description: "تجربةٌ كاملة لرحلة الكفالة ببياناتٍ افتراضية، دون حسابٍ ودون أي خصم.",
  },
  en: {
    section: "Try the platform",
    description:
      "The complete sponsorship journey with sample data. No account, and nothing is charged.",
  },
});
