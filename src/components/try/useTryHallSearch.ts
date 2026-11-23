import { useRouterState } from "@tanstack/react-router";

import { hallEntry, type HallSearch } from "@/lib/hall/source";
import { tryChild } from "@/lib/try-demo";

/**
 * the search every trial page's link into the hall carries: the trial, the country the visitor is
 * looking at (the support map's `c`, or the country of the trial child on screen), and this page
 * with its search, so leaving the hall returns here with what they had chosen.
 */
export function useTryHallSearch(): HallSearch {
  const at = useRouterState({ select: (s) => s.location });
  return hallEntry(
    { pathname: at.pathname, search: at.search as Record<string, unknown>, href: at.href },
    { try: 1 },
    ({ pathname, search }) => {
      const id = /^\/try\/(try-\w\w)\/?$/.exec(pathname)?.[1] ?? search["child"];
      return typeof id === "string" ? tryChild(id)?.co : undefined;
    },
  );
}
