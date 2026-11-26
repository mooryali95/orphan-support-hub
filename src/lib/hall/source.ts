/**
 * قاعة الأثر (الوضع الغامر) والصفحات العادية منتجٌ واحد: هذا الملفّ هو الموضع الواحد الذي
 * يقرّر من أين تقرأ القاعة، وإلى أين تعود.
 *
 *   - الداعم: من دخل من لوحته (`?me=1`) يرى أثره هو، من كفالاته نفسها التي تقرؤها اللوحة
 *     (`./donor`). لا كتالوج تجربة ولا أرقام نموذجية في هذا الوضع، أيّاً كان وضع المنصّة.
 *   - التجربة: كتالوج التجربة الواحد (`./trial`، وهو ما تقرؤه صفحات «جرّب»).
 *   - الحقيقي: مصادر الصفحات نفسها — أعداد الدليل من `geoQuery` (ما تقرؤه الخريطة والدليل،
 *     بحجب الأعداد الصغيرة نفسه)، والدول المتّصلة من `getOperatingLinks` (ما تقرؤه شبكة الرؤية).
 *
 * خالصٌ وخفيف: يدخل حزمة الدخول مع `routes/hall.tsx`، فلا يستورد كتالوجاً ولا مشهداً.
 */
import type { Geo, GeoCountry } from "@/lib/geo";
import { TRIAL_ENABLED, trialRoute } from "@/lib/trial-gate";

export type HallSearch = {
  /** opens the hall on the trial catalogue */
  try?: 1;
  /** the donor's own hall: entered from their dashboard, it shows their real sponsorships */
  me?: 1;
  /** the concept hall on the real directory's counts: only by this explicit link */
  live?: 1;
  /** a trial child whose simulated gift is replayed on arrival */
  child?: string;
  cadence?: "monthly" | "one_time";
  /** the kind of giving chosen before entering (the support page's track): the hall opens on it */
  kind?: "qualification" | "monthly" | "in_kind";
  /** the country the visitor was looking at: the hall lands on it */
  c?: string;
  /** where the visitor came from, an internal path with its search: leaving returns there */
  from?: string;
};

/**
 * the page to return to, or null. Only a path inside this site is accepted (one leading slash,
 * no scheme, no host, nothing a browser would read as another origin), and never the hall itself.
 */
