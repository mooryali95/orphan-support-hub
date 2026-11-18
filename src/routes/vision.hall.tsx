import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import "@/components/hall/hall.css";
import { BRAND, pageTitle } from "@/config/brand";
import {
  MARK_CALLIGRAPHY,
  MARK_CENTER,
  MARK_CRESCENT,
  MARK_DISC,
  MARK_VIEWBOX,
} from "@/components/hall/hall-mark";
import { getOperatingLinks } from "@/lib/vision-links.functions";

/**
 * قاعة الأثر — رحلة الداعم ثلاثية الأبعاد: القاعة، ثم خريطة العالم، ثم الدولة،
 * ثم الدعم والأثر بمستوياته، ثم الصورة الكلية. المشهد يُحمَّل كسولاً عند فتح
 * الصفحة فقط (three.js والمعالجة السينمائية)، فلا يثقل بقية المنصّة.
 */
export const Route = createFileRoute("/vision/hall")({
  head: ({ match }) => ({
    meta: [
      { title: pageTitle("قاعة الأثر", false, match.context.locale ?? "ar") },
      {
        name: "description",
        content:
          "رحلة الداعم ثلاثية الأبعاد في شبكة الندوة: اختر دولة، وادعمها، وشاهد أثر دعمك على البلد والمنطقة والمجموعة والطفل.",
      },
    ],
  }),
  component: HallPage,
});

function HallPage() {
  const ref = useRef<HTMLDivElement>(null);
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
    <div ref={ref} className="hall" dir="rtl" lang="ar" data-state={state}>
      <canvas id="gl" aria-label="قاعة الأثر ثلاثية الأبعاد" />
      <div id="labels" aria-hidden="true" />

      <header id="hud">
        <div className="brand">
          {BRAND.name} · قاعة الأثر<small>منصة الرؤية والتوجهات</small>
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
          <Link to="/vision/journey" className="chip">
            النسخة المبسّطة
          </Link>
          <Link to="/vision" className="chip">
            خروج إلى منصة الرؤية
          </Link>
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
            بالصورة الكلية لمنصة القرار.
          </p>
          <p className="gate-net">
            المقرّ في الرياض و26 موقعاً للندوة حول العالم، تختار منها على الكرة.
          </p>
          {state === "unsupported" ? (
            <p className="gate-net">
              متصفّحك لا يدعم الرسم ثلاثي الأبعاد. جرّب{" "}
              <Link to="/vision/journey">الرحلة الكاملة</Link> بدلاً منها.
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
        </div>
      </section>

      <div id="hint" />
      <aside id="legend" aria-label="مفتاح الأثر" />
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
          الاتجاهات
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

/** نجمةٌ ثمانية تُرسم بالذهب حتى يجهز المشهد. */
/**
 * the partner mark (no wordmark), from the approved vector file. The alef's slot already cuts the
 * disc on a diagonal, so the disc is a two-leaf door: two copies, each clipped to one side of the
 * alef line, swing apart on entry while the hāʾ rises out toward the viewer and light floods through.
 * Before that, the mark is drawn in four movements: a gold line traces the outline → the disc fills →
 * the crescent settles → the hand is written.
 */
function MarkStage() {
  return (
    <div className="mark" aria-hidden="true">
      <div className="mark-flood" />
      <div className="leaf leaf-a">
        <MarkSvg id="a" layer="disc" />
      </div>
      <div className="leaf leaf-b">
        <MarkSvg id="b" layer="disc" />
      </div>
      {/* the alef's slot, which ignites before the leaves part */}
      <svg className="mark-slot" viewBox={MARK_VIEWBOX} focusable="false">
        <line x1="368" y1="58" x2="145" y2="388" pathLength={1} />
      </svg>
      <div className="mark-ink">
        <MarkSvg id="i" layer="ink" />
      </div>
    </div>
  );
}

function MarkSvg({ id, layer }: { id: string; layer: "disc" | "ink" }) {
  const { x, y } = MARK_CENTER;
  const u = (n: string) => `mark-${id}-${n}`;
  return (
    <svg viewBox={MARK_VIEWBOX} focusable="false">
      <defs>
        <linearGradient id={u("ink")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--ivory)" }} />
          <stop offset="1" style={{ stopColor: "var(--champagne)" }} />
        </linearGradient>
        <linearGradient id={u("gold")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--champagne)" }} />
          <stop offset="1" style={{ stopColor: "var(--gold)" }} />
        </linearGradient>
        <linearGradient id={u("sheen")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.35" stopColor="white" stopOpacity="0" />
          <stop offset="0.5" stopColor="white" stopOpacity="0.8" />
          <stop offset="0.65" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={u("feather")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.94" stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        {/* the hand is written by a feathered band travelling down-left along the stroke */}
        <mask id={u("write")} maskUnits="userSpaceOnUse" x="100" y="20" width="400" height="400">
          <g transform={`rotate(45 ${x} ${y})`}>
            <rect
              className="m-wipe"
              x={x - 600}
              y={y - 1200}
              width="1200"
              height="1200"
              fill={`url(#${u("feather")})`}
            />
          </g>
        </mask>
        <clipPath id={u("clip")}>
          <path d={MARK_CALLIGRAPHY} clipRule="evenodd" />
        </clipPath>
      </defs>
      {layer === "disc" ? (
        <>
          <circle className="m-glow" cx={x} cy={y + 6} r="150" />
          <path className="m-disc" d={MARK_DISC} />
          <path className="m-crescent" d={MARK_CRESCENT} />
          <path className="m-line" d={MARK_DISC} pathLength={1} stroke={`url(#${u("gold")})`} />
          <path
            className="m-line m-line-2"
            d={MARK_CRESCENT}
            pathLength={1}
            stroke={`url(#${u("gold")})`}
          />
        </>
      ) : (
        <>
          <g className="m-ink" mask={`url(#${u("write")})`}>
            <path d={MARK_CALLIGRAPHY} fillRule="evenodd" fill={`url(#${u("ink")})`} />
          </g>
          <g clipPath={`url(#${u("clip")})`}>
            <rect
              className="m-sheen"
              x="-160"
              y="40"
              width="300"
              height="360"
              fill={`url(#${u("sheen")})`}
            />
          </g>
        </>
      )}
    </svg>
  );
}

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
