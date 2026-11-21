import { useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import "@/components/hall/hall.css";
import { BRAND } from "@/config/brand";
import {
  MARK2_CRESCENT,
  MARK2_RING,
  MARK2_SLOTS,
  MARK2_VIEWBOX,
} from "@/components/brand/KahataynMark";
import { isTrial } from "@/config/platform";
import { geoQuery } from "@/lib/geo";
import { getOperatingLinks } from "@/lib/vision-links.functions";
import { gapOf, loadGifts, TRY_CHILDREN, tryChild } from "@/lib/try-demo";

/** ?try=1 opens the hall in the client demo; ?child=&cadence= replays a simulated gift there */

export const Route = createLazyFileRoute("/hall")({ component: HallPage });

/**
 * hall.css arrives with this lazy chunk, after the server's markup has already painted. Until it
 * does, the hall holds its final box (a fixed, dark full screen) and keeps its children unpainted,
 * so the unstyled gate never shows in the page flow and nothing moves when the styles land.
 * hall.css switches the children on by setting --hall-css.
 */
const CRITICAL_CSS =
  ".hall{position:fixed;inset:0;z-index:60;overflow:hidden;background:#18070c}" +
  // the hall's direct children, written without a child combinator so the text needs no escaping
  ":where(.hall *:not(.hall * *)){visibility:var(--hall-css,hidden)}";

function HallPage() {
  const ref = useRef<HTMLDivElement>(null);
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  // في وضع التجربة تفتح القاعة على أطفال التجربة؛ وبعد الاعتماد على أعداد الدليل.
  const trying = search.try === 1 || isTrial();
  const [state, setState] = useState<"loading" | "ready" | "unsupported">("loading");

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) {
      setState("unsupported");
      return;
    }
    let dispose: (() => void) | null = null;
    let cancelled = false;
    import("@/components/hall/hall-scene.js")
      .then(({ mountHall }) => {
        if (cancelled) return;
        dispose = mountHall(root, {
          brand: BRAND.name,
          // الدول المتّصلة منصّة تشغيلها فعلاً تظهر «حقيقية»؛ غيرها يبقى افتراضياً.
          linked: getOperatingLinks()
            .then((links) => links.map((l) => l.country))
            .catch(() => []),
          demo: trying ? demoFor(search.child, search.cadence) : null,
          // عدّ الدليل الحقيقي بالدولة (geo_stats)، بالحماية نفسها التي يعرضها الدليل.
          live: trying
            ? null
            : queryClient
                .fetchQuery(geoQuery)
                .then((g) => (g.available ? g.countries : []))
                .catch(() => []),
        });
        setState("ready");
      })
      .catch(() => setState("unsupported"));
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  return (
    <div ref={ref} className="hall" dir="rtl" lang="ar" data-state={state} data-stage="gate">
      <style>{CRITICAL_CSS}</style>
      <canvas id="gl" aria-label="قاعة الأثر ثلاثية الأبعاد" />
      <div id="labels" aria-hidden="true" />

      <header id="hud">
        <div className="brand">
          <span className="brand-name">{BRAND.name}</span>
          <span className="brand-sep">·</span>
          <span className="brand-hall">قاعة الأثر</span>
        </div>
        <ol id="steps" aria-label="مراحل الرحلة">
          <li data-s="world">العالم</li>
          <li data-s="country">الدولة</li>
          <li data-s="support">الدعم</li>
          <li data-s="impact">الأثر</li>
        </ol>
        <nav className="exits" aria-label="روابط">
          <button id="focusBtn" type="button" className="chip" aria-pressed="false">
            عرض المجسّم
          </button>
          <button id="soundBtn" type="button" className="chip" aria-pressed="false">
            الصوت
          </button>
          {trying ? (
            <Link to="/try/impact" className="chip exit">
              إلى أثري<span className="exit-note"> (التجربة)</span>
            </Link>
          ) : (
            <Link to="/dashboard" className="chip exit">
              إلى أثري
            </Link>
          )}
        </nav>
      </header>

      <section id="gate">
        <div>
          <MarkStage />
          <div className="eyebrow">رحلة الداعم</div>
          <h1>ادخل قاعة الأثر</h1>
          <p>
            تدخل القاعة، فتختار دولةً من خريطة العالم وتدخلها لترى حالها. تختار نوع الدعم ومقداره
            فيتغيّر الأثر أمامك، ثم تدعم وترى أثره على البلد والمنطقة والمجموعة والطفل، وتنتهي
            بخلاصة ما حرّكه دعمك أنت.
          </p>
          <p className="gate-net">
            المقرّ في الرياض و26 موقعاً للندوة حول العالم، تختار منها على الكرة.
          </p>
          {state === "unsupported" ? (
            <p className="gate-net">
              متصفّحك لا يدعم الرسم ثلاثي الأبعاد. تجد أثر دعمك في{" "}
              {trying ? <Link to="/try/impact">أثري</Link> : <Link to="/dashboard">أثري</Link>}.
            </p>
          ) : (
            <>
              {state === "loading" && <Loader />}
              <div className="gate-actions">
                <button id="enter" className="cta" type="button" disabled={state !== "ready"}>
                  {state === "ready" ? "ادخل القاعة" : "تُجهَّز القاعة…"}
                </button>
                <button id="film" className="ghost" type="button" disabled={state !== "ready"}>
                  شاهد كفيلم
                </button>
              </div>
            </>
          )}
          <GatePartner />
        </div>
      </section>

      <div id="hint" />
      <aside id="legend" aria-label="مفتاح الأثر" />
      <div id="timeline" role="group" aria-label="الزمن: الدولة قبل سنة واليوم وبعد سنة">
        <button id="tlPlay" type="button" className="chip">
          شاهد السنة تمرّ
        </button>
        <div className="tl-track">
          <input
            id="tlRange"
            type="range"
            min={-12}
            max={12}
            step={1}
            defaultValue={0}
            aria-label="الشهر"
            aria-valuetext="اليوم"
          />
          <div className="tl-ticks" aria-hidden="true">
            <span>قبل سنة</span>
            <span>اليوم</span>
            <span>بعد سنة</span>
          </div>
        </div>
        <output id="tlOut" htmlFor="tlRange">
          اليوم
        </output>
      </div>
      <p id="srLive" className="sr-only" aria-live="polite" />
      <p id="caption" aria-live="polite" />
      <nav id="hallNav" aria-label="شاشات القاعة">
        <button type="button" data-d="-1" aria-label="الشاشة السابقة">
          ‹
        </button>
        <button type="button" data-v="0">
          الأثر
        </button>
        <button type="button" data-v="1" aria-current="true">
          الخريطة
        </button>
        <button type="button" data-v="2">
          أنواع الدعم
        </button>
        <button type="button" data-d="1" aria-label="الشاشة التالية">
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
function GatePartner() {
  const p = BRAND.partner;
  return (
    <p className="gate-partner">
      <span>{p.with}</span>
      <img src="/brand/partner-mark.svg" alt="" width={24} height={26} decoding="async" />
      <span className="gate-partner-name">{p.name}</span>
    </p>
  );
}

/** نجمةٌ ثمانية تُرسم بالذهب حتى يجهز المشهد. */
function Loader() {
  const pts = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 26 : 44;
    return `${50 + Math.cos(a) * r},${50 + Math.sin(a) * r}`;
  }).join(" ");
  return (
    <div className="loader" role="status" aria-label="تُجهَّز القاعة">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <polygon points={pts} />
        <circle cx="50" cy="50" r="12" />
      </svg>
    </div>
  );
}

