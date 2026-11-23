import { useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";

import { brandFor } from "@/config/brand";
import { COLORS } from "@/config/brand-colors";
import {
  MARK2_CRESCENT,
  MARK2_DISC,
  MARK2_RING,
  MARK2_SLOTS,
  MARK2_VIEWBOX,
} from "@/components/brand/KahataynMark";
import { GIVING_TRACKS, givingCopy } from "@/config/giving-tracks";
import { NETWORK_SITES } from "@/data/vision-network";
import { geoQuery } from "@/lib/geo";
import { hallEntryOf, onPop, onStage, type HallStep } from "@/lib/hall/history";
import { hallLocale } from "@/lib/hall/copy";
import { donorHall, donorOrphanIds } from "@/lib/hall/donor";
import { loadHallScene, loadHallTrial } from "@/lib/hall/preload";
import { hallLanguage, hallLiveRows, hallSource } from "@/lib/hall/source";
import { formatCount } from "@/lib/format";
import { copyOf, defineCopy, dirOf, useLocale } from "@/lib/locale";
import { getPublicOrphan } from "@/lib/orphans.functions";
import { listMySponsorships } from "@/lib/sponsorships.functions";
import { getOperatingLinks } from "@/lib/vision-links.functions";

/**
 * ?try=1 opens the hall in the client demo; ?child=&cadence= replays a simulated gift there;
 * ?c= lands on a country and ?from= is the page to return to (`@/lib/hall/source`).
 */

export const Route = createLazyFileRoute("/hall")({ component: HallPage });

/** the hall's chrome, in the interface language (the scene's own strings are in `lib/hall/copy`) */
const COPY = defineCopy("routes/hall.lazy", {
  ar: {
    tag: "رحلة افتراضية",
    liveTag: "أرقام نموذجية (نموذج توضيحي)",
    gate: "أنت الآن في رحلةٍ افتراضية: كلّ ما في القاعة محاكاة، ولا يُخصم شيء.",
    gateReal: "الرحلة الحقيقية تبدأ بتسجيلك",
    canvas: "قاعة الأثر ثلاثية الأبعاد",
    stepsLabel: "مراحل الرحلة",
    steps: { world: "العالم", country: "الدولة", support: "الدعم", impact: "الأثر" },
    links: "روابط",
    back: "عودة",
    mine: "إلى أثري",
    mineTrial: "(التجربة)",
    eyebrow: "رحلة الداعم",
    title: "ادخل قاعة الأثر",
    donorLead:
      "تدخل القاعة فترى أثرك أنت على خريطة العالم: دول كفالاتك مضيئةً على الكرة، وأرقامك كما في لوحتك. لا محاكاة هنا ولا أرقام نموذجية.",
    lead: "تدخل القاعة، فتختار دولةً من خريطة العالم وتدخلها لترى حالها. تختار نوع الدعم ومقداره فيتغيّر الأثر أمامك، ثم تدعم وترى أثره على البلد والمنطقة والمجموعة والطفل، وتنتهي بخلاصة ما حرّكه دعمك أنت.",
    net: (n: string) => `المقرّ في الرياض و${n} موقعاً للندوة حول العالم، تختار منها على الكرة.`,
    netTrial: (n: string) =>
      `للندوة مقرٌّ في الرياض و${n} موقعاً مؤكَّد الحضور حول العالم. والتجربة تفتح معها دولاً لا حضور مؤكَّداً للندوة فيها، وتميّزها القاعة.`,
    unsupported: "متصفّحك لا يدعم الرسم ثلاثي الأبعاد. تجد أثر دعمك في",
    unsupportedLink: "أثري",
    enter: "ادخل القاعة",
    preparing: "تُجهَّز القاعة…",
    loader: "تُجهَّز القاعة",
    film: "شاهد كفيلم",
    legend: "مفتاح الأثر",
    timeline: "الزمن: الدولة قبل سنة واليوم وبعد سنة",
    play: "شاهد السنة تمرّ",
    month: "الشهر",
    today: "اليوم",
    yearAgo: "قبل سنة",
    yearOn: "بعد سنة",
    screens: "شاشات القاعة",
    prev: "الشاشة السابقة",
    next: "الشاشة التالية",
    views: { impact: "الأثر", map: "الخريطة", kinds: "أنواع الدعم" },
    partner: "بالشراكة مع",
  },
  en: {
    tag: "Virtual journey",
    liveTag: "Sample figures (concept preview)",
    gate: "This is a virtual journey: everything in the hall is simulated, and nothing is charged.",
    gateReal: "The real journey begins when you register",
    canvas: "The Impact Hall in 3D",
    stepsLabel: "Stages of the journey",
    steps: { world: "World", country: "Country", support: "Support", impact: "Impact" },
    links: "Links",
    back: "Back",
    mine: "My impact",
    mineTrial: "(trial)",
    eyebrow: "The supporter's journey",
    title: "Enter the Impact Hall",
    donorLead:
      "Step into the hall to see your own impact on the world map: the countries you sponsor in lit on the globe, and your figures exactly as on your dashboard. Nothing here is simulated or sample data.",
    lead: "Step into the hall, pick a country on the world map and go in to see how it stands. Choose a kind of support and an amount and watch the impact change in front of you. Then give, see what it does for the country, the region, the group and the child, and finish with a summary of what your own support moved.",
    net: (n: string) =>
      `Headquarters in Riyadh and ${n} WAMY sites around the world, yours to choose from on the globe.`,
    netTrial: (n: string) =>
      `WAMY has its headquarters in Riyadh and ${n} sites of confirmed presence around the world. The trial also opens countries where it has no confirmed presence, and the hall marks them.`,
    unsupported: "Your browser cannot draw 3D graphics. The impact of your support is in",
    unsupportedLink: "My impact",
    enter: "Enter the hall",
    preparing: "Preparing the hall…",
    loader: "Preparing the hall",
    film: "Watch as a film",
    legend: "Impact key",
    timeline: "Time: the country a year ago, today and a year from now",
    play: "Watch the year go by",
    month: "Month",
    today: "Today",
    yearAgo: "1 yr ago",
    yearOn: "In 1 yr",
    screens: "Hall screens",
    prev: "Previous screen",
    next: "Next screen",
    views: { impact: "Impact", map: "Map", kinds: "Kinds of support" },
    partner: "In partnership with",
  },
});

/**
 * hall.css is a stylesheet link of the route's head (`routes/hall.tsx`), so it normally lands
 * before the first paint. Should it be late (a slow or failed request), the hall still holds its
 * final box (a fixed, dark full screen) and keeps its children unpainted, so the unstyled gate
 * never shows in the page flow and nothing moves when the styles land. hall.css switches the
 * children on by setting --hall-css.
 */
const CRITICAL_CSS =
  ".hall{position:fixed;inset:0;z-index:60;overflow:hidden;background:#18070c}" +
  // the hall's direct children, written without a child combinator so the text needs no escaping
  ":where(.hall *:not(.hall * *)){visibility:var(--hall-css,hidden)}";

function HallPage() {
  const ref = useRef<HTMLDivElement>(null);
  const search = Route.useSearch();
  const appLocale = useLocale();
  const queryClient = useQueryClient();
  const fetchMine = useServerFn(listMySponsorships);
  const router = useRouter();
  // المفتاح الواحد: في وضع التجربة تفتح القاعة على كتالوج التجربة؛ وبعد الاعتماد على أعداد الدليل.
  const source = hallSource(search);
  const trying = source.mode === "trial";
  const donor = source.mode === "donor";
  const locale = hallLanguage(source.mode, appLocale);
  const [state, setState] = useState<"loading" | "ready" | "unsupported">("loading");
  const c = copyOf(COPY, locale);
  const brand = brandFor(locale);
  const hc = hallLocale(locale).copy;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) {
      setState("unsupported");
      return;
    }
    // the probe only asks whether WebGL 2 is there: its context is given back at once, so a
    // visitor who enters the hall many times never runs into the browser's context limit
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    let hall: ReturnType<typeof import("@/components/hall/hall-scene.js").mountHall> | null = null;
    let cancelled = false;
    /* the browser's Back walks the hall one stage at a time (`@/lib/hall/history`): each stage
       the visitor goes deeper into is an entry of the router's own history, carrying the stage
       in its state, on the same URL (so `c`, `try` and `from` stay as they are). */
    let stack: HallStep[] = [];
    let ignored = 0; // history moves the page made itself: their popstate is not the visitor's
    let moved: (() => void) | null = null;
    let queue = Promise.resolve();
    const here = () => location.pathname + location.search + location.hash;
    const move = (by: number) =>
      new Promise<void>((done) => {
        ignored++;
        const timer = window.setTimeout(() => {
          ignored = Math.max(0, ignored - 1);
          moved = null;
          done();
        }, 2000);
        moved = () => {
          window.clearTimeout(timer);
          done();
        };
        router.history.go(by);
      });
    const onPopState = () => {
      if (ignored > 0) {
        ignored--;
        moved?.();
        moved = null;
        return;
      }
      if (location.pathname !== "/hall") return; // leaving the hall: nothing to walk
      const step = onPop(stack, window.history.state);
      stack = step.stack;
      if (step.bounce) queue = queue.then(() => move(step.bounce));
      if (step.goTo) hall?.goTo(step.goTo);
    };
    window.addEventListener("popstate", onPopState);
    // an entry left by an earlier visit (a reload deep in the hall) is the hall's first again
    if (hallEntryOf(window.history.state)) router.history.replace(here(), {});
    /* two halls behind one switch. The trial hall loads the trial catalogue (`lib/hall/trial`:
       countries, regions, children, pledges and copy, the same the trial pages read) and reads
       no directory; the live hall loads none of it and reads the directory's counts. */
    // the same two chunks the route already asked for on the way in (`@/lib/hall/preload`)
    Promise.all([
      loadHallScene(),
      trying ? loadHallTrial() : null,
      // the live hall's own strings and sample names, in the interface language
      trying || donor ? null : import("@/lib/hall/live"),
    ])
      .then(([{ mountHall }, trial, liveHall]) => {
        if (cancelled) return;
        hall = mountHall(root, {
          onStage: (stage) => {
            const step = onStage(stack, stage);
            stack = step.stack;
            if (!step.pops && !step.push) return;
            queue = queue.then(async () => {
              if (cancelled) return;
              if (step.pops) await move(-step.pops);
              if (step.push && !cancelled) router.history.push(here(), step.push as never);
            });
          },
          // Escape is one step back, exactly as the browser's Back; on the first stage it does nothing
          onBack: () => {
            if (stack.length) router.history.back();
          },
          brand: brand.name,
          i18n: hallLocale(locale),
          text: liveHall ? liveHall.hallLive(locale) : null,
          /* the gate's emblem in 3D, built from the platform mark's own approved paths
             («الإصبعان», `KahataynMark`): the disc in wine lacquer, the crescent and the hairline
             ring in brushed champagne, light standing behind the two fingers. Another vector
             mark is one more set of paths here. */
          mark: {
            viewBox: MARK2_VIEWBOX,
            parts: [
              { d: MARK2_DISC, role: "body" },
              { d: MARK2_CRESCENT, role: "trim" },
              { d: MARK2_RING, role: "inlay" },
            ],
            lightAt: { x: 0, y: 0, r: 96 },
            colors: { body: COLORS.light.logo, metal: COLORS.light.goldBright, light: "#fff6ea" },
          },
          // الدول المتّصلة منصّة تشغيلها فعلاً تظهر «حقيقية»؛ غيرها يبقى افتراضياً.
          linked: donor
            ? []
            : getOperatingLinks()
                .then((links) => links.map((l) => l.country))
                .catch(() => []),
          demo: trial
            ? trial.trialDemo({ locale, child: search.child, cadence: search.cadence })
            : null,
          // عدّ الدليل الحقيقي بالدولة (geo_stats)، بالحماية نفسها التي يعرضها الدليل.
          live:
            trying || donor
              ? null
              : queryClient
                  .fetchQuery(geoQuery)
                  .then(hallLiveRows)
                  .catch(() => []),
          /* the donor's own hall: the very list their dashboard reads (same server function,
             same gate, same query key, so the same cached rows), shaped by the dashboard's own
             selectors in `lib/hall/donor`. Only the country comes from elsewhere: each child's
             public card, as any visitor's profile page reads it. A failure shows as unavailable,
             never as sample figures. */
          mine: donor
            ? {
                kinds: GIVING_TRACKS.map((k) => ({ name: givingCopy(locale).tracks[k].name })),
                data: queryClient
                  .fetchQuery({ queryKey: ["my-sponsorships"], queryFn: () => fetchMine() })
                  .then(async (res) => {
                    if (res.error) return null;
                    const cards = await Promise.all(
                      donorOrphanIds(res.sponsorships).map((id) =>
                        queryClient
                          .fetchQuery({
                            queryKey: ["orphan", id],
                            queryFn: () => getPublicOrphan({ data: { id } }),
                          })
                          .then((r) => [id, r.orphan?.country ?? null] as const)
                          .catch(() => [id, null] as const),
                      ),
                    );
                    const countries = new Map(cards);
                    return donorHall(res.sponsorships, (id) => countries.get(id));
                  })
                  .catch(() => null),
              }
            : null,
          // الدولة التي كان الزائر ينظر إليها في الصفحات: تُفتح القاعة عليها.
          start: source.start,
        });
        setState("ready");
      })
      .catch(() => setState("unsupported"));
    return () => {
      cancelled = true;
      window.removeEventListener("popstate", onPopState);
      hall?.();
    };
  }, []);

  return (
    <div
      ref={ref}
      className="hall"
      dir={dirOf(locale)}
      lang={locale}
      data-state={state}
      data-stage="gate"
    >
      <style>{CRITICAL_CSS}</style>
      <canvas id="gl" aria-label={c.canvas} />
      <div id="labels" aria-hidden="true" />

      <header id="hud">
        <div className="brand" style={{ flexWrap: "wrap", rowGap: 0 }}>
          <span className="brand-name">{brand.name}</span>
          <span className="brand-sep">·</span>
          <span className="brand-hall">{hc.hall}</span>
          {/* the persistent mark of what the hall shows, under its name on every stage: the trial,
              the donor's real figures, or the live concept hall and its sample figures */}
          {
            <span
              {...(donor
                ? { "data-hall-donor": "" }
                : trying
                  ? { "data-hall-trial": "" }
                  : { "data-hall-live": "" })}
              style={{
                flexBasis: "100%",
                fontFamily: "var(--body)",
                fontSize: 11,
                lineHeight: 1.5,
                letterSpacing: 0,
                color: "var(--champagne)",
              }}
            >
              {donor ? hc.donor.tag : trying ? c.tag : c.liveTag}
            </span>
          }
        </div>
        <ol id="steps" aria-label={c.stepsLabel}>
          <li data-s="world">{c.steps.world}</li>
          {/* the donor's hall has the world only: no simulated country, support or impact stage */}
          {!donor && (
            <>
              <li data-s="country">{c.steps.country}</li>
              <li data-s="support">{c.steps.support}</li>
              <li data-s="impact">{c.steps.impact}</li>
            </>
          )}
        </ol>
        <nav className="exits" aria-label={c.links}>
          <button id="focusBtn" type="button" className="chip" aria-pressed="false">
            {hc.focus.off}
          </button>
          <button id="soundBtn" type="button" className="chip" aria-pressed="false">
            {hc.sound.off}
          </button>
          {/* العودة إلى الصفحة التي جاء منها الزائر، ببحثها كما تركه (ما اختاره يبقى مختاراً) */}
          {source.back && (
            <a
              href={source.back}
              className="chip"
              data-hall-back
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                router.history.push(source.back!);
              }}
            >
              {c.back}
            </a>
          )}
          <Link to={source.mine} className="chip exit">
            {c.mine}
            {trying && <span className="exit-note"> {c.mineTrial}</span>}
          </Link>
        </nav>
      </header>

      <section id="gate">
        <div>
          <MarkStage />
          <div className="eyebrow">{c.eyebrow}</div>
          <h1>{c.title}</h1>
          <p>{donor ? c.donorLead : c.lead}</p>
          <p className="gate-net">
            {(trying ? c.netTrial : c.net)(formatCount(NETWORK_SITES, locale))}
          </p>
          {trying && (
            <p className="gate-net" data-hall-trial-gate>
              {c.gate}{" "}
              <Link
                to="/auth"
                search={{ redirect: "/dashboard" }}
                style={{ textDecoration: "underline", textUnderlineOffset: 4 }}
              >
                {c.gateReal}
              </Link>
              .
            </p>
          )}
          {state === "unsupported" ? (
            <p className="gate-net">
              {c.unsupported} <Link to={source.mine}>{c.unsupportedLink}</Link>.
            </p>
          ) : (
            <>
              {state === "loading" && <Loader label={c.loader} />}
              <div className="gate-actions">
                <button id="enter" className="cta" type="button" disabled={state !== "ready"}>
                  {state === "ready" ? c.enter : c.preparing}
                </button>
                {/* the film walks the simulated journey: it has no place in the donor's real hall */}
                {!donor && (
                  <button id="film" className="ghost" type="button" disabled={state !== "ready"}>
                    {c.film}
                  </button>
                )}
              </div>
            </>
          )}
          {/* whose hall this is: the owning organisation's line, from the one brand source */}
          <p className="gate-owner" data-brand-owner>
            {brand.ownerLine}
          </p>
          <GatePartner locale={locale} />
        </div>
      </section>

      <div id="hint" />
      <aside id="legend" aria-label={c.legend} />
      <div id="timeline" role="group" aria-label={c.timeline}>
        <button id="tlPlay" type="button" className="chip">
          {c.play}
        </button>
        <div className="tl-track">
          <input
            id="tlRange"
            type="range"
            min={-12}
            max={12}
            step={1}
            defaultValue={0}
            aria-label={c.month}
            aria-valuetext={c.today}
          />
          <div className="tl-ticks" aria-hidden="true">
            <span>{c.yearAgo}</span>
            <span>{c.today}</span>
            <span>{c.yearOn}</span>
          </div>
        </div>
        <output id="tlOut" htmlFor="tlRange">
          {c.today}
        </output>
      </div>
      <p id="srLive" className="sr-only" aria-live="polite" />
      <p id="caption" aria-live="polite" />
      <nav id="hallNav" aria-label={c.screens}>
        <button type="button" data-d="-1" aria-label={c.prev}>
          ‹
        </button>
        <button type="button" data-v="0">
          {c.views.impact}
        </button>
        <button type="button" data-v="1" aria-current="true">
          {c.views.map}
        </button>
        <button type="button" data-v="2">
          {c.views.kinds}
        </button>
        <button type="button" data-d="1" aria-label={c.next}>
          ›
        </button>
      </nav>
      <aside id="panel" aria-live="polite" />
      <section id="impact" hidden aria-live="polite" />
      <div id="veil" />
      <div id="cursor" aria-hidden="true" />
    </div>
  );
}

