import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SupporterAssistant } from "@/components/SupporterAssistant";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listOrphanCards } from "@/lib/protection.functions";
import { pageTitle } from "@/config/brand";
import { useState } from "react";

const cardsQuery = queryOptions({
  queryKey: ["assistant-public-cards"],
  queryFn: () => listOrphanCards({ data: { limit: 60 } }),
});
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
  component: AskPage,
});
function AskPage() {
  const { child } = Route.useSearch();
  const [selected, setSelected] = useState(child ?? "general");
  const { data } = useSuspenseQuery(cardsQuery);
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-14">
          <aside className="min-w-0">
            <p className="mb-3 text-sm font-medium text-primary">اسأل باطمئنان</p>
            <h1 className="text-3xl font-semibold leading-relaxed">مساعد الداعمين</h1>
            <label htmlFor="assistant-file" className="mt-6 mb-2 block text-sm font-medium">
              موضوع السؤال
            </label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger id="assistant-file" aria-label="موضوع السؤال">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">خطوات الكفالة</SelectItem>
                {child && !data.rows.some((row) => row.id === child) && (
                  <SelectItem value={child}>الملف المحدد</SelectItem>
                )}
                {data.rows.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.code} · {row.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {data.error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                تعذّر تحميل قائمة الملفات؛ يمكنك السؤال عن خطوات الكفالة.
              </p>
            )}
          </aside>
          <div className="min-w-0">
            <SupporterAssistant {...(selected !== "general" ? { orphanId: selected } : {})} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
