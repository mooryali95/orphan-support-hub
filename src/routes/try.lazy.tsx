import { createLazyFileRoute } from "@tanstack/react-router";

import { TryShell } from "@/components/try/TryShell";

export const Route = createLazyFileRoute("/try")({ component: TryShell });