/**
 * the product mark «الإصبعان» is the door into the hall. The disc is drawn as two leaves that meet
 * on the line between its two slots; each leaf's mask cuts its own slot, so on entry (hall-scene.js,
 * enterHall) the two slots can draw together into one opening and the leaves part along it.
 * Before that the mark draws itself (hall.css): a hairline traces the rim → the disc fills → the
 * crescent settles → the ring is drawn → the two fingers rise as light, and then breathe.
 */
function MarkStage() {
  const { k, w, a, b } = MARK2_SLOTS;
  const skew = `matrix(1 0 ${k} 1 0 0)`;
  const mid = (a.x + w + b.x) / 2; // the line between the two fingers, where the leaves meet
  const top = -150; // the slots are open at the rim: their bands start above it
  const slot = (s: { x: number; end: number }, cls: string, fill?: string) => (
    <rect className={`k-slot ${cls}`} x={s.x} y={top} width={w} height={s.end - top} fill={fill} />
  );
  const box = { maskUnits: "userSpaceOnUse", x: -700, y: -700, width: 1400, height: 1400 } as const;
  // the disc is a plain circle here and the masks cut the slots (the same shape as the mark's
  // own path), so the slots are free to move; `edge` is the leaf's door edge once they have met
  const art = (edge: number) => (
    <>
      <g mask={`url(#k2-cut-${edge < mid ? "a" : "b"})`}>
        <circle className="k-disc" r="100" />
        <path className="k-ring" d={MARK2_RING} />
        <path className="k-crescent" d={MARK2_CRESCENT} />
      </g>
      <g clipPath="url(#k2-rim)">
        <line
          className="k-edge"
          x1={edge}
          y1={-110}
          x2={edge}
          y2={130}
          pathLength={1}
          transform={skew}
        />
      </g>
    </>
  );
  return (
    <div className="mark" aria-hidden="true">
      <div className="mark-flood" />
      <svg className="mark-art" viewBox={MARK2_VIEWBOX} focusable="false">
        <defs>
          <clipPath id="k2-rim">
            <circle r="99.6" />
          </clipPath>
          <filter id="k2-soft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4.5" />
          </filter>
          {/* the leaves overlap on the meeting line, so no seam shows while the door is closed */}
          <mask id="k2-cut-a" {...box}>
            <g transform={skew}>
              <rect x={-900} y={-900} width={900 + mid + 1.5} height={1800} fill="white" />
              {slot(a, "k-slot-a", "black")}
            </g>
          </mask>
          <mask id="k2-cut-b" {...box}>
            <g transform={skew}>
              <rect x={mid - 1.5} y={-900} width={900} height={1800} fill="white" />
              {slot(b, "k-slot-b", "black")}
            </g>
          </mask>
        </defs>
        {/* the light behind the door: the two fingers at rest, the whole opening on entry */}
        <circle className="k-lume" r="98.6" />
        <g clipPath="url(#k2-rim)">
          <g transform={skew}>
            <rect className="k-finger" x={a.x - 0.4} y={-92} width={w + 0.8} height={a.end + 92} />
            <rect
              className="k-finger k-finger-b"
              x={b.x - 0.4}
              y={-76}
              width={w + 0.8}
              height={b.end + 76}
            />
          </g>
        </g>
        <g className="k-door">
          <g className="k-leaf k-leaf-a">{art(mid - w)}</g>
          <g className="k-leaf k-leaf-b">{art(mid + w)}</g>
        </g>
        {/* the breath of light through the two fingers */}
        <g className="k-glow" filter="url(#k2-soft)">
          <g clipPath="url(#k2-rim)">
            <g transform={skew}>
              {slot(a, "k-slot-a")}
              {slot(b, "k-slot-b")}
            </g>
          </g>
        </g>
        {/* the drawing lines: the rim, the crescent, the ring (they fade once the mark stands) */}
        <circle className="k-trace" r="99.3" pathLength={1} transform="rotate(-56)" />
        <path className="k-trace k-trace-2" d={MARK2_CRESCENT} pathLength={1} />
        <circle className="k-trace k-trace-ring" r="90" pathLength={1} transform="rotate(-29)" />
      </svg>
    </div>
  );
}

/** the partnership stays on the gate, quietly: the partner's mark as approved, never animated */
function GatePartner({ locale }: { locale: string }) {
  const p = brandFor(locale).partner;
  const c = copyOf(COPY, locale);
  return (
    <p className="gate-partner">
      <span>{c.partner}</span>
      <img src="/brand/partner-mark.svg" alt="" width={24} height={26} decoding="async" />
      <span className="gate-partner-name">{locale === "ar" ? p.name : p.nameLatin}</span>
    </p>
  );
}

/** نجمةٌ ثمانية تُرسم بالذهب حتى يجهز المشهد. */
function Loader({ label }: { label: string }) {
  const pts = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 26 : 44;
    return `${50 + Math.cos(a) * r},${50 + Math.sin(a) * r}`;
  }).join(" ");
  return (
    <div className="loader" role="status" aria-label={label}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <polygon points={pts} />
        <circle cx="50" cy="50" r="12" />
      </svg>
    </div>
  );
}
