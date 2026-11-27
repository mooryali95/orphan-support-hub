import { createFileRoute } from "@tanstack/react-router";

import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy } from "@/lib/locale";

// المكوّن في try.country.lazy.tsx: يُحمَّل حين تُفتح الصفحة وحدها.
const TITLE = defineCopy("routes/try.country.title", {
  ar: { title: "فريق الدولة: عرض تفاعلي" },
  en: { title: "Country team: interactive demo" },
});

export const Route = createFileRoute("/try/country")({
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
