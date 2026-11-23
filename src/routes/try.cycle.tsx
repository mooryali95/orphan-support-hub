import { createFileRoute } from "@tanstack/react-router";

import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy } from "@/lib/locale";

// المكوّن في try.cycle.lazy.tsx: يُحمَّل حين تُفتح الصفحة وحدها، فلا يثقل حزمة بقية الصفحات.
const TITLE = defineCopy("routes/try.cycle.title", {
  ar: { title: "الدورة الكاملة" },
  en: { title: "The full cycle" },
});

export const Route = createFileRoute("/try/cycle")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(TITLE, l).title, true, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
});
