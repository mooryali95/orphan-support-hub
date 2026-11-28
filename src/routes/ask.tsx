import { createFileRoute } from "@tanstack/react-router";
import { queryOptions } from "@tanstack/react-query";
import { searchUuid } from "@/lib/search-params";
import { listOrphanCards } from "@/lib/protection.functions";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy } from "@/lib/locale";

export const cardsQuery = queryOptions({
  queryKey: ["assistant-public-cards"],
  queryFn: () => listOrphanCards({ data: { limit: 60 } }),
});

const HEAD = defineCopy("routes/ask", {
  ar: {
    section: "مساعد الداعمين",
    description:
      "أسئلة وإجابات عن ملفات الأيتام المنشورة وخطوات الكفالة، مع حماية معلومات الأطفال الخاصة.",
    ogDescription: "إجابات عن المعلومات المنشورة وخطوات الكفالة للداعمين.",
  },
  en: {
    section: "Supporter assistant",
    description:
      "Questions and answers about published orphan files and sponsorship steps, with children's private information protected.",
    ogDescription: "Answers about published information and sponsorship steps for supporters.",
  },
});

// المكوّن في ask.lazy.tsx: المساعد ومكتباته يُحمَّلان عند فتح الصفحة وحدها،
// فلا يثقلان حزمة بقية الصفحات.
export const Route = createFileRoute("/ask")({
  validateSearch: (search: Record<string, unknown>) => {
    const child = searchUuid(search["child"]);
    return child ? { child } : {};
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(cardsQuery),
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const c = copyOf(HEAD, l);
    const title = pageTitle(c.section, true, l);
    return {
      meta: [
        { title },
        { name: "description", content: c.description },
        { property: "og:title", content: title },
        { property: "og:description", content: c.ogDescription },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
});
