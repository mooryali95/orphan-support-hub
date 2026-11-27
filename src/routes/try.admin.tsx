import { createFileRoute } from "@tanstack/react-router";

import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy } from "@/lib/locale";

// المكوّن في try.admin.lazy.tsx: يُحمَّل حين تُفتح الصفحة وحدها.
const TITLE = defineCopy("routes/try.admin.title", {
  ar: { title: "الإدارة: عرض تفاعلي" },
  en: { title: "Administration: interactive demo" },
});

/** `?country=PK` يفتح مصادر التحقق لتلك الدولة: روابط مركز الثقة في القصّة تصل إلى مكانها. */
export type TryAdminSearch = { country?: string };

export const Route = createFileRoute("/try/admin")({
  validateSearch: (raw: Record<string, unknown>): TryAdminSearch =>
    typeof raw["country"] === "string" && /^[A-Z]{2}$/.test(raw["country"])
      ? { country: raw["country"] }
      : {},
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
