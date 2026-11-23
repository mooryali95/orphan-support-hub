import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { getMyWorkspaces } from "@/lib/workspaces.functions";
import {
  availableModes,
  modeOfPath,
  resolveMode,
  VIEW_MODE_EVENT,
  VIEW_MODE_KEY,
  type ViewMode,
} from "@/lib/view-mode";

function readStored(): string | null {
  try {
    return window.localStorage.getItem(VIEW_MODE_KEY);
  } catch {
    return null;
  }
}

function writeStored(mode: ViewMode) {
  try {
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    /* التخزين محجوب: يبقى الوضع لهذه الصفحة وحدها */
  }
  window.dispatchEvent(new CustomEvent(VIEW_MODE_EVENT, { detail: mode }));
}

/**
 * وضع العرض الفعّال للحساب.
 *
 * صفحةٌ لدورٍ بعينه تفرض وضعها (فتح /admin يعني وضع الإدارة)، والصفحات
 * المشتركة تتبع الوضع المحفوظ في هذا الجهاز. التبديل صريحٌ من `setMode`.
 */
export function useViewMode() {
  const { user, roles } = useAuth();
  const fetchWorkspaces = useServerFn(getMyWorkspaces);
  const { data: wsRes } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => fetchWorkspaces(),
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  });
  const workspaces = wsRes?.workspaces ?? null;
  const modes = useMemo(() => availableModes({ roles, workspaces }), [roles, workspaces]);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [stored, setStored] = useState<string | null>(null);
  useEffect(() => {
    setStored(readStored());
    const on = (e: Event) => setStored((e as CustomEvent<string>).detail ?? readStored());
    window.addEventListener(VIEW_MODE_EVENT, on);
    return () => window.removeEventListener(VIEW_MODE_EVENT, on);
  }, []);

  const routeMode = modeOfPath(pathname);
  const mode: ViewMode =
    routeMode && modes.includes(routeMode) ? routeMode : resolveMode(stored, modes);

  // صفحة الدور تُثبّت وضعها، فتبقى الصفحات المشتركة بعدها على الوضع نفسه.
  useEffect(() => {
    if (routeMode && modes.includes(routeMode) && stored !== routeMode) writeStored(routeMode);
  }, [routeMode, modes, stored]);

  const setMode = useCallback((next: ViewMode) => writeStored(next), []);

  return { mode, modes, setMode, workspaces, signedIn: Boolean(user) };
}
