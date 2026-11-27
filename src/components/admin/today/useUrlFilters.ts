import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import { filtersFrom, type Filters } from "./queue";

export const FILTER_KEYS = ["kind", "country", "sev", "age", "settle", "q"] as const;

/** المرشّحات في عنوان الصفحة: تُنسخ وتُشارَك، والرجوع يعيدها. */
export function useUrlFilters(): [Filters, (patch: Partial<Filters>) => void] {
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const navigate = useNavigate();
  const filters = useMemo(() => filtersFrom(search), [search]);
  const set = useCallback(
    (patch: Partial<Filters>) => {
      void navigate({
        to: ".",
        replace: true,
        search: ((prev: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...prev };
          for (const k of FILTER_KEYS) {
            if (!(k in patch)) continue;
            const v = patch[k];
            if (v === "" || v === false || v === undefined) delete next[k];
            else next[k] = v === true ? 1 : v;
          }
          return next;
        }) as never,
      } as never);
    },
    [navigate],
  );
  return [filters, set];
}