export function hallReturn(from: unknown): string | null {
  if (typeof from !== "string" || from.length > 512) return null;
  if (!/^\/(?![/\\])[^\s\\\p{Cc}]*$/u.test(from)) return null;
  const path = from.split(/[?#]/)[0]!;
  if (path === "/hall" || path.startsWith("/hall/") || path.startsWith("/api/")) return null;
  return from;
}

export function parseHallSearch(raw: Record<string, unknown>): HallSearch {
  const c = raw["c"];
  const from = hallReturn(raw["from"]);
  return {
    ...(raw["try"] === 1 || raw["try"] === "1" ? { try: 1 as const } : {}),
    ...(raw["me"] === 1 || raw["me"] === "1" ? { me: 1 as const } : {}),
    ...(raw["live"] === 1 || raw["live"] === "1" ? { live: 1 as const } : {}),
    ...(typeof raw["child"] === "string" ? { child: raw["child"] } : {}),
    ...(raw["cadence"] === "one_time" || raw["cadence"] === "monthly"
      ? { cadence: raw["cadence"] }
      : {}),
    ...(raw["kind"] === "qualification" || raw["kind"] === "monthly" || raw["kind"] === "in_kind"
      ? { kind: raw["kind"] }
      : {}),
    ...(typeof c === "string" && /^[A-Z]{2}$/.test(c) ? { c } : {}),
    ...(from ? { from } : {}),
  };
}

export type HallSource = {
  /**
   * `donor`: the signed-in donor's own sponsorships, as their dashboard reads them, and nothing
   * simulated; `trial`: the trial catalogue and the visitor's browser stores; `live`: the
   * directory's counts
   */
  mode: "donor" | "trial" | "live";
  /** «أثري» of the same mode: the trial's impact page, or the donor's dashboard */
  mine: ReturnType<typeof trialRoute> | "/dashboard";
  /** where the visitor came from, when that is another page than `mine` */
  back: string | null;
  /** the country to land on */
  start: string | null;
};

/**
 * the one demo/real switch of the hall. The hall follows its source, never the platform-wide
 * mode: `?try=1` (the trial pages' own links) opens the trial hall; `?me=1`, the dashboard's own
 * link, opens the donor's hall on their real sponsorships; `?live=1` opens the concept hall on
 * the real directory's counts; a bare link is the trial. Everything the page does differently between the three follows from `mode`.
 */
export function hallSource(
  search: HallSearch,
  opts: { demo?: boolean; trial?: boolean } = {},
): HallSource {
  // a bare /hall is the trial: labelled, and the same catalogue the trial pages read. The concept
  // hall, whose figures are sample beside one real count, opens only when a link asks for it.
  // A visitor in demo mode (`@/lib/demo-mode`) always gets the trial hall: no donor's real
  // sponsorships and no directory counts reach a demo session, whatever the link says.
  const asked =
    search.try === 1 ? "trial" : search.me === 1 ? "donor" : search.live === 1 ? "live" : "trial";
  // without the trial's files (`@/lib/trial-gate`) there is no trial hall: what would open it opens
  // the live hall, so links left in old pages and bookmarks still land somewhere real
  const trial = opts.trial ?? TRIAL_ENABLED;
  const wanted = opts.demo ? "trial" : asked;
  const mode = wanted === "trial" && !trial ? "live" : wanted;
  const mine = mode === "trial" ? trialRoute("/try/impact") : "/dashboard";
  const from = hallReturn(search.from);
  return {
    mode,
    mine,
    back: from && from.split(/[?#]/)[0] !== mine ? from : null,
    start: search.c ?? null,
  };
}

/**
 * the language the hall speaks: the interface language, in all three halls. The trial reads its
 * copy from `./trial`, the donor's hall from `./copy`, and the live hall from `./live`; `lang`
 * and `dir` follow the same locale, so no hall mixes two languages on one screen.
 */
export const hallLanguage = (_mode: HallSource["mode"], locale: string): string => locale;

/**
 * what the live hall is given of the directory: the same country rows the map and the directory
 * read from `geoQuery`, untouched (small cohorts already carry no numbers), or nothing when the
 * directory is unavailable. No other read feeds the live hall's counts.
 */
export const hallLiveRows = (geo: Geo): GeoCountry[] => (geo.available ? geo.countries : []);

/**
 * what the live hall writes of one directory row, and nothing else of it: the country's count of
 * children and how many of them wait for a sponsor, exactly as the map's country sheet derives
 * them (`total`, and `total − sponsored`), or no number at all when the cohort is small or the
 * count is withheld. The only real figures in the live hall pass through here.
 */
export function hallDirectory(row: GeoCountry) {
  const counted = !row.small && row.total != null && row.total > 0;
  return {
    /** null: the cohort is hidden, and the hall says so instead of a number */
    total: counted ? row.total : null,
    waiting: counted && row.sponsored != null ? Math.max(0, row.total! - row.sponsored) : null,
    /** the directory itself, filtered to this country by the value it filters on */
    href: `/orphans?country=${encodeURIComponent(row.value)}`,
  };
}

type Place = { pathname: string; search: Record<string, unknown> };

/**
 * the search a link into the hall carries from a page: where the visitor is (to return to, with
 * the page's own search, so what they had chosen is still chosen) and the country they were
 * looking at. `countryOf` resolves the page's own subject (a trial child) to its country.
 */
export function hallEntry(
  at: Place & { href?: string },
  base: HallSearch = {},
  countryOf?: (at: Place) => string | undefined,
): HallSearch {
  const c = at.search["c"];
  const co = typeof c === "string" && /^[A-Z]{2}$/.test(c) ? c : countryOf?.(at);
  const qs = Object.entries(at.search)
    .filter(([, v]) => typeof v === "string" || typeof v === "number")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  const from = hallReturn(at.href ?? (qs ? `${at.pathname}?${qs}` : at.pathname));
  return {
    ...base,
    ...(co && /^[A-Z]{2}$/.test(co) ? { c: co } : {}),
    ...(from ? { from } : {}),
  };
}
