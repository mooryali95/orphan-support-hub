import { createFileRoute } from "@tanstack/react-router";

import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy } from "@/lib/locale";

// المكوّن في try.admin.lazy.tsx: يُحمَّل حين تُفتح الصفحة وحدها.
const TITLE = defineCopy("routes/try.admin.title", {
  ar: { title: "الإدارة: عرض تفاعلي" },
  en: { title: "Administration: interactive demo" },
});

export const Route = createFileRoute("/try/admin")({
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
