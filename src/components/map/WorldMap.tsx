import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Compass,
  Globe2,
  Layers,
  List,
  LocateFixed,
  MapPin,
  Minus,
  Pause,
  Play,
  Plus,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { countryName, normalize } from "@/lib/countries";
import { formatMoney } from "@/lib/format";
import { copyOf, defineCopy, intlOf, pluralOf, type Locale, useLocale } from "@/lib/locale";
import { arCount, COUNTRIES } from "@/lib/plural";
import { cn } from "@/lib/utils";
import { easeInOut, easeOut, fit, flight, lerpView, spring, type View, zoomLevel } from "./camera";
import { MapSearch, type SearchItem } from "./MapSearch";
import {
  clampView,
  dirOfKey,
  nearestInDirection,
  panBy,
  MAX_ZOOM,
  pinchOf,
  sameView,
  zoomAround,
  type Point,
} from "./gesture";
import { COHORT_MIN, type CountryStat, type MapStats, type RegionStat } from "./demo-stats";
import type { MapSourceStatus } from "./map-source";
import {
  DEFAULT_LAYER,
  intensityOf,
  isNetworkLayer,
  type MapLayer,
  metricOf,
  metricText,
  rankOf,
} from "./layers";
import { interactiveCodes, kindCounts, networkPaint, type NetworkKind } from "./network-layer";
import { officeRegisterQuery, withRegister } from "@/lib/office-presence";
import {
  ExpansionList,
  NetworkCountryCard,
  NetworkIntro,
  NetworkMarkers,
  NetworkPatterns,
  NetworkShapes,
  PresenceList,
} from "./NetworkLayer";
import { networkCopy } from "./network-copy";

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

const regionsQuery = (code: string | null) => ({
  queryKey: ["geo", "admin1", code],
  queryFn: async (): Promise<RegionShape[]> => {
    const res = await fetch(`/geo/admin1/${code}.json`);
    return res.ok ? ((await res.json()) as { regions: RegionShape[] }).regions : [];
  },
  staleTime: Infinity,
});

function useRegions(code: string | null) {
  return useQuery({ ...regionsQuery(code), enabled: !!code });
}

/** مفتاح المنطقة في الإحصاء ← المنطقة على الخريطة، بأي اسمٍ كُتب. */
function statFor(region: RegionShape, stat: CountryStat | undefined): RegionStat | undefined {
  if (!stat) return undefined;
  const names = new Set([region.n, region.en, ...region.alt.split("|")].map(normalize));
  for (const [k, v] of Object.entries(stat.regions)) if (names.has(normalize(k))) return v;
  return undefined;
}

/** العدد كما يُعرض: ما دون الحدّ لا يُكشف رقمه — والقاعدة لا تُرسله أصلاً. */
function shown(n: number | null | undefined, locale: Locale = "ar") {
  if (n == null || n < COHORT_MIN) return copyOf(COPY, locale).fewerThan(COHORT_MIN);
  return n.toLocaleString(intlOf(locale));
}

