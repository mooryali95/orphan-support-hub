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
import { PLATFORM_MODE, type PlatformMode } from "@/config/platform";
import type { Geo, GeoCountry } from "@/lib/geo";

export type HallSearch = {
  /** opens the hall on the trial catalogue */
  try?: 1;
  /** the donor's own hall: entered from their dashboard, it shows their real sponsorships */
  me?: 1;
  /** a trial child whose simulated gift is replayed on arrival */
  child?: string;
  cadence?: "monthly" | "one_time";
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
    ...(typeof raw["child"] === "string" ? { child: raw["child"] } : {}),
    ...(raw["cadence"] === "one_time" || raw["cadence"] === "monthly"
      ? { cadence: raw["cadence"] }
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
  mine: "/try/impact" | "/dashboard";
  /** where the visitor came from, when that is another page than `mine` */
  back: string | null;
  /** the country to land on */
  start: string | null;
};

/**
 * the one demo/real switch of the hall. `?try=1` always opens the trial hall (a link that asks
 * for the trial gets the trial). `?me=1`, the dashboard's own link, opens the donor's hall on
 * their real sponsorships, whatever the platform's mode: a donor never lands in a demo from
 * their own dashboard. Otherwise the platform's trial mode opens the trial hall, and the live
 * one after it. Everything the page does differently between the three follows from `mode`.
 */
export function hallSource(search: HallSearch, platform: PlatformMode = PLATFORM_MODE): HallSource {
  const mode =
    search.try === 1
      ? "trial"
      : search.me === 1
        ? "donor"
        : platform === "trial"
          ? "trial"
          : "live";
  const mine = mode === "trial" ? "/try/impact" : "/dashboard";
  const from = hallReturn(search.from);
  return {
    mode,
    mine,
    back: from && from.split(/[?#]/)[0] !== mine ? from : null,
    start: search.c ?? null,
  };
}

/**
 * the language the hall speaks. The trial hall and the donor's hall follow the interface
 * language; the live concept hall's panels are written in Arabic only so far, so that whole hall
 * stays Arabic (with `lang` and `dir` to match) instead of mixing two languages on one screen.
 */
export const hallLanguage = (mode: HallSource["mode"], locale: string): string =>
  mode === "live" ? "ar" : locale;

/**
 * what the live hall is given of the directory: the same country rows the map and the directory
 * read from `geoQuery`, untouched (small cohorts already carry no numbers), or nothing when the
 * directory is unavailable. No other read feeds the live hall's counts.
 */
export const hallLiveRows = (geo: Geo): GeoCountry[] => (geo.available ? geo.countries : []);

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
