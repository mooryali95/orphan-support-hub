import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowLeft, Globe2, List, MapPin, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { normalize } from "@/lib/countries";
import { arCount, COUNTRIES } from "@/lib/plural";
import { cn } from "@/lib/utils";
import { easeInOut, easeOut, fit, flight, type View } from "./camera";
import { COHORT_MIN, type CountryStat, type MapStats, type RegionStat } from "./demo-stats";

/* ── البيانات ──────────────────────────────────────────────────────────── */

type Box = [number, number, number, number];
type CountryShape = { c: string; n: string; d: string; b: Box; p: [number, number] };
type RegionShape = {
  id: string;
  n: string;
  en: string;
  alt: string;
  d: string;
  b: Box;
  p: [number, number];
};
type World = { w: number; h: number; countries: CountryShape[] };

const worldQuery = {
  queryKey: ["geo", "world"],
  queryFn: async (): Promise<World> => (await fetch("/geo/world.json")).json(),
  staleTime: Infinity,
  gcTime: Infinity,
};

function useRegions(code: string | null) {
  return useQuery({
    queryKey: ["geo", "admin1", code],
    queryFn: async (): Promise<RegionShape[]> => {
      const res = await fetch(`/geo/admin1/${code}.json`);
      return res.ok ? ((await res.json()) as { regions: RegionShape[] }).regions : [];
    },
    enabled: !!code,
    staleTime: Infinity,
  });
}

/** مفتاح المنطقة في الإحصاء ← المنطقة على الخارطة، بأي اسمٍ كُتب. */
function statFor(region: RegionShape, stat: CountryStat | undefined): RegionStat | undefined {
  if (!stat) return undefined;
  const names = new Set([region.n, region.en, ...region.alt.split("|")].map(normalize));
  for (const [k, v] of Object.entries(stat.regions)) if (names.has(normalize(k))) return v;
  return undefined;
}

/** العدد كما يُعرض: ما دون الحدّ لا يُكشف رقمه — والقاعدة لا تُرسله أصلاً. */
function shown(n: number | null | undefined) {
  return n == null || n < COHORT_MIN ? `أقل من ${COHORT_MIN}` : n.toLocaleString("ar-u-nu-latn");
}
const sizeOf = (s: { total: number | null } | undefined) => s?.total ?? 1;

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const on = () => setReduce(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

/* ── الطبقات المرسومة: تُرسم مرّةً ولا تتبع كل إطار ─────────────────── */

const CountriesLayer = memo(function CountriesLayer({
  countries,
  stats,
  focus,
  onPick,
}: {
  countries: CountryShape[];
  stats: MapStats;
  focus: string | null;
  onPick: (code: string) => void;
}) {
  return (
    <g>
      {countries.map((c, i) => {
        const active = !!stats[c.c];
        const dim = focus && focus !== c.c;
        return (
          <path
            key={`${c.c}-${i}`}
            d={c.d}
            vectorEffect="non-scaling-stroke"
            onClick={active ? () => onPick(c.c) : undefined}
            className={cn(
              "stroke-background transition-[fill,opacity] duration-700 ease-[var(--ease-out)]",
              active ? "cursor-pointer fill-primary/75 hover:fill-primary" : "fill-border",
              dim && "opacity-25",
              focus === c.c && "fill-transparent hover:fill-transparent",
            )}
            strokeWidth={0.6}
          />
        );
      })}
    </g>
  );
});

const RegionsLayer = memo(function RegionsLayer({
  regions,
  stat,
  selected,
  onPick,
}: {
  regions: RegionShape[];
  stat: CountryStat | undefined;
  selected: string | null;
  onPick: (id: string) => void;
}) {
  const max = Math.max(1, ...Object.values(stat?.regions ?? {}).map(sizeOf));
  return (
    <g>
      {regions.map((r, i) => {
        const s = statFor(r, stat);
        // كثافة اللون بعدد الأيتام: الأكثف أعمق خضرة.
        const k = s ? 0.35 + 0.6 * (sizeOf(s) / max) : 0;
        return (
          <path
            key={r.id}
            d={r.d}
            vectorEffect="non-scaling-stroke"
            onClick={() => onPick(r.id)}
            style={{
              ["--i" as string]: Math.min(i, 24),
              fillOpacity: selected && selected !== r.id ? (s ? k * 0.45 : 0.5) : s ? k : 1,
            }}
            className={cn(
              "map-region cursor-pointer stroke-background transition-[fill,fill-opacity] duration-500",
              s ? "fill-primary hover:brightness-110" : "fill-secondary hover:fill-accent",
              selected === r.id && "fill-bridge",
            )}
            strokeWidth={1.2}
          />
        );
      })}
    </g>
  );
});

/* ── عدّادٌ يتصاعد إلى رقمه ─────────────────────────────────────────── */

function CountUp({ to, reduce }: { to: number; reduce: boolean }) {
  const [n, setN] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce || to < COHORT_MIN) return setN(to);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / 1100);
      setN(Math.round(to * easeOut(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, reduce]);
  return <span className="tabular-nums">{shown(to < COHORT_MIN ? to : n)}</span>;
}

