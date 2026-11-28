import { createLazyFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AskView } from "@/components/ask/AskView";
import { cardsQuery } from "./ask";

export const Route = createLazyFileRoute("/ask")({
  component: AskPage,
});

function AskPage() {
  const { child } = Route.useSearch();
  const { data } = useSuspenseQuery(cardsQuery);
  // Only the allowlisted public-card fields reach the picker: the code and the published name.
  const topics = data.rows.map((row) => ({ id: row.id, code: row.code, name: row.display_name }));
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <AskView topics={topics} initial={child} failed={Boolean(data.error)} />
      </main>
      <SiteFooter />
    </div>
  );
}
