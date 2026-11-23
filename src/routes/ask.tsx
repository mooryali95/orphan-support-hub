import { createFileRoute } from "@tanstack/react-router";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { listOrphanCards } from "@/lib/protection.functions";
import { pageTitle } from "@/config/brand";

export const cardsQuery = queryOptions({
  queryKey: ["assistant-public-cards"],
  queryFn: () => listOrphanCards({ data: { limit: 60 } }),
});
// المكوّن في ask.lazy.tsx: المساعد ومكتباته يُحمَّلان عند فتح الصفحة وحدها،
// فلا يثقلان حزمة بقية الصفحات.
export const Route = createFileRoute("/ask")({
  validateSearch: (search: Record<string, unknown>) => {
    const child = z.string().uuid().safeParse(search["child"]);
    return child.success ? { child: child.data } : {};
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(cardsQuery),
  head: () => ({
    meta: [
      { title: pageTitle("مساعد الداعمين") },
      {
        name: "description",
        content:
          "أسئلة وإجابات عن ملفات الأيتام المنشورة وخطوات الكفالة، مع حماية معلومات الأطفال الخاصة.",
      },
      { property: "og:title", content: pageTitle("مساعد الداعمين") },
      {
        property: "og:description",
        content: "إجابات عن المعلومات المنشورة وخطوات الكفالة للداعمين.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});