const COPY = defineCopy("components/map/WorldMap", {
  ar: {
    fewerThan: (n: number) => `أقل من ${n}`,
    section: "خارطة الأيتام في العالم",
    mapOf: (place: string) => `خارطة ${place}`,
    worldMap: "خارطة العالم",
    breadcrumb: "موضعك على الخريطة",
    world: "العالم",
    demo: "بيانات تجريبية",
    loading: "تُحمَّل أرقام الخريطة…",
    unavailable: "أرقام الخريطة غير متاحة الآن",
    unavailableHere: "لا تتوفّر الأرقام الآن، أعد المحاولة بعد قليل.",
    list: "قائمة",
    pick: "اختر بلداً",
    introA: "لترى من ينتظر كافلاً هناك —",
    introB: "ملفاً موثّقاً في",
    countries: (n: number) => arCount(n, COUNTRIES),
    country: "الدولة",
    back: "رجوع",
    none: "لا ملفّات موثّقة هنا بعد.",
    verified: "يتيماً بملفٍّ موثّق",
    pctSponsored: (p: number) => `${p}% مكفولون`,
    sponsored: "مكفول",
    waiting: "ينتظر كافلاً",
    cohort: (n: number) =>
      `لا نعرض الأرقام الدقيقة حين يقلّ أحدها عن ${n}، حمايةً للأطفال من أن يُعرَفوا.`,
    browse: "تصفّح من ينتظر هنا",
    regions: "المناطق",
    listLabel: "الدول والمناطق",
    toHall: "شاهدها في قاعة الأثر ←",
    regionsOf: (c: string) => `مناطق ${c}`,
    countriesH: "الدول",
    closeList: "إغلاق القائمة",
    reset: "إعادة الضبط",
    expand: "توسيع البطاقة",
    collapse: "طيّ البطاقة لرؤية الخريطة",
    layers: "طبقة الخريطة",
    layerWaiting: "ينتظرون",
    layerImpact: "الأثر",
    layerGap: "الفجوة",
    layerWaitingHint: "عدد الأطفال المعتمدين الذين ينتظرون كافلاً",
    layerImpactHint: "نسبة المكفولين، ومن وصلهم تسليمٌ موثّق خلال 90 يوماً",
    layerGapHint: "الحاجة الشهرية غير المغطّاة بالعملة",
    delivered: "وصلهم تسليمٌ موثّق خلال 90 يوماً",
    gap: "الفجوة الشهرية",
    hint: "اقرص أو انقر مرّتين للتكبير، واسحب للتنقّل. وبلوحة المفاتيح: الأسهم بين الدول، وEnter للدخول، و+ و− للتكبير، و/ للبحث.",
    countryButton: (name: string, n: string) => `${name}: ${n}. اضغط Enter للدخول`,
    zoom: "التكبير",
    zoomIn: "تكبير",
    zoomOut: "تصغير",
    zoomWorld: "العالم كاملاً",
    zoomFit: "عودة إلى الإطار",
    search: "ابحث",
    searchPlaceholder: "ابحث عن دولة أو منطقة…",
    searchNone: "لا نتائج",
    searchClose: "إغلاق البحث",
    tour: "اكتشف",
    tourStop: "أوقف الجولة",
    prev: "السابق",
    next: "التالي",
    regionButton: (name: string, n: string) => `${name}: ${n}`,
  },
  en: {
    fewerThan: (n: number) => `fewer than ${n}`,
    section: "Map of orphans worldwide",
    mapOf: (place: string) => `Map of ${place}`,
    worldMap: "World map",
    breadcrumb: "Your place on the map",
    world: "World",
    demo: "Sample data",
    loading: "Loading map figures…",
    unavailable: "Map figures are unavailable right now",
    unavailableHere: "Figures are unavailable right now; please try again shortly.",
    list: "List",
    pick: "Choose a country",
    introA: "to see who is waiting for a sponsor there —",
    introB: "verified files in",
    countries: pluralOf({ one: "{0} country", other: "{0} countries" }),
    country: "Country",
    back: "Back",
    none: "No verified files here yet.",
    verified: "children with a verified file",
    pctSponsored: (p: number) => `${p}% sponsored`,
    sponsored: "Sponsored",
    waiting: "Waiting for a sponsor",
    cohort: (n: number) =>
      `We don't show exact numbers when any of them is below ${n}, so that no child can be identified.`,
    browse: "Browse who is waiting here",
    regions: "Regions",
    listLabel: "Countries and regions",
    toHall: "See it in the impact hall →",
    regionsOf: (c: string) => `Regions of ${c}`,
    countriesH: "Countries",
    closeList: "Close list",
    reset: "Reset view",
    expand: "Expand the card",
    collapse: "Collapse the card to see the map",
    layers: "Map layer",
    layerWaiting: "Waiting",
    layerImpact: "Impact",
    layerGap: "Gap",
    layerWaitingHint: "Approved children still waiting for a sponsor",
    layerImpactHint: "Share sponsored, and children with a documented delivery in the last 90 days",
    layerGapHint: "Monthly need not yet covered, in currency",
    delivered: "Received a documented delivery in the last 90 days",
    gap: "Monthly gap",
    hint: "Pinch or double-tap to zoom, drag to move. Keyboard: arrows move between countries, Enter opens one, + and − zoom, / searches.",
    countryButton: (name: string, n: string) => `${name}: ${n}. Press Enter to open`,
    zoom: "Zoom",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    zoomWorld: "Whole world",
    zoomFit: "Back to the frame",
    search: "Search",
    searchPlaceholder: "Search a country or region…",
    searchNone: "No results",
    searchClose: "Close search",
    tour: "Explore",
    tourStop: "Stop the tour",
    prev: "Previous",
    next: "Next",
    regionButton: (name: string, n: string) => `${name}: ${n}`,
  },
});
const sizeOf = (s: { total: number | null } | undefined) => s?.total ?? 1;
/** لون الطبقة: «ينتظرون» بالأخضر الأساسي، «الأثر» بالازدهار، «الفجوة» بالحاجة. */
const LAYER_FILL: Record<MapLayer, string> = {
  waiting: "fill-primary",
  impact: "fill-shore-thrive",
  gap: "fill-shore-need",
  // طبقتا الشبكة ترسمان بأنفسهما (`NetworkShapes`) — لا تلوين بأعداد المنصّة.
  network: "fill-primary",
  needs: "fill-office-gap",
};
/** طبقتا الشبكة لا تقرآن أعداد المنصّة: الدول تحتها أرضٌ محايدة. */
const NO_STATS: MapStats = {};

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
  revealed,
  near,
  onPick,
  onHover,
  onKey,
  label,
  layer,
  extra,
}: {
  extra?: ReadonlySet<string> | undefined;
  countries: CountryShape[];
  layer: MapLayer;
  /** داخل دولة: لا يُرسم إلا ما يجاورها — العالم كلّه في كل إطار ثقلٌ بلا فائدة. */
  near: Box | null;
  stats: MapStats;
  focus: string | null;
  revealed: boolean;
  onPick: (code: string) => void;
  onHover: (code: string) => void;
  /** الأسهم بين الدول — تُحلّ في الأب لأنّه يملك القائمة والمراكز. */
  onKey: (e: React.KeyboardEvent<SVGPathElement>, code: string) => void;
  label: (name: string, n: string) => string;
}) {
  const locale = useLocale();
  const hidden = copyOf(COPY, locale).fewerThan(COHORT_MIN);
  const maxMetric = Math.max(1, ...countries.map((c) => metricOf(layer, stats[c.c]) ?? 0));
  const within = (b: Box) =>
    !near ||
    !(
      b[0] > near[0] + near[2] ||
      b[0] + b[2] < near[0] ||
      b[1] > near[1] + near[3] ||
      b[1] + b[3] < near[1]
    );
  return (
    <g>
      {countries.map((c, i) => {
        if (!within(c.b)) return null;
        const active = !!stats[c.c] || !!extra?.has(c.c);
        const dim = focus && focus !== c.c;
        // الدولة التي فيها ملفّات زرٌّ على الخريطة نفسها: تُركَّز وتُفتح بـEnter.
        const focusable = active && focus !== c.c;
        const text = stats[c.c] ? metricText(layer, stats[c.c], locale, hidden) : "";
        return (
          <path
            key={`${c.c}-${i}`}
            style={
              active && focus !== c.c
                ? { fillOpacity: intensityOf(metricOf(layer, stats[c.c]), maxMetric) }
                : undefined
            }
            d={c.d}
            vectorEffect="non-scaling-stroke"
            onClick={active ? () => onPick(c.c) : undefined}
            onPointerEnter={active ? () => onHover(c.c) : undefined}
            onFocus={active ? () => onHover(c.c) : undefined}
            onKeyDown={focusable ? (e) => onKey(e, c.c) : undefined}
            data-tip={active && focus !== c.c ? `${c.n}|${text}` : undefined}
            data-country={focusable ? c.c : undefined}
            tabIndex={focusable ? 0 : -1}
            role={focusable ? "button" : undefined}
            aria-label={focusable ? label(c.n, text) : undefined}
            className={cn(
              "stroke-background transition-[fill,fill-opacity,opacity] duration-700 ease-[var(--ease-out)] outline-none",
              active
                ? cn("map-active cursor-pointer hover:brightness-110", LAYER_FILL[layer])
                : "fill-foreground/[0.07]",
              focusable && "focus-visible:fill-primary focus-visible:stroke-bridge",
              dim && "opacity-40",
              // أثناء الطيران تبقى الدولة ملوّنة، ثم تخلي مكانها لمناطقها.
              focus === c.c &&
                (revealed
                  ? "fill-transparent hover:fill-transparent"
                  : "fill-primary/35 hover:fill-primary/35"),
            )}
            strokeWidth={focusable ? 1 : 0.6}
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
  onKey,
  label,
  layer,
}: {
  regions: RegionShape[];
  stat: CountryStat | undefined;
  layer: MapLayer;
  selected: string | null;
  onPick: (id: string) => void;
  onKey: (e: React.KeyboardEvent<SVGPathElement>, id: string) => void;
  label: (name: string, n: string) => string;
}) {
  const locale = useLocale();
  const hidden = copyOf(COPY, locale).fewerThan(COHORT_MIN);
  const max = Math.max(
    1,
    ...Object.values(stat?.regions ?? {}).map((x) => metricOf(layer, x) ?? 0),
  );
  return (
    <g className="map-regions">
      {regions.map((r, i) => {
        const s = statFor(r, stat);
        // كثافة اللون بقيمة الطبقة: الأكثر أعمق لوناً، والمحجوب أخفّ.
        const k = s ? intensityOf(metricOf(layer, s), max) : 0;
        const text = s ? metricText(layer, s, locale, hidden) : r.n;
        // المنطقة التي فيها ملفّات تُركَّز؛ الخالية تُضغط فقط (لا تستحقّ موضعاً في الترتيب).
        const focusable = !!s && selected !== r.id;
        return (
          <path
            key={r.id}
            d={r.d}
            vectorEffect="non-scaling-stroke"
            onClick={() => onPick(r.id)}
            onKeyDown={focusable ? (e) => onKey(e, r.id) : undefined}
            data-tip={s ? `${r.n}|${text}` : r.n}
            data-region={focusable ? r.id : undefined}
            tabIndex={focusable ? 0 : -1}
            role={focusable ? "button" : undefined}
            aria-label={focusable ? label(r.n, text) : undefined}
            style={{
              ["--i" as string]: Math.min(i, 24),
              fillOpacity: selected && selected !== r.id ? (s ? k * 0.45 : 0.5) : s ? k : 1,
            }}
            className={cn(
              "map-region cursor-pointer stroke-background transition-[fill,fill-opacity] duration-500 outline-none",
              s
                ? cn("hover:brightness-110", LAYER_FILL[layer])
                : "fill-secondary hover:fill-accent",
              focusable && "focus-visible:stroke-bridge focus-visible:brightness-110",
              selected === r.id && "fill-bridge",
            )}
            strokeWidth={1.2}
          />
        );
      })}
    </g>
  );
});

/* ── وسوم المناطق: الأكثر أيتاماً أولاً، ويُترك ما يزاحم وسماً سبقه ── */

function placeLabels<T extends { r: RegionShape }>(
  ranked: T[],
  v: View,
  size: { w: number; h: number },
) {
  const placed: Array<T & { x: number; y: number }> = [];
  for (const item of ranked) {
    if (placed.length >= 8) break;
    const x = ((item.r.p[0] - v.x) / v.w) * size.w;
    let y = ((item.r.p[1] - v.y) / v.h) * size.h;
    // منطقةٌ صغيرة على الشاشة يغطّيها وسمها: يُرفع الوسم فوقها فتبقى ظاهرة.
    const top = ((item.r.b[1] - v.y) / v.h) * size.h;
    const height = (item.r.b[3] / v.h) * size.h;
    if (height < 48) y = top - 16;
    if (x < 16 || y < 80 || x > size.w - 16 || y > size.h - 16) continue;
    // وسمٌ عرضه ~٩٠px وارتفاعه ~٢٤px: ما يتقاطع مع سابقٍ يُترك (يبقى في البطاقة والقائمة).
    if (placed.some((p) => Math.abs(p.x - x) < 96 && Math.abs(p.y - y) < 30)) continue;
    placed.push({ ...item, x, y });
  }
  return placed;
}

/* ── عدّادٌ يتصاعد إلى رقمه ─────────────────────────────────────────── */

/**
 * يتدحرج من آخر رقمٍ عُرض لا من الصفر: الانتقال بين دولتين أو طبقتين
 * يُقرأ فرقاً بين رقمين، لا عدّاً جديداً في كل مرّة.
 */
function CountUp({
  to,
  reduce,
  memo,
}: {
  to: number;
  reduce: boolean;
  memo?: { current: number };
}) {
  const from = memo?.current ?? 0;
  const [n, setN] = useState(reduce ? to : from);
  useEffect(() => {
    if (memo) memo.current = to;
    if (reduce || to < COHORT_MIN) return setN(to);
    let raf = 0;
    const t0 = performance.now();
    const start = from < COHORT_MIN ? 0 : from;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / 1100);
      setN(Math.round(start + (to - start) * easeOut(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // `from` يُقرأ مرّةً عند التركيب: هو نقطة البداية لا تبعيّة.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, reduce]);
  return <span className="tabular-nums">{shown(to < COHORT_MIN ? to : n, useLocale())}</span>;
}

/* ── الخريطة ───────────────────────────────────────────────────────── */

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
 * ويُظهر عدد أيتامها. كل مستوى له رابط، وزرّ «قائمة» يغني عن الخريطة
 * لمن لا يستعملها (قارئ الشاشة، لوحة المفاتيح).
 */
export function WorldMap({
  stats,
  selection,
  onSelect,
  demo = false,
  status,
  action,
  className,
  intro,
  bare = false,
  layer = DEFAULT_LAYER,
  onLayer,
  cardCompact = false,
  showUnconfirmed = false,
  networkPaintOverride,
  countryCard,
  supportable,
}: {
  /** دولٌ يُدعم فيها المكان (التأهيل والعيني) وإن لم تكن فيها ملفّات أطفال بعد. */
  supportable?: ReadonlySet<string>;
  /** الإدارة ترى في «الشبكة» ما لم يُؤكَّد بعد (محايداً) لتراجعه؛ الزوّار لا. */
  showUnconfirmed?: boolean;
  /**
   * ما يُرسم في طبقة الشبكة بدل ملفّ البحث: سجلّ المكاتب من القاعدة (`public_offices_map`)
   * على صفحة المكاتب. الخريطة نفسها، والمصدر وحده يتغيّر.
   */
  networkPaintOverride?: Map<string, NetworkKind>;
  /** بطاقة الدولة في طبقة الشبكة حين يكون للصفحة ما تعرضه عنها (مكاتبها من السجلّ). */
  countryCard?: (code: string) => ReactNode;
  /** بطاقةٌ مختصرة (الاسم والعدد ثم الفعل): حين يكون الفعل نفسه مساراً كاملاً كالدعم. */
  cardCompact?: boolean;
  stats: MapStats;
  /** الطبقة المعروضة؛ تُحفظ في الرابط عند الأب. بلا `onLayer` لا يظهر المفتاح. */
  layer?: MapLayer;
  onLayer?: (layer: MapLayer) => void;
  selection: MapSelection;
  onSelect: (s: MapSelection) => void;
  demo?: boolean;
  /**
   * حال المصدر (`useMapStats`). أثناء التحميل وعند التعذّر لا رقم ولا «لا
   * ملفّات هنا»: هيكلٌ أو «غير متاحة الآن» (ARC-11/PRD-15).
   */
  status?: MapSourceStatus;
  /** يستبدل زرّ «تصفّح من ينتظر هنا» — مثلاً «ادعم هذه المنطقة» أو «ادخل لتكفل». */
  action?: (ctx: MapActionContext) => ReactNode;
  className?: string;
  /** سطرا العالم بدل «اختر بلداً». */
  intro?: { title: string; text?: string };
  /** خلفيّةٌ فقط (صفحة الدخول): الخريطة بلا مسارٍ ولا بطاقاتٍ ولا قائمة. */
  bare?: boolean;
}) {
  const locale = useLocale();
  const c$ = copyOf(COPY, locale);
  const n$ = networkCopy(locale);
  const source: MapSourceStatus = status ?? (demo ? "demo" : "ready");
  // طبقتا الشبكة: ما يُرسم وما يُفتح من البيانات البحثية لا من أعداد المنصّة.
  const netLayer = isNetworkLayer(layer) ? layer : null;
  // طبقة الشبكة من المصدر الواحد مع القاعة: ملفّ البحث، وفوقه سجلّ المكاتب (`@/lib/office-presence`).
  const { data: register } = useQuery({
    ...officeRegisterQuery,
    enabled: netLayer === "network" && !networkPaintOverride,
  });
  const net = useMemo(() => {
    if (!netLayer) return null;
    if (networkPaintOverride) return networkPaintOverride;
    const base = networkPaint(netLayer, { showUnconfirmed });
    return netLayer === "network" ? withRegister(base, register?.offices ?? []) : base;
  }, [netLayer, showUnconfirmed, networkPaintOverride, register]);
  const netCounts = useMemo(() => (net ? kindCounts(net) : null), [net]);
  const activeSet = useMemo(() => {
    const set = net ? interactiveCodes(net) : new Set(Object.keys(stats));
    supportable?.forEach((c) => set.add(c));
    return set;
  }, [net, stats, supportable]);
  const { data: rawWorld } = useQuery(worldQuery);
  const { data: rawRegions } = useRegions(selection.country);
  // الأسماء بلغة الواجهة: الدول من المتصفّح، والمناطق من اسمها اللاتيني في الملفّ.
  const world = useMemo(
    () =>
      rawWorld && locale !== "ar"
        ? {
            ...rawWorld,
            countries: rawWorld.countries.map((x) => ({ ...x, n: countryName(x.c, locale) })),
          }
        : rawWorld,
    [rawWorld, locale],
  );
  const regions = useMemo(
    () => (rawRegions ?? []).map((r) => (locale !== "ar" && r.en ? { ...r, n: r.en } : r)),
    [rawRegions, locale],
  );
  const qc = useQueryClient();
  // الدولة التي ظهرت مناطقها: تبقى مرسومةً أثناء الطيران داخلها (إلى منطقة وعودة).
  const [shownFor, setShownFor] = useState<string | null>(null);
  // الجوار المرسوم داخل دولة: مربّعٌ حولها بستّة أضعاف أكبر بُعدَيها (لا أقلّ من ٢٠ وحدة).
  const nearBox = useMemo<Box | null>(() => {
    const c = world?.countries.find((x) => x.c === shownFor && x.c === selection.country);
    if (!c) return null;
    const [x, y, w, h] = c.b;
    const r = Math.max(w, h, 20) * 6;
    return [x + w / 2 - r, y + h / 2 - r, r * 2, r * 2];
  }, [world, shownFor, selection.country]);
  const selectedCountryRef = useRef(selection.country);
  selectedCountryRef.current = selection.country;
  // ملفّ المناطق يُجلب حين يمرّ المؤشّر على الدولة، فيكون جاهزاً قبل الضغط.
  const prefetchRegions = useCallback(
    (code: string) => void qc.prefetchQuery(regionsQuery(code)),
    [qc],
  );
  const reduce = usePrefersReducedMotion();

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dotsRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<View | null>(null);
  const view = useRef<View | null>(null);
  const [size, setSize] = useState({ w: 1280, h: 660 });
  const [settled, setSettled] = useState(true);
  // على الهاتف البطاقة ورقةٌ سفلية تُطوى لتظهر الخريطة كاملةً، وتعود مع كل اختيارٍ جديد.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(false), [selection.country, selection.region]);
  // طيّ الورقة يحرّك الكاميرا قليلاً لإعادة التوسيط — بلا إخفاء البطاقة ولا رحلةٍ كاملة.
  const sheetOnly = useRef(false);
  const toggleSheet = useCallback((next?: boolean) => {
    sheetOnly.current = true;
    setCollapsed((v) => (next === undefined ? !v : next));
  }, []);
  // تموّجٌ عند اللمس: حلقةٌ تتّسع من نقطة الإصبع ثم تتلاشى.
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const [listOpen, setListOpen] = useState(false);
  // «اكتشف»: جولةٌ تطير بين الدول وحدها حتى يلمس الزائر شيئاً.
  const [touring, setTouring] = useState(false);
  // مؤشّر الطبقة المنزلق: يُقاس من الزرّ المختار بعد كل تغيير.
  const layerRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const btn = layerRef.current?.querySelector<HTMLElement>('button[aria-pressed="true"]');
    setPill(btn ? { left: btn.offsetLeft, width: btn.offsetWidth } : null);
  }, [layer, size.w, locale]);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  // آخر رقمٍ عُرض في البطاقة: الرقم التالي يتدحرج منه.
  const countMemo = useRef(0);
  // الزائر حرّك الخريطة بيده: الإطار صار إطاره لا إطار الهدف، ويظهر «إعادة الضبط».
  const [manual, setManual] = useState(false);
  // الإطار ابتعد عن إطار الهدف (بيد الزائر أو بأزرار التكبير): تصير البوصلة «عودة».
  const [drifted, setDrifted] = useState(false);
  const targetRef = useRef<View | null>(null);
  // آخر دخولٍ بلوحة المفاتيح: حين تظهر مناطق الدولة يُركَّز أكبرها، لا للفأرة.
  const viaKeyboard = useRef(false);
  // تلميحٌ يتبع المؤشّر: اسم الدولة أو المنطقة وعددها — للفأرة وحدها.
  const [tip, setTip] = useState<{ x: number; y: number; name: string; n?: string } | null>(null);
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !settled) return setTip(null);
    const el = (e.target as Element).closest<SVGElement>("[data-tip]");
    const box = wrapRef.current?.getBoundingClientRect();
    if (!el || !box) return setTip(null);
    const [name, n] = (el.dataset["tip"] ?? "").split("|");
    setTip({
      x: e.clientX - box.left,
      y: e.clientY - box.top,
      name: name ?? "",
      ...(n ? { n } : {}),
    });
  };

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
    // تخطيط «تحتاج مكتباً» بعرضٍ ثابت على الشاشة مهما كبّرنا.
    svg.querySelectorAll<SVGPatternElement>("pattern[data-hatch]").forEach((p) => {
      p.setAttribute("patternTransform", `rotate(45) scale(${unit})`);
    });
    // شبكة المحيط: نقاطٌ بمسافةٍ ثابتة على الشاشة، فتُحَسّ حركة الكاميرا حتى فوق الماء.
    svg
      .querySelector<SVGPatternElement>("pattern[data-grid]")
      ?.setAttribute("patternTransform", `scale(${unit})`);
    // مؤشّر التكبير: موضعه على مقياسٍ لوغاريتمي من العالم كاملاً إلى أقصى تكبير.
    const o = outerRef.current;
    if (o && zoomRef.current) {
      const z = Math.log(Math.max(1, zoomLevel(v, o))) / Math.log(MAX_ZOOM);
      zoomRef.current.style.setProperty("--z", String(Math.min(1, Math.max(0, z))));
    }
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
      // الورقة السفلية: ٤٢٪ من الشاشة مفتوحةً (وتتمرّر داخلياً)، و٩ rem مطويّة.
      bottom:
        country && !wide
          ? collapsed
            ? 156
            : Math.round(size.h * 0.42) + 12
          : !country
            ? net && !intro && !wide
              ? 300
              : 120
            : 16,
    };
    const aw = Math.max(1, size.w - inset.side);
    const ah = Math.max(1, size.h - inset.top - inset.bottom);
    let v: View;
    if (region) v = fit(region.b, ah / aw, 2.2, 1.2);
    else if (country) v = fit(country.b, ah / aw, 1.35, 2);
    else if (ah / aw > 0.8) {
      // الجوال طوليّ: العالم كاملاً يصغر حتى لا يُرى. نبدأ من حيث الملفّات.
      const act = world.countries.filter((c) => activeSet.has(c.c));
      const x0 = Math.min(...act.map((c) => c.b[0])),
        y0 = Math.min(...act.map((c) => c.b[1])),
        x1 = Math.max(...act.map((c) => c.b[0] + c.b[2])),
        y1 = Math.max(...act.map((c) => c.b[1] + c.b[3]));
      v = act.length
        ? fit([x0, y0, x1 - x0, y1 - y0], ah / aw, 1.6, 420)
        : fit([0, 0, world.w, world.h], ah / aw, 1);
    } else v = fit([0, 30, world.w, world.h - 60], ah / aw, 1.02);
    const unit = v.w / aw;
    // في RTL البطاقة على اليمين (البداية): نمدّ الإطار يميناً بعرضها.
    return { x: v.x, y: v.y - inset.top * unit, w: size.w * unit, h: size.h * unit };
  }, [world, country, region, size, activeSet, collapsed, net, intro]);

  /* ── الإيماءات: قرصةٌ وسحبٌ وعجلة ──
   * تُحدَّث `view.current` مباشرةً بلا إعادة رسم React — الطبقات لا تتبع
   * الإطار، والنقاط تُعاد بـpaint. والقيد يمنع الضياع. */
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ dist: number; center: Point; moved: boolean } | null>(null);
  // زخم السحب: آخر عيّنات الموضع بزمنها، ومنها سرعة الرفع ليستمرّ الإطار قليلاً ثم يهدأ.
  const samples = useRef<Array<{ x: number; y: number; t: number }>>([]);
  const gestureIdle = useRef<number | undefined>(undefined);
  const inertia = useRef<number>(0);
  const cancelFlight = useRef<(() => void) | null>(null);
  const outer = useMemo<View | null>(() => {
    if (!world) return null;
    return fit([0, 0, world.w, world.h], size.h / Math.max(1, size.w), 1.1);
  }, [world, size]);
  outerRef.current = outer;
  const applyManual = useCallback(
    (next: View) => {
      if (!world || !outer) return;
      cancelFlight.current?.();
      // الحدّ الأقرب: العامّ، أو ربع إطار الهدف إن كان الهدف أقرب منه أصلاً.
      const minW = Math.min(world.w / MAX_ZOOM, (target?.w ?? Infinity) / 4);
      const v = clampView(next, world, outer, minW);
      view.current = v;
      // أثناء الإيماءة تُطفأ الظلال والهالات كما في الطيران: إطارٌ خفيف يتبع الإصبع.
      const sec = svgRef.current?.closest("section");
      sec?.setAttribute("data-gesturing", "");
      window.clearTimeout(gestureIdle.current);
      gestureIdle.current = window.setTimeout(() => sec?.removeAttribute("data-gesturing"), 160);
      paint(v);
      setManual(true);
      setSettled(true);
      setDrifted(!sameView(v, targetRef.current));
    },
    [world, outer, target, paint],
  );
  /**
   * حركةٌ قصيرة بنابض (الأزرار، النقر المزدوج، لوحة المفاتيح): الكاميرا
   * تندفع وتستقرّ بلمسة تجاوزٍ لا تكاد تُرى، والتكبير هندسيّ فكلّ خطوةٍ
   * تُحَسّ بالقدر نفسه.
   */
  const glideTo = useCallback(
    (next: View) => {
      if (!world || !outer || !view.current) return;
      cancelAnimationFrame(inertia.current);
      cancelFlight.current?.();
      const minW = Math.min(world.w / MAX_ZOOM, (target?.w ?? Infinity) / 4);
      const to = clampView(next, world, outer, minW);
      const from = view.current;
      setManual(true);
      setSettled(true);
      setTip(null);
      if (reduce) {
        view.current = to;
        paint(to);
        setDrifted(!sameView(to, targetRef.current));
        return;
      }
      setDrifted(!sameView(to, targetRef.current));
      const sp = spring();
      const sec = svgRef.current?.closest("section");
      sec?.setAttribute("data-gesturing", "");
      const t0 = performance.now();
      let raf = 0;
      const tick = (now: number) => {
        const ms = now - t0;
        const v = lerpView(from, to, sp.at(ms));
        view.current = v;
        paint(v);
        if (ms < sp.duration) raf = requestAnimationFrame(tick);
        else {
          sec?.removeAttribute("data-gesturing");
          cancelFlight.current = null;
        }
      };
      raf = requestAnimationFrame(tick);
      cancelFlight.current = () => {
        cancelAnimationFrame(raf);
        sec?.removeAttribute("data-gesturing");
        cancelFlight.current = null;
      };
    },
    [world, outer, target, paint, reduce],
  );
  const zoomBy = useCallback(
    (factor: number, at?: Point) => {
      if (!view.current) return;
      glideTo(zoomAround(view.current, factor, at ?? { x: size.w / 2, y: size.h / 2 }, size));
    },
    [glideTo, size],
  );
  // النقر المزدوج على الفراغ (أو على أرضٍ لا تُفتح) يقرّب حول موضعه؛ مع Shift يبعّد.
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const localPoint = (e: { clientX: number; clientY: number }): Point => {
    const box = wrapRef.current?.getBoundingClientRect();
    return { x: e.clientX - (box?.left ?? 0), y: e.clientY - (box?.top ?? 0) };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (bare || e.button !== 0) return;
    setTouring(false);
    cancelAnimationFrame(inertia.current);
    const at = localPoint(e);
    samples.current = [{ ...at, t: performance.now() }];
    // تموّجٌ فوق ما يُلمس من الخريطة (دولة، منطقة، نقطة) — لا فوق الفراغ.
    if ((e.target as Element).closest?.("[data-country],[data-region],[data-at]")) {
      const id = performance.now();
      setRipples((r) => [...r.slice(-3), { id, x: at.x, y: at.y }]);
      window.setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 700);
    }
    pointers.current.set(e.pointerId, at);
    const pts = [...pointers.current.values()];
    const start = pts.length >= 2 ? pinchOf(pts[0]!, pts[1]!) : { center: pts[0]!, dist: 0 };
    gesture.current = { ...start, moved: false };
    // لا التقاط هنا: الالتقاط عند الضغط يحوّل هدف النقرة إلى الغلاف فلا تصل
    // إلى الدولة. يُلتقط المؤشّر حين يصير الضغط سحباً فعلاً (في الحركة).
  };
  const onPointerMoveGesture = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId) || !view.current) return;
    pointers.current.set(e.pointerId, localPoint(e));
    const pts = [...pointers.current.values()];
    // إصبعٌ واحد على الجوال يمرّر الصفحة لا الخريطة — إلى أن يقرص الزائر
    // (أو يضغط «إعادة الضبط» لاحقاً). وإلا صار كل تمريرٍ سحباً يقفل الصفحة.
    if (e.pointerType === "touch" && pts.length < 2 && !manual) {
      g.center = pts[0]!;
      return;
    }
    const now = pts.length >= 2 ? pinchOf(pts[0]!, pts[1]!) : { center: pts[0]!, dist: 0 };
    const dx = now.center.x - g.center.x;
    const dy = now.center.y - g.center.y;
    // عتبة ٦ بكسل: دونها نقرة، فوقها سحب — وبعدها لا تُحسب نقرة.
    if (!g.moved && Math.hypot(dx, dy) < 6 && Math.abs(now.dist - g.dist) < 6) return;
    if (!g.moved) {
      // صار سحباً: الآن يُلتقط المؤشّر فلا يضيع إن خرج عن الخريطة، وتُلغى النقرة.
      for (const id of pointers.current.keys()) {
        try {
          wrapRef.current?.setPointerCapture(id);
        } catch {
          /* مؤشّرٌ انتهى قبل الالتقاط: السحب يستمرّ بلا التقاط. */
        }
      }
    }
    g.moved = true;
    samples.current = [...samples.current.slice(-5), { ...now.center, t: performance.now() }];
    let v = panBy(view.current, dx, dy, size);
    if (g.dist > 0 && now.dist > 0) v = zoomAround(v, now.dist / g.dist, now.center, size);
    gesture.current = { ...now, moved: true };
    applyManual(v);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const moved = gesture.current?.moved ?? false;
    if (pointers.current.size === 0) {
      gesture.current = null;
      // سحبٌ انتهى بسرعة: يستمرّ بزخمٍ يتلاشى (٧٪ كل إطار) — لا توقّفٌ فجائي.
      // السرعة من آخر عيّنتين متباعدتين بما يكفي، لا من الإطار الأخير وحده.
      const now_ = performance.now();
      const recent = samples.current.filter((p) => now_ - p.t < 160);
      const a = recent[0];
      const b = recent[recent.length - 1];
      const dt = a && b ? b.t - a.t : 0;
      const vx = dt > 0 ? (b!.x - a!.x) / dt : 0;
      const vy = dt > 0 ? (b!.y - a!.y) / dt : 0;
      if (moved && recent.length >= 2 && Math.hypot(vx, vy) > 0.25) {
        let cx = vx * 16,
          cy = vy * 16;
        const glide = () => {
          if (!view.current || Math.hypot(cx, cy) < 0.3) return;
          applyManual(panBy(view.current, cx, cy, size));
          cx *= 0.93;
          cy *= 0.93;
          inertia.current = requestAnimationFrame(glide);
        };
        inertia.current = requestAnimationFrame(glide);
      }
    } else {
      const pts = [...pointers.current.values()];
      gesture.current = {
        ...(pts.length >= 2 ? pinchOf(pts[0]!, pts[1]!) : { center: pts[0]!, dist: 0 }),
        moved,
      };
    }
    if (!moved && pointers.current.size === 0 && !bare) {
      const at = localPoint(e);
      const onShape = (e.target as Element).closest?.(
        "[data-country],[data-region],[data-at],button,a",
      );
      const prev = lastTap.current;
      if (
        !onShape &&
        prev &&
        performance.now() - prev.t < 320 &&
        Math.hypot(prev.x - at.x, prev.y - at.y) < 30
      ) {
        lastTap.current = null;
        zoomBy(e.shiftKey ? 1 / 2 : 2, at);
      } else lastTap.current = onShape ? null : { t: performance.now(), ...at };
    }
    // سحبٌ انتهى فوق دولة لا يُعدّ ضغطاً عليها — تُكبت نقرته التي تليه
    // مباشرةً فقط؛ وبعد لحظةٍ يُمسح العَلَم فلا يبتلع لمسةً لاحقة بريئة.
    if (moved) {
      suppressClick.current = true;
      window.clearTimeout(suppressTimer.current);
      suppressTimer.current = window.setTimeout(() => (suppressClick.current = false), 250);
    }
  };
  const suppressTimer = useRef<number | undefined>(undefined);
  // المتصفّح أخذ الإيماءة لنفسه (تمرير الصفحة): تُنسى بلا أثر.
  const onPointerCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
  };
  const suppressClick = useRef(false);
  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };
  // العجلة مع Ctrl/⌘ (أو قرصة لوحة اللمس) تكبّر؛ العجلة وحدها تبقى لتمرير الصفحة.
  // مستمعٌ أصليّ غير سلبيّ: React يسجّل wheel سلبيّاً فلا يُمنع تكبير الصفحة.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || bare) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !view.current) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0025);
      applyManual(zoomAround(view.current, factor, localPoint(e), size));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [bare, applyManual, size]);

  targetRef.current = target;
  // الطيران إلى الهدف — والتلميح يُطفأ: ما تحت المؤشّر تغيّر.
  useEffect(() => {
    setTip(null);
    setManual(false);
    setDrifted(false);
    if (!target) return;
    const from = view.current;
    if (!from || reduce) {
      view.current = target;
      paint(target);
      setSettled(true);
      setShownFor(selectedCountryRef.current);
      return;
    }
    const f = flight(from, target);
    let raf = 0;
    const t0 = performance.now();
    cancelAnimationFrame(inertia.current);
    const gentle = sheetOnly.current;
    sheetOnly.current = false;
    const duration = gentle ? 420 : f.duration;
    if (!gentle) setSettled(false);
    // أثناء الطيران: رسمٌ أسرع للأشكال، والنبض متوقّف — الكاميرا وحدها تتحرّك.
    svgRef.current?.closest("section")?.setAttribute("data-flying", "");
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const v = f.at(gentle ? easeOut(t) : easeInOut(t));
      view.current = v;
      paint(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else {
        svgRef.current?.closest("section")?.removeAttribute("data-flying");
        setSettled(true);
        setShownFor(selectedCountryRef.current);
      }
    };
    raf = requestAnimationFrame(tick);
    const stop = () => {
      cancelAnimationFrame(raf);
      svgRef.current?.closest("section")?.removeAttribute("data-flying");
      cancelFlight.current = null;
    };
    cancelFlight.current = stop;
    return stop;
  }, [target, paint, reduce]);

  // «إعادة الضبط»: عودةٌ بطيرانٍ إلى إطار الهدف الحالي.
  const resetView = useCallback(() => {
    if (!target || !view.current) return;
    setManual(false);
    setDrifted(false);
    const from = view.current;
    if (reduce) {
      view.current = target;
      paint(target);
      return;
    }
    const f = flight(from, target);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / f.duration);
      const v = f.at(easeInOut(t));
      view.current = v;
      paint(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else cancelFlight.current = null;
    };
    raf = requestAnimationFrame(tick);
    cancelFlight.current = () => cancelAnimationFrame(raf);
  }, [target, paint, reduce]);

  // النقاط تُعاد بعد كل رسم للطبقة.
  useEffect(() => {
    if (view.current) paint(view.current);
  });

  // Escape يرجع خطوة.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setTouring(false);
      if (selection.region) onSelect({ country: selection.country, region: null });
      else if (selection.country) onSelect({ country: null, region: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, onSelect]);

  // نبضةٌ خفيفة عند الاختيار حيث يدعمها الجهاز (أندرويد)؛ وعلى غيره لا شيء.
  const haptic = () => {
    try {
      navigator.vibrate?.(8);
    } catch {
      /* لا شيء */
    }
  };
  const pickCountry = useCallback(
    (c: string) => {
      haptic();
      setTouring(false);
      onSelect({ country: c, region: null });
    },
    [onSelect],
  );
  const pickRegion = useCallback(
    (id: string) => {
      haptic();
      setTouring(false);
      onSelect({ country: selection.country, region: id });
    },
    [onSelect, selection.country],
  );

  /* ── لوحة المفاتيح على الخريطة نفسها ──
   * الأسهم تنتقل إلى أقرب دولةٍ (أو منطقة) في اتّجاهها بالمراكز المسقَطة،
   * وEnter/Space تدخل. فتكون الخريطة هي المسار لا القائمة البديلة وحدها. */
  const focusShape = (attr: "country" | "region", id: string) => {
    svgRef.current?.querySelector<SVGPathElement>(`[data-${attr}="${CSS.escape(id)}"]`)?.focus();
  };
  const onCountryKey = useCallback(
    (e: React.KeyboardEvent<SVGPathElement>, code: string) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        viaKeyboard.current = true;
        pickCountry(code);
        return;
      }
      const dir = dirOfKey(e.key);
      if (!dir || !world) return;
      e.preventDefault();
      const from = world.countries.find((c) => c.c === code);
      if (!from) return;
      const next = nearestInDirection(
        { x: from.p[0], y: from.p[1] },
        world.countries.filter((c) => activeSet.has(c.c) && c.c !== code),
        (c) => ({ x: c.p[0], y: c.p[1] }),
        dir,
      );
      if (next) focusShape("country", next.c);
    },
    [world, activeSet, pickCountry],
  );
  const onRegionKey = useCallback(
    (e: React.KeyboardEvent<SVGPathElement>, id: string) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        viaKeyboard.current = true;
        pickRegion(id);
        return;
      }
      const dir = dirOfKey(e.key);
      if (!dir) return;
      e.preventDefault();
      const from = regions.find((r) => r.id === id);
      if (!from) return;
      const next = nearestInDirection(
        { x: from.p[0], y: from.p[1] },
        regions.filter((r) => r.id !== id && statFor(r, cStat)),
        (r) => ({ x: r.p[0], y: r.p[1] }),
        dir,
      );
      if (next) focusShape("region", next.id);
    },
    [regions, cStat, pickRegion],
  );

  const activeCountries = useMemo(
    () =>
      (world?.countries ?? [])
        .filter((c) => stats[c.c])
        .sort((a, b) => rankOf(layer, stats[b.c]) - rankOf(layer, stats[a.c])),
    [world, stats, layer],
  );
  const rankedRegions = useMemo(
    () =>
      regions
        .map((r) => ({ r, s: statFor(r, cStat) }))
        .filter((x) => x.s)
        .sort((a, b) => rankOf(layer, b.s) - rankOf(layer, a.s)),
    [regions, cStat, layer],
  );

  /* ── التنقّل: البحث، والجولة، والسابق/التالي ── */
  const tourCodes = useMemo(
    () =>
      net
        ? (world?.countries ?? []).filter((c) => activeSet.has(c.c)).map((c) => c.c)
        : activeCountries.map((c) => c.c),
    [net, world, activeSet, activeCountries],
  );
  const tourMs = 5200;
  useEffect(() => {
    if (!touring || !settled || tourCodes.length < 2) return;
    const id = window.setTimeout(
      () => {
        const i = tourCodes.indexOf(selection.country ?? "");
        const next = tourCodes[(i + 1) % tourCodes.length];
        if (next) onSelect({ country: next, region: null });
      },
      selection.country ? tourMs : 500,
    );
    return () => window.clearTimeout(id);
  }, [touring, settled, selection.country, tourCodes, onSelect]);

  /** الدولة (أو المنطقة) المجاورة في الترتيب نفسه الذي تعرضه القائمة. */
  const stepPlace = useCallback(
    (d: 1 | -1) => {
      const list = selection.region ? rankedRegions.map((x) => x.r.id) : tourCodes;
      const cur = selection.region ?? selection.country ?? "";
      const i = list.indexOf(cur);
      if (list.length < 2) return;
      const next = list[(Math.max(0, i) + d + list.length) % list.length]!;
      if (selection.region) pickRegion(next);
      else pickCountry(next);
    },
    [selection, rankedRegions, tourCodes, pickRegion, pickCountry],
  );
  const siblingsCount = selection.region ? rankedRegions.length : tourCodes.length;

  const searchItems = useMemo<SearchItem[]>(() => {
    if (!world) return [];
    const cs: SearchItem[] = world.countries
      .filter((c) => activeSet.has(c.c))
      .map((c) => {
        const st = net ? undefined : stats[c.c];
        return {
          key: `c-${c.c}`,
          label: c.n,
          alt: [countryName(c.c, "en"), countryName(c.c, "ar"), c.c],
          ...(st ? { sub: shown(st.total, locale) } : {}),
          kind: "country",
          go: () => pickCountry(c.c),
        };
      });
    const rs: SearchItem[] =
      country && !net
        ? regions.map((r) => ({
            key: `r-${r.id}`,
            label: r.n,
            alt: [r.en, ...r.alt.split("|")].filter(Boolean),
            sub: country.n,
            kind: "region",
            go: () => pickRegion(r.id),
          }))
        : [];
    return [...rs, ...cs];
  }, [world, activeSet, net, stats, locale, country, regions, pickCountry, pickRegion]);

  // + و− و0 على الخريطة (لا في حقلٍ يُكتب فيه).
  const onMapKey = (e: React.KeyboardEvent) => {
    if (bare || (e.target as HTMLElement).closest("input,textarea")) return;
    if (e.key === "+" || e.key === "=") zoomBy(1.8);
    else if (e.key === "-" || e.key === "_") zoomBy(1 / 1.8);
    else if (e.key === "0") onCompass();
    else return;
    e.preventDefault();
  };
  // البوصلة: من إطارٍ حرّكه الزائر إلى إطار الهدف، ومن دولةٍ إلى العالم.
  const onCompass = () => {
    setTouring(false);
    if (drifted) resetView();
    else if (selection.country) onSelect({ country: null, region: null });
  };

  // المجموع من الدول التي يُكشف عددها؛ الصغيرة تُذكر دون رقمها.
  const totals = { total: Object.values(stats).reduce((a, s) => a + (s.total ?? 0), 0) };

  // فتح البطاقة يركّز عنوانها، وإغلاقها يعيد التركيز إلى ما فتحها؛ إلا دخول
  // الدولة بالأسهم فيبقى على مسار المناطق أدناه.
  const cardTitle = useRef<HTMLHeadingElement>(null);
  const cardTrigger = useRef<HTMLElement | null>(null);
  const cardOpen = !!selection.country;
  useEffect(() => {
    if (cardOpen) {
      const active = document.activeElement;
      if (active instanceof HTMLElement || active instanceof SVGElement) {
        if (!cardTitle.current?.closest(".map-card")?.contains(active))
          cardTrigger.current = active as HTMLElement;
      }
      if (!viaKeyboard.current) cardTitle.current?.focus({ preventScroll: true });
      return;
    }
    const back = cardTrigger.current;
    cardTrigger.current = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  }, [cardOpen]);

  // دخلنا دولةً بلوحة المفاتيح: حين تستقرّ وتظهر مناطقها يُركَّز أكبرها.
  const revealedNow = !!country && shownFor === country.c && regions.length > 0 && settled;
  useEffect(() => {
    if (!revealedNow || !viaKeyboard.current || selection.region) return;
    viaKeyboard.current = false;
    const top = rankedRegions[0]?.r.id;
    if (top) focusShape("region", top);
  }, [revealedNow, rankedRegions, selection.region]);

  return (
    <section
      aria-label={c$.section}
      onKeyDown={onMapKey}
      className={cn(
        "relative isolate h-[calc(100dvh-4rem)] min-h-[32rem] overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,var(--color-thrive-tint),var(--color-background)_70%)]",
        className,
      )}
    >
      <div
        ref={wrapRef}
        className="absolute inset-0"
        // إصبعٌ واحد يمرّر الصفحة عمودياً ما لم يحرّك الزائر الخريطة؛ بعدها الخريطة له كلّها.
        style={{ touchAction: bare ? "auto" : manual ? "none" : "pan-y" }}
        onPointerMove={(e) => {
          onPointerMoveGesture(e);
          onPointerMove(e);
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => setTip(null)}
        onClickCapture={onClickCapture}
      >
        {world && (
          <svg
            ref={svgRef}
            className="size-full select-none"
            preserveAspectRatio="xMidYMid meet"
            role="group"
            aria-label={
              country ? c$.mapOf(`${country.n}${region ? ` — ${region.n}` : ""}`) : c$.worldMap
            }
            aria-description={bare ? undefined : c$.hint}
          >
            {net && <NetworkPatterns />}
            {/* المحيط: شبكة نقاطٍ خافتة ثابتة الحجم على الشاشة — عمقٌ وإحساسٌ بالحركة. */}
            <defs>
              <pattern
                id="map-grid"
                data-grid=""
                width={22}
                height={22}
                patternUnits="userSpaceOnUse"
              >
                <circle cx={11} cy={11} r={1} className="fill-foreground/[0.09]" />
              </pattern>
            </defs>
            <rect
              aria-hidden="true"
              x={-world.w}
              y={-world.h}
              width={world.w * 3}
              height={world.h * 3}
              fill="url(#map-grid)"
              className="map-grid pointer-events-none"
            />
            {/* الهبوط الأوّل: العالم يستقرّ من تكبيرٍ خفيف. */}
            <g className="map-land">
              <CountriesLayer
                countries={world.countries}
                stats={net ? NO_STATS : stats}
                extra={net ? undefined : supportable}
                focus={selection.country}
                revealed={!net && !!country && shownFor === country.c && regions.length > 0}
                near={nearBox}
                onPick={pickCountry}
                onHover={prefetchRegions}
                onKey={onCountryKey}
                label={c$.countryButton}
                layer={layer}
              />
              {net && (
                <NetworkShapes
                  countries={world.countries}
                  paint={net}
                  focus={selection.country}
                  onPick={pickCountry}
                  onHover={prefetchRegions}
                  onKey={onCountryKey}
                />
              )}
            </g>
            {/* المناطق تُرسم بعد الهبوط — لا تُثقل الطيران — ثم تظهر بالتتابع. */}
            {!net && country && regions.length > 0 && shownFor === country.c && (
              <RegionsLayer
                key={country.c}
                regions={regions}
                stat={cStat}
                selected={selection.region}
                onPick={pickRegion}
                onKey={onRegionKey}
                label={c$.regionButton}
                layer={layer}
              />
            )}
            {/* حدّ الدولة المختارة يُرسم بخطٍّ مضيء — تنفصل عن الخريطة كأنها رُفعت. */}
            {country && settled && (
              <path
                key={`outline-${country.c}`}
                d={country.d}
                pathLength={1}
                fill="none"
                vectorEffect="non-scaling-stroke"
                aria-hidden="true"
                className="map-outline pointer-events-none"
              />
            )}
            {/* نقاط ذهبية تنبض فوق الدول التي فيها ملفّات — في العالم فقط. */}
            <g
              ref={dotsRef}
              className={cn("transition-opacity duration-500", country && "opacity-0")}
            >
              {net ? (
                <NetworkMarkers
                  countries={world.countries}
                  paint={net}
                  interactive={!country}
                  onPick={pickCountry}
                  onHover={prefetchRegions}
                />
              ) : (
                activeCountries.map((c, i) => (
                  // النقطة نفسها هدف اللمس: الدولة الصغيرة على الهاتف بضعة بكسلات،
                  // والنقطة ٢٨ بكسلاً فتُصاب بالإبهام.
                  <g
                    key={c.c}
                    data-at={`${c.p[0]} ${c.p[1]}`}
                    className={cn(
                      "cursor-pointer",
                      country ? "pointer-events-none" : "pointer-events-auto",
                    )}
                    onClick={() => pickCountry(c.c)}
                    onPointerEnter={() => prefetchRegions(c.c)}
                  >
                    <g className="map-dot" style={{ ["--i" as string]: i }}>
                      <circle r={14} className="map-pulse fill-bridge/30" />
                      <circle r={5} className="fill-bridge stroke-background" strokeWidth={2} />
                    </g>
                  </g>
                ))
              )}
            </g>
          </svg>
        )}

        {/* وسوم المناطق على الخريطة بعد أن تستقرّ: الاسم والعدد، وتُضغط. */}
        {!bare && !net && country && !region && settled && view.current && (
          <div className="pointer-events-none absolute inset-0">
            {placeLabels(rankedRegions, view.current, size).map(({ r, s: rs, x, y }, i) => {
              return (
                <button
                  key={r.id}
                  type="button"
                  tabIndex={-1}
                  onClick={() => pickRegion(r.id)}
                  style={{ left: x, top: y, ["--i" as string]: i }}
                  className="map-label pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-card/90 px-2.5 py-1 text-xs font-medium whitespace-nowrap shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_4px_12px_-4px_rgb(0_0_0/0.2)] backdrop-blur transition-[scale] duration-150 hover:scale-105"
                >
                  {r.n}{" "}
                  <span className="tabular-nums text-primary">
                    {metricText(layer, rs, locale, shown(null, locale))}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {ripples.map((r) => (
          <span
            key={r.id}
            aria-hidden="true"
            style={{ left: r.x, top: r.y }}
            className="map-ripple pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bridge"
          />
        ))}
        {tip && (
          <div
            role="presentation"
            style={{ left: tip.x, top: tip.y }}
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-xl bg-foreground px-3 py-1.5 text-xs whitespace-nowrap text-background shadow-lg"
          >
            <span className="font-semibold">{tip.name}</span>
            {tip.n && <span className="ms-2 tabular-nums opacity-80">{tip.n}</span>}
          </div>
        )}
      </div>

      {/* إطارٌ ناعم يجمع العين نحو الوسط. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,color-mix(in_oklch,var(--color-background)_85%,transparent)_100%)]"
      />

      {/* بقعة ضوء: داخل دولةٍ تخفت الأطراف فتجتمع العين على المكان. */}
      <div
        aria-hidden="true"
        className={cn(
          "map-spotlight pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700",
          country && !bare && "opacity-100",
        )}
      />

      {!bare && (
        <>
          {/* ── أدوات الكاميرا: تكبير، ومؤشّر المستوى، وتصغير، وبوصلة ── */}
          <div
            ref={zoomRef}
            role="group"
            aria-label={c$.zoom}
            // على الهاتف تُخلي مكانها للورقة المفتوحة (القرصة تكفي)، وتعود حين تُطوى.
            data-hidden={(!!country && !collapsed) || undefined}
            className="map-controls pointer-events-auto absolute end-3 top-56 z-[5] transition-[opacity,translate] duration-300 max-md:data-[hidden]:pointer-events-none max-md:data-[hidden]:translate-x-3 max-md:data-[hidden]:opacity-0 flex flex-col items-center gap-0.5 rounded-full bg-card/85 p-1 shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_8px_24px_-10px_rgb(0_0_0/0.3)] backdrop-blur md:end-6 md:top-auto md:bottom-6"
          >
            <button
              type="button"
              aria-label={c$.zoomIn}
              title={`${c$.zoomIn} (+)`}
              onClick={() => {
                setTouring(false);
                zoomBy(1.8);
              }}
              className="map-ctrl"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
            <div
              aria-hidden="true"
              className="relative my-1 hidden h-14 w-1 rounded-full bg-secondary sm:block"
            >
              <span className="map-zoom-thumb absolute -inset-x-[3px] h-2.5 rounded-full bg-primary shadow-sm" />
            </div>
            <button
              type="button"
              aria-label={c$.zoomOut}
              title={`${c$.zoomOut} (−)`}
              onClick={() => {
                setTouring(false);
                zoomBy(1 / 1.8);
              }}
              className="map-ctrl"
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
            <span aria-hidden="true" className="my-0.5 h-px w-5 bg-border" />
            <button
              type="button"
              aria-label={drifted ? c$.zoomFit : c$.zoomWorld}
              title={`${drifted ? c$.zoomFit : c$.zoomWorld} (0)`}
              onClick={onCompass}
              disabled={!country && !drifted}
              className="map-ctrl disabled:opacity-40"
            >
              {drifted ? (
                <LocateFixed className="size-4" aria-hidden="true" />
              ) : (
                <Compass className="map-compass size-4" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* ── الطبقة العلوية: المسار، والعنوان، والبطاقات ── */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3 md:gap-3 md:p-6">
            <nav aria-label={c$.breadcrumb} className="pointer-events-auto">
              <ol className="flex flex-wrap items-center gap-1 rounded-full bg-card/85 p-1 text-sm shadow-sm backdrop-blur">
                <li>
                  <button
                    type="button"
                    onClick={() => onSelect({ country: null, region: null })}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 transition-colors",
                      !country ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
                    )}
                  >
                    <Globe2 className="size-4" aria-hidden="true" />
                    {c$.world}
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
                        "min-h-11 rounded-full px-3 transition-colors",
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
                    <span className="min-h-11 rounded-full bg-primary px-3 py-1.5 text-primary-foreground">
                      {region.n}
                    </span>
                  </li>
                )}
              </ol>
            </nav>

            <div className="pointer-events-auto flex w-full flex-wrap items-center gap-2 md:w-auto">
              {onLayer && (
                <div
                  ref={layerRef}
                  role="group"
                  aria-label={c$.layers}
                  className="relative flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-card/85 p-1 text-sm shadow-sm backdrop-blur [scrollbar-width:none]"
                >
                  {/* مؤشّرٌ ينزلق بين الطبقات بدل أن يقفز اللون من زرٍّ إلى زرّ. */}
                  {pill && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "map-pill absolute inset-y-1 rounded-full",
                        layer === "needs" ? "bg-office-gap" : "bg-primary",
                      )}
                      style={{ left: pill.left, width: pill.width }}
                    />
                  )}
                  <Layers
                    className="ms-2 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {(
                    [
                      ["network", n$.layerNetwork, n$.layerNetworkHint],
                      ["needs", n$.layerNeeds, n$.layerNeedsHint],
                      ["waiting", c$.layerWaiting, c$.layerWaitingHint],
                      ["impact", c$.layerImpact, c$.layerImpactHint],
                      ["gap", c$.layerGap, c$.layerGapHint],
                    ] as const
                  ).map(([key, name, hint], i) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={layer === key}
                      title={hint}
                      onClick={() => onLayer(key)}
                      className={cn(
                        "relative min-h-11 shrink-0 rounded-full px-3 whitespace-nowrap transition-colors duration-300",
                        // فاصلٌ رفيع بين طبقتي الشبكة (بحثية) وطبقات المنصّة (حيّة).
                        i === 2 && "ms-1.5",
                        layer === key
                          ? key === "needs"
                            ? "text-card"
                            : "text-primary-foreground"
                          : "hover:bg-secondary/70",
                        // قبل القياس الأوّل: لونٌ ثابت كما كان.
                        layer === key &&
                          !pill &&
                          (key === "needs" ? "bg-office-gap" : "bg-primary"),
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
              {source === "demo" && (
                <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                  {c$.demo}
                </span>
              )}
              {source === "unavailable" && !net && (
                <span
                  role="status"
                  className="rounded-full bg-card/85 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur"
                >
                  {c$.unavailable}
                </span>
              )}
              <MapSearch
                items={searchItems}
                copy={{
                  open: c$.search,
                  placeholder: c$.searchPlaceholder,
                  none: c$.searchNone,
                  close: c$.searchClose,
                }}
              />
              {tourCodes.length > 1 && (
                <button
                  type="button"
                  aria-pressed={touring}
                  onClick={() => setTouring((t) => !t)}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm shadow-sm backdrop-blur transition-[background-color,color,scale] active:scale-[0.97]",
                    touring ? "bg-bridge text-bridge-foreground" : "bg-card/85 hover:bg-card",
                  )}
                >
                  {touring ? (
                    <Pause className="size-4" aria-hidden="true" />
                  ) : (
                    <Play className="size-4" aria-hidden="true" />
                  )}
                  <span className="max-sm:sr-only">{touring ? c$.tourStop : c$.tour}</span>
                </button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 shrink-0 bg-card/85 backdrop-blur"
                aria-expanded={listOpen}
                onClick={() => setListOpen((o) => !o)}
              >
                <List aria-hidden="true" />
                {c$.list}
              </Button>
            </div>
          </div>

          {/* العالم: سطرٌ واحد ودعوة. */}
          {!country && (
            <div
              key="world"
              className="map-rise pointer-events-none absolute inset-x-0 bottom-0 p-4 text-center md:p-10"
            >
              {net && netLayer && netCounts && !intro ? (
                <NetworkIntro layer={netLayer} counts={netCounts} admin={showUnconfirmed} />
              ) : (
                <>
                  <p className="font-serif text-3xl font-bold text-primary md:text-5xl">
                    {intro?.title ?? c$.pick}
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground md:text-base">
                    {intro?.text ??
                      (source === "loading" ? (
                        // هيكلٌ بلا رقم: لا يُعرض عددٌ لم يصل بعد.
                        <span
                          role="status"
                          aria-busy="true"
                          className="inline-flex flex-col items-center gap-2"
                        >
                          <span className="sr-only">{c$.loading}</span>
                          <span
                            aria-hidden="true"
                            className="block h-4 w-64 max-w-full animate-pulse rounded-full bg-muted"
                          />
                          <span
                            aria-hidden="true"
                            className="block h-4 w-40 max-w-full animate-pulse rounded-full bg-muted"
                          />
                        </span>
                      ) : source === "unavailable" ? (
                        c$.unavailableHere
                      ) : (
                        <>
                          {c$.introA}{" "}
                          <strong className="text-foreground tabular-nums">
                            {shown(totals.total, locale)}
                          </strong>{" "}
                          {c$.introB}{" "}
                          <strong className="text-foreground">
                            {c$.countries(activeCountries.length)}
                          </strong>
                          .
                        </>
                      ))}
                  </p>
                </>
              )}
            </div>
          )}

          {/* الدولة أو المنطقة: بطاقةٌ في أسفل البداية. */}
          {country && settled && (
            <aside
              key={`${country.c}-${region?.id ?? ""}`}
              aria-live="polite"
              data-collapsed={collapsed || undefined}
              // سحبٌ أفقيّ على البطاقة ينتقل إلى الجار: في العربية يميناً للتالي.
              onPointerDown={(e) => {
                swipe.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerUp={(e) => {
                const s0 = swipe.current;
                swipe.current = null;
                if (!s0) return;
                const dx = e.clientX - s0.x;
                const dy = e.clientY - s0.y;
                if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 2) return;
                stepPlace(dx > 0 === (locale === "ar") ? 1 : -1);
              }}
              style={{ touchAction: "pan-y" }}
              className={cn(
                "map-card map-sheet absolute inset-x-3 bottom-3 overflow-y-auto overscroll-contain rounded-3xl bg-card/95 p-5 pt-3 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_12px_32px_-8px_rgb(0_0_0/0.18)] backdrop-blur md:inset-x-auto md:start-6 md:bottom-6 md:w-96 md:pt-5",
                // بطاقة الشبكة أطول (ثلاث كتل): تتمرّر داخلها على الحاسوب أيضاً.
                net ? "md:top-20 md:overflow-y-auto" : "md:overflow-visible",
                collapsed ? "max-h-36" : "max-h-[42dvh] md:max-h-none",
              )}
            >
              {/* مقبض الورقة (هاتف): اضغط أو اسحب لأسفل لطيّها فترى الخريطة. */}
              <button
                type="button"
                aria-expanded={!collapsed}
                aria-label={collapsed ? c$.expand : c$.collapse}
                onClick={() => toggleSheet()}
                onPointerDown={(e) => {
                  const y0 = e.clientY;
                  const onMove = (ev: PointerEvent) => {
                    const dy = ev.clientY - y0;
                    if (Math.abs(dy) < 28) return;
                    toggleSheet(dy > 0);
                    done();
                  };
                  const done = () => {
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", done);
                  };
                  window.addEventListener("pointermove", onMove);
                  window.addEventListener("pointerup", done);
                }}
                className="mx-auto mb-2 block h-6 w-16 touch-none rounded-full md:hidden"
              >
                <span className="mx-auto block h-1.5 w-10 rounded-full bg-border" />
              </button>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3.5" aria-hidden="true" />
                    {region ? country.n : c$.country}
                  </p>
                  <h2
                    ref={cardTitle}
                    tabIndex={-1}
                    className="map-title mt-1 text-2xl font-extrabold outline-none"
                  >
                    {region ? region.n : country.n}
                  </h2>
                </div>
                <div className="-m-1 flex shrink-0 items-center gap-0.5">
                  {siblingsCount > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label={c$.prev}
                        title={c$.prev}
                        onClick={() => stepPlace(-1)}
                        className="grid size-11 place-items-center rounded-full text-muted-foreground transition-[background-color,transform] hover:bg-secondary active:scale-90"
                      >
                        <ChevronRight className="size-4 ltr:-scale-x-100" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={c$.next}
                        title={c$.next}
                        onClick={() => stepPlace(1)}
                        className="grid size-11 place-items-center rounded-full text-muted-foreground transition-[background-color,transform] hover:bg-secondary active:scale-90"
                      >
                        <ChevronLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    aria-label={c$.back}
                    onClick={() =>
                      onSelect(
                        region
                          ? { country: country.c, region: null }
                          : { country: null, region: null },
                      )
                    }
                    className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-[background-color,transform] hover:bg-secondary active:scale-95"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {/* الجولة: شريطٌ يمتلئ حتى الدولة التالية. */}
              {touring && (
                <span
                  aria-hidden="true"
                  className="map-tour-bar absolute inset-x-5 top-0 h-0.5 rounded-full bg-bridge"
                  style={{ animationDuration: `${tourMs}ms` }}
                />
              )}

              {(() => {
                // في طبقتي الشبكة تصير أعداد المنصّة الكتلة الثالثة بحجمٍ مختصر.
                const compact = cardCompact || !!net;
                const platform = (() => {
                  const s = region ? rStat : cStat;
                  // بلا أرقامٍ بعد (تحميل أو تعذّر): لا يُقال «لا ملفّات هنا» وهو غير معروف.
                  if (!s) {
                    const note = (
                      <p className="mt-4 text-sm leading-7 text-muted-foreground">
                        {source === "loading"
                          ? c$.loading
                          : source === "unavailable"
                            ? c$.unavailableHere
                            : c$.none}
                      </p>
                    );
                    // بلا ملفّات أطفال: يبقى دعم المكان نفسه متاحاً في دول الشبكة.
                    if (!action || !supportable?.has(country.c)) return note;
                    return (
                      <>
                        {note}
                        <div className="mt-3">
                          {action({
                            code: country.c,
                            countryValue: null,
                            regionValue: null,
                            regionName: region?.n ?? null,
                          })}
                        </div>
                      </>
                    );
                  }
                  // التقسيم يأتي من القاعدة محجوباً إن صغر أحد شقّيه.
                  const split = s.total != null && s.sponsored != null;
                  const need = split ? s.total! - s.sponsored! : null;
                  const pct = split ? Math.round((s.sponsored! / Math.max(1, s.total!)) * 100) : 0;
                  const small = s.small || s.total == null;
                  return (
                    <>
                      <p className={cn("flex items-baseline gap-2", compact ? "mt-1" : "mt-4")}>
                        <span
                          className={cn(
                            "font-extrabold text-primary",
                            compact ? "text-3xl" : "text-5xl",
                          )}
                        >
                          {small ? (
                            shown(null, locale)
                          ) : (
                            <CountUp to={s.total!} reduce={reduce} memo={countMemo} />
                          )}
                        </span>
                        <span className="text-sm text-muted-foreground">{c$.verified}</span>
                      </p>
                      {split && !compact && (
                        <>
                          <div
                            className="mt-4 h-2 overflow-hidden rounded-full bg-secondary"
                            role="img"
                            aria-label={c$.pctSponsored(pct)}
                          >
                            <div
                              className="map-grow h-full rounded-full bg-primary"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <dl className="mt-2 flex justify-between text-sm">
                            <div className="flex gap-1">
                              <dt className="text-muted-foreground">{c$.sponsored}</dt>
                              <dd className="font-semibold tabular-nums">
                                {shown(s.sponsored, locale)}
                              </dd>
                            </div>
                            <div className="flex gap-1">
                              <dt className="text-muted-foreground">{c$.waiting}</dt>
                              <dd className="font-semibold tabular-nums text-bridge-ink">
                                {shown(need, locale)}
                              </dd>
                            </div>
                          </dl>
                        </>
                      )}
                      {!compact && layer === "gap" && s.gap != null && (
                        <p className="mt-3 flex items-baseline justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">{c$.gap}</span>
                          <span className="font-semibold tabular-nums text-shore-need">
                            {formatMoney(s.gap, s.currency ?? "USD", locale)}
                          </span>
                        </p>
                      )}
                      {!compact && layer === "impact" && s.delivered != null && (
                        <p className="mt-3 flex items-baseline justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">{c$.delivered}</span>
                          <span className="font-semibold tabular-nums">
                            {shown(s.delivered, locale)}
                          </span>
                        </p>
                      )}
                      {(small || !split) && !compact && (
                        <p className="mt-2 text-xs leading-6 text-muted-foreground">
                          {c$.cohort(COHORT_MIN)}
                        </p>
                      )}
                      {action ? (
                        <div className={compact ? "mt-3" : "mt-5"}>
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
                              // قيم القاعدة نفسها — فالدليل يجد ما وجدته الخريطة.
                              country: cStat?.value ?? country.c,
                              ...(region && rStat ? { region: rStat.value } : {}),
                              funding: "open",
                            }}
                          >
                            {c$.browse}
                            <ArrowLeft className="ltr:-scale-x-100" aria-hidden="true" />
                          </Link>
                        </Button>
                      )}
                      {!region && !compact && rankedRegions.length > 0 && (
                        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={c$.regions}>
                          {rankedRegions.slice(0, 6).map(({ r, s: rs }) => (
                            <li key={r.id}>
                              <button
                                type="button"
                                onClick={() => pickRegion(r.id)}
                                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-secondary px-3 text-xs transition-[background-color,transform] hover:bg-accent active:scale-[0.97]"
                              >
                                {r.n}
                                <span className="tabular-nums text-muted-foreground">
                                  {metricText(layer, rs, locale, shown(null, locale))}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  );
                })();
                return net && countryCard ? (
                  countryCard(country.c)
                ) : net ? (
                  <NetworkCountryCard
                    code={country.c}
                    admin={showUnconfirmed}
                    platform={platform}
                  />
                ) : (
                  platform
                );
              })()}
              {/* الخريطة والقاعة منظرٌ واحد: الدولة نفسها في قاعة الأثر ثلاثية الأبعاد. */}
              {!bare && (
                <a
                  href={`/hall?c=${country.c}`}
                  data-to-hall
                  className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-primary underline-offset-4 hover:underline"
                >
                  {c$.toHall}
                </a>
              )}
            </aside>
          )}

          {/* القائمة: البديل الكامل للخارطة. */}
          {listOpen && (
            <div
              role="dialog"
              aria-label={c$.listLabel}
              className="map-rise absolute inset-y-3 end-3 w-[min(22rem,calc(100%-1.5rem))] overflow-y-auto rounded-3xl bg-card/95 p-4 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_12px_32px_-8px_rgb(0_0_0/0.18)] backdrop-blur"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-bold">
                  {netLayer === "needs"
                    ? n$.decision
                    : net
                      ? n$.officesH
                      : country
                        ? c$.regionsOf(country.n)
                        : c$.countriesH}
                </h2>
                <button
                  type="button"
                  aria-label={c$.closeList}
                  onClick={() => setListOpen(false)}
                  className="grid size-11 place-items-center rounded-full hover:bg-secondary"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
              {net ? (
                <div className="mt-3">
                  {netLayer === "needs" ? (
                    <>
                      <p className="mb-3 text-xs leading-6 text-muted-foreground">
                        {n$.decisionLead}
                      </p>
                      <ExpansionList
                        dense
                        onPick={(code) => {
                          pickCountry(code);
                          setListOpen(false);
                        }}
                      />
                    </>
                  ) : (
                    <PresenceList
                      paint={net}
                      onPick={(code) => {
                        pickCountry(code);
                        setListOpen(false);
                      }}
                    />
                  )}
                </div>
              ) : (
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
                          {shown(x.n, locale)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
