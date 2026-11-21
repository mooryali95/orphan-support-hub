import { createFileRoute } from "@tanstack/react-router";

import { TrySupportMap } from "@/components/try/TrySupportMap";
import { pageTitle } from "@/config/brand";
import { copyOf, defineCopy } from "@/lib/locale";

type Search = { c?: string; r?: string; kind?: "qualification" | "in_kind"; child?: string };

/*
 * The search is checked by shape only here: this runs in the entry bundle, which stays free of
 * the trial's places and pledges. `TrySupportMap` resolves each value against the source and
 * ignores what is not in it.
 */
const text = (v: unknown, shape: RegExp) => (typeof v === "string" && shape.test(v) ? v : null);

export const Route = createFileRoute("/try/support")({
  validateSearch: (raw: Record<string, unknown>): Search => {
    const out: Search = {};
    const c = text(raw["c"], /^[A-Z]{2}$/);
    const r = text(raw["r"], /^[A-Z]{3}-\d{1,5}$/);
    const child = text(raw["child"], /^try-\w\w$/);
    const kind = raw["kind"];
    if (c) out.c = c;
    if (c && r) out.r = r;
    if (kind === "qualification" || kind === "in_kind") out.kind = kind;
    if (child) out.child = child;
    return out;
  },
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return { meta: [{ title: pageTitle(copyOf(COPY, l).pageTitle, false, l) }] };
  },
  component: TrySupport,
});

const COPY = defineCopy("routes/try.support", {
  ar: { pageTitle: "ادعم من الخريطة · جرّب المنصّة" },
  en: { pageTitle: "Support from the map · Try the platform" },
});

function TrySupport() {
  const { c, r, kind, child } = Route.useSearch();
  return <TrySupportMap country={c} region={r} kind={kind} child={child} />;
}
