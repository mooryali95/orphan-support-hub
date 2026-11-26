import { createFileRoute } from "@tanstack/react-router";

import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy } from "@/lib/locale";

type Audience = "sponsor" | "partner" | "admin";
type Search = { as?: Audience };

// المكوّن في try.journey.lazy.tsx: يُحمَّل حين تُفتح القصّة وحدها.
const TITLE = defineCopy("routes/try.journey.title", {
  ar: { title: "قصّة الثقة خطوةً خطوة" },
  en: { title: "The trust story, step by step" },
});

export const Route = createFileRoute("/try/journey")({
  validateSearch: (raw: Record<string, unknown>): Search => {
    const as = raw["as"];
    return as === "sponsor" || as === "partner" || as === "admin" ? { as } : {};
  },
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