/* ── الخارطة ───────────────────────────────────────────────────────── */

export type MapSelection = { country: string | null; region: string | null };

/** ما يُعرض تحت الأعداد في بطاقة الدولة/المنطقة — بقيم القاعدة نفسها. */
export type MapActionContext = {
  code: string;
  countryValue: string | null;
  regionValue: string | null;
  regionName: string | null;
};

/**
 * الصفحة الأولى خارطةٌ للعالم: الدول التي فيها ملفّات مضيئة، والضغط
 * على دولة يطير إليها وتظهر مناطقها، والضغط على منطقة يطير إليها
 * ويُظهر عدد أيتامها. كل مستوى له رابط، وزرّ «قائمة» يغني عن الخارطة
 * لمن لا يستعملها (قارئ الشاشة، لوحة المفاتيح).
 */
export function WorldMap({
  stats,
  selection,
  onSelect,
  demo = false,
  action,
  className,
  intro,
  bare = false,
}: {
  stats: MapStats;
  selection: MapSelection;
  onSelect: (s: MapSelection) => void;
  demo?: boolean;
  /** يستبدل زرّ «تصفّح من ينتظر هنا» — مثلاً «ادعم هذه المنطقة» أو «ادخل لتكفل». */
  action?: (ctx: MapActionContext) => ReactNode;
  className?: string;
  /** سطرا العالم بدل «اختر بلداً». */
  intro?: { title: string; text?: string };
  /** خلفيّةٌ فقط (صفحة الدخول): الخارطة بلا مسارٍ ولا بطاقاتٍ ولا قائمة. */
  bare?: boolean;
}) {
  const { data: world } = useQuery(worldQuery);
  const { data: regions = [] } = useRegions(selection.country);
  const reduce = usePrefersReducedMotion();

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dotsRef = useRef<SVGGElement>(null);
  const view = useRef<View | null>(null);
  const [size, setSize] = useState({ w: 1280, h: 660 });
  const [settled, setSettled] = useState(true);
  const [listOpen, setListOpen] = useState(false);

  const country = world?.countries.find((c) => c.c === selection.country) ?? null;
  const region = regions.find((r) => r.id === selection.region) ?? null;
  const cStat = selection.country ? stats[selection.country] : undefined;
  const rStat = region ? statFor(region, cStat) : undefined;

  /** النقاط النابضة تبقى بحجمها على الشاشة مهما كبّرنا. */
  const paint = useCallback((v: View) => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
    const unit = v.w / (svg.clientWidth || 1);
    dotsRef.current?.style.setProperty("--u", String(unit));
    dotsRef.current?.querySelectorAll<SVGGElement>("[data-at]").forEach((g) => {
      g.setAttribute("transform", `translate(${g.dataset["at"]}) scale(${unit})`);
    });
  }, []);

  // الحاوية تحدّد النسبة؛ والنسبة تحدّد إطار العالم.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const target = useMemo<View | null>(() => {
    if (!world) return null;
    const wide = size.w >= 768;
    // ما تغطّيه البطاقة والشريط العلوي لا يُحسب من المساحة: الهدف يتوسّط
    // ما يبقى ظاهراً — البطاقة جانبية على الحاسوب وسفلية على الجوال.
    const inset = {
      top: 72,
      side: country && wide ? 424 : 0,
      bottom: country && !wide ? Math.min(380, size.h * 0.48) : !country ? 120 : 16,
    };
    const aw = Math.max(1, size.w - inset.side);
    const ah = Math.max(1, size.h - inset.top - inset.bottom);
    let v: View;
    if (region) v = fit(region.b, ah / aw, 2.2, 1.2);
    else if (country) v = fit(country.b, ah / aw, 1.35, 2);
    else if (ah / aw > 0.8) {
      // الجوال طوليّ: العالم كاملاً يصغر حتى لا يُرى. نبدأ من حيث الملفّات.
      const act = world.countries.filter((c) => stats[c.c]);
      const x0 = Math.min(...act.map((c) => c.b[0])),
        y0 = Math.min(...act.map((c) => c.b[1])),
        x1 = Math.max(...act.map((c) => c.b[0] + c.b[2])),
        y1 = Math.max(...act.map((c) => c.b[1] + c.b[3]));
      v = act.length
        ? fit([x0, y0, x1 - x0, y1 - y0], ah / aw, 1.6, 260)
        : fit([0, 0, world.w, world.h], ah / aw, 1);
    } else v = fit([0, 30, world.w, world.h - 60], ah / aw, 1.02);
    const unit = v.w / aw;
    // في RTL البطاقة على اليمين (البداية): نمدّ الإطار يميناً بعرضها.
    return { x: v.x, y: v.y - inset.top * unit, w: size.w * unit, h: size.h * unit };
  }, [world, country, region, size, stats]);

  // الطيران إلى الهدف.
  useEffect(() => {
    if (!target) return;
    const from = view.current;
    if (!from || reduce) {
      view.current = target;
      paint(target);
      setSettled(true);
      return;
    }
    const f = flight(from, target);
    let raf = 0;
    const t0 = performance.now();
    setSettled(false);
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / f.duration);
      const v = f.at(easeInOut(t));
      view.current = v;
      paint(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setSettled(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, paint, reduce]);

  // النقاط تُعاد بعد كل رسم للطبقة.
  useEffect(() => {
    if (view.current) paint(view.current);
  });

  // Escape يرجع خطوة.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selection.region) onSelect({ country: selection.country, region: null });
      else if (selection.country) onSelect({ country: null, region: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, onSelect]);

  const pickCountry = useCallback(
    (c: string) => onSelect({ country: c, region: null }),
    [onSelect],
  );
  const pickRegion = useCallback(
    (id: string) => onSelect({ country: selection.country, region: id }),
    [onSelect, selection.country],
  );

  const activeCountries = useMemo(
    () =>
      (world?.countries ?? [])
        .filter((c) => stats[c.c])
        .sort((a, b) => sizeOf(stats[b.c]) - sizeOf(stats[a.c])),
    [world, stats],
  );
  const rankedRegions = useMemo(
    () =>
      regions
        .map((r) => ({ r, s: statFor(r, cStat) }))
        .filter((x) => x.s)
        .sort((a, b) => sizeOf(b.s) - sizeOf(a.s)),
    [regions, cStat],
  );

  // المجموع من الدول التي يُكشف عددها؛ الصغيرة تُذكر دون رقمها.
  const totals = { total: Object.values(stats).reduce((a, s) => a + (s.total ?? 0), 0) };

  return (
    <section
      aria-label="خارطة الأيتام في العالم"
      className={cn(
        "relative isolate h-[calc(100dvh-4rem)] min-h-[32rem] overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,var(--color-thrive-tint),var(--color-background)_70%)]",
        className,
      )}
    >
      <div ref={wrapRef} className="absolute inset-0">
        {world && (
          <svg
            ref={svgRef}
            className="size-full touch-manipulation select-none"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={
              country ? `خارطة ${country.n}${region ? ` — ${region.n}` : ""}` : "خارطة العالم"
            }
          >
            <CountriesLayer
              countries={world.countries}
              stats={stats}
              focus={selection.country}
              onPick={pickCountry}
            />
            {country && regions.length > 0 && (
              <RegionsLayer
                key={country.c}
                regions={regions}
                stat={cStat}
                selected={selection.region}
                onPick={pickRegion}
              />
            )}
            {/* نقاط ذهبية تنبض فوق الدول التي فيها ملفّات — في العالم فقط. */}
            <g
              ref={dotsRef}
              className={cn("transition-opacity duration-500", country && "opacity-0")}
            >
              {activeCountries.map((c) => (
                <g key={c.c} data-at={`${c.p[0]} ${c.p[1]}`} className="pointer-events-none">
                  <circle r={14} className="map-pulse fill-bridge/30" />
                  <circle r={5} className="fill-bridge stroke-background" strokeWidth={2} />
                </g>
              ))}
            </g>
          </svg>
        )}
      </div>

      {!bare && (
        <>
          {/* ── الطبقة العلوية: المسار، والعنوان، والبطاقات ── */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 p-4 md:p-6">
            <nav aria-label="موضعك على الخارطة" className="pointer-events-auto">
              <ol className="flex flex-wrap items-center gap-1 rounded-full bg-card/85 p-1 text-sm shadow-sm backdrop-blur">
                <li>
                  <button
                    type="button"
                    onClick={() => onSelect({ country: null, region: null })}
                    className={cn(
                      "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 transition-colors",
                      !country ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
                    )}
                  >
                    <Globe2 className="size-4" aria-hidden="true" />
                    العالم
                  </button>
                </li>
                {country && (
                  <li className="flex items-center gap-1">
                    <span aria-hidden="true" className="text-muted-foreground">
                      ‹
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelect({ country: country.c, region: null })}
                      className={cn(
                        "min-h-9 rounded-full px-3 transition-colors",
                        !region ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
                      )}
                    >
                      {country.n}
                    </button>
                  </li>
                )}
                {region && (
                  <li className="flex items-center gap-1">
                    <span aria-hidden="true" className="text-muted-foreground">
                      ‹
                    </span>
                    <span className="min-h-9 rounded-full bg-primary px-3 py-1.5 text-primary-foreground">
                      {region.n}
                    </span>
                  </li>
                )}
              </ol>
            </nav>

            <div className="pointer-events-auto flex items-center gap-2">
              {demo && (
                <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                  بيانات تجريبية
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-card/85 backdrop-blur"
                aria-expanded={listOpen}
                onClick={() => setListOpen((o) => !o)}
              >
                <List aria-hidden="true" />
                قائمة
              </Button>
            </div>
          </div>

          {/* العالم: سطرٌ واحد ودعوة. */}
          {!country && (
            <div
              key="world"
              className="map-rise pointer-events-none absolute inset-x-0 bottom-0 p-4 text-center md:p-10"
            >
              <p className="font-serif text-3xl font-bold text-primary md:text-5xl">
                {intro?.title ?? "اختر بلداً"}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground md:text-base">
                {intro?.text ?? (
                  <>
                    لترى من ينتظر كافلاً هناك —{" "}
                    <strong className="text-foreground tabular-nums">{shown(totals.total)}</strong>{" "}
                    ملفاً موثّقاً في{" "}
                    <strong className="text-foreground">
                      {arCount(activeCountries.length, COUNTRIES)}
                    </strong>
                    .
                  </>
                )}
              </p>
            </div>
          )}

          {/* الدولة أو المنطقة: بطاقةٌ في أسفل البداية. */}
          {country && settled && (
            <aside
              key={`${country.c}-${region?.id ?? ""}`}
              aria-live="polite"
              className="map-rise absolute inset-x-3 bottom-3 rounded-3xl bg-card/95 p-5 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_12px_32px_-8px_rgb(0_0_0/0.18)] backdrop-blur md:inset-x-auto md:start-6 md:bottom-6 md:w-96"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3.5" aria-hidden="true" />
                    {region ? country.n : "الدولة"}
                  </p>
                  <h2 className="mt-1 text-2xl font-extrabold">{region ? region.n : country.n}</h2>
                </div>
                <button
                  type="button"
                  aria-label="رجوع"
                  onClick={() =>
                    onSelect(
                      region
                        ? { country: country.c, region: null }
                        : { country: null, region: null },
                    )
                  }
                  className="-m-1 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-[background-color,transform] hover:bg-secondary active:scale-95"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>

              {(() => {
                const s = region ? rStat : cStat;
                if (!s)
                  return (
                    <p className="mt-4 text-sm leading-7 text-muted-foreground">
                      لا ملفّات موثّقة هنا بعد.
                    </p>
                  );
                // التقسيم يأتي من القاعدة محجوباً إن صغر أحد شقّيه.
                const split = s.total != null && s.sponsored != null;
                const need = split ? s.total! - s.sponsored! : null;
                const pct = split ? Math.round((s.sponsored! / Math.max(1, s.total!)) * 100) : 0;
                const small = s.small || s.total == null;
                return (
                  <>
                    <p className="mt-4 flex items-baseline gap-2">
                      <span className="text-5xl font-extrabold text-primary">
                        {small ? shown(null) : <CountUp to={s.total!} reduce={reduce} />}
                      </span>
                      <span className="text-sm text-muted-foreground">يتيماً بملفٍّ موثّق</span>
                    </p>
                    {split && (
                      <>
                        <div
                          className="mt-4 h-2 overflow-hidden rounded-full bg-secondary"
                          role="img"
                          aria-label={`${pct}% مكفولون`}
                        >
                          <div
                            className="map-grow h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <dl className="mt-2 flex justify-between text-sm">
                          <div className="flex gap-1">
                            <dt className="text-muted-foreground">مكفول</dt>
                            <dd className="font-semibold tabular-nums">{shown(s.sponsored)}</dd>
                          </div>
                          <div className="flex gap-1">
                            <dt className="text-muted-foreground">ينتظر كافلاً</dt>
                            <dd className="font-semibold tabular-nums text-bridge-ink">
                              {shown(need)}
                            </dd>
                          </div>
                        </dl>
                      </>
                    )}
                    {(small || !split) && (
                      <p className="mt-2 text-xs leading-6 text-muted-foreground">
                        لا نعرض الأرقام الدقيقة حين يقلّ أحدها عن {COHORT_MIN} — حمايةً للأطفال من
                        أن يُعرَفوا.
                      </p>
                    )}
                    {action ? (
                      <div className="mt-5">
                        {action({
                          code: country.c,
                          countryValue: cStat?.value ?? null,
                          regionValue: rStat?.value ?? null,
                          regionName: region?.n ?? null,
                        })}
                      </div>
                    ) : (
                      <Button asChild size="lg" className="mt-5 w-full">
                        <Link
                          to="/orphans"
                          search={{
                            // قيم القاعدة نفسها — فالدليل يجد ما وجدته الخارطة.
                            country: cStat?.value ?? country.c,
                            ...(region && rStat ? { region: rStat.value } : {}),
                            funding: "open",
                          }}
                        >
                          تصفّح من ينتظر هنا
                          <ArrowLeft className="ltr:-scale-x-100" aria-hidden="true" />
                        </Link>
                      </Button>
                    )}
                    {!region && rankedRegions.length > 0 && (
                      <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="المناطق">
                        {rankedRegions.slice(0, 6).map(({ r, s: rs }) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => pickRegion(r.id)}
                              className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-secondary px-3 text-xs transition-[background-color,transform] hover:bg-accent active:scale-[0.97]"
                            >
                              {r.n}
                              <span className="tabular-nums text-muted-foreground">
                                {shown(rs!.total)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                );
              })()}
            </aside>
          )}

          {/* القائمة: البديل الكامل للخارطة. */}
          {listOpen && (
            <div
              role="dialog"
              aria-label="الدول والمناطق"
              className="map-rise absolute inset-y-3 end-3 w-[min(22rem,calc(100%-1.5rem))] overflow-y-auto rounded-3xl bg-card/95 p-4 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_12px_32px_-8px_rgb(0_0_0/0.18)] backdrop-blur"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-bold">{country ? `مناطق ${country.n}` : "الدول"}</h2>
                <button
                  type="button"
                  aria-label="إغلاق القائمة"
                  onClick={() => setListOpen(false)}
                  className="grid size-9 place-items-center rounded-full hover:bg-secondary"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
              <ul className="mt-3 divide-y divide-border">
                {(country
                  ? rankedRegions.map(({ r, s }) => ({
                      key: r.id,
                      label: r.n,
                      n: s!.total,
                      go: () => pickRegion(r.id),
                    }))
                  : activeCountries.map((c) => ({
                      key: c.c,
                      label: c.n,
                      n: stats[c.c]!.total,
                      go: () => pickCountry(c.c),
                    }))
                ).map((x) => (
                  <li key={x.key}>
                    <button
                      type="button"
                      onClick={() => {
                        x.go();
                        setListOpen(false);
                      }}
                      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-2 text-start transition-colors hover:bg-secondary"
                    >
                      <span>{x.label}</span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {shown(x.n)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