/** remembers which simulated gift the hall has already replayed (this browser only) */
const REPLAYED_KEY = "hall-replayed:v1";

/**
 * the arrival is replayed once per gift: the link back from «أثري» always carries the latest
 * gift's child, and replaying it on every entry took the visitor out of the hall they had opened.
 */
function firstReplay(token: string): boolean {
  try {
    if (window.localStorage.getItem(REPLAYED_KEY) === token) return false;
    window.localStorage.setItem(REPLAYED_KEY, token);
    return true;
  } catch {
    return true; // storage blocked: the replay still plays, and any touch cancels it
  }
}

/** the demo children by hall region, and (right after a simulated gift) the moment to replay */
function demoFor(childId: string | undefined, cadence: "monthly" | "one_time" | undefined) {
  const gifts = loadGifts();
  const gift = childId ? gifts.find((g) => g.childId === childId) : undefined;
  // only a gift this visitor really made is replayed, and only the first time they arrive with it
  const child = gift && firstReplay(gift.id) ? tryChild(gift.childId) : undefined;
  // the visitor's simulated gifts (browser only): those children read «في كفالتك» in the hall
  const mine = new Set(gifts.map((g) => g.childId));
  return {
    kids: TRY_CHILDREN.map((c) => ({
      id: c.id,
      name: c.name,
      co: c.co,
      region: c.region,
      gap: gapOf(c),
      mine: mine.has(c.id),
    })),
    focus: child
      ? { co: child.co, region: child.region, name: child.name, cadence: cadence ?? "monthly" }
      : null,
  };
}
