import { createLazyFileRoute } from "@tanstack/react-router";

import { TryStory } from "@/components/try/story/TryStory";

export const Route = createLazyFileRoute("/try/journey")({ component: TryJourneyPage });

function TryJourneyPage() {
  const { as } = Route.useSearch();
  return <TryStory audience={as ?? null} />;
}
