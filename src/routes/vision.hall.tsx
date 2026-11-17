import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { BRAND, pageTitle } from "@/config/brand";

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
        dispose = mountHall(root, { brand: BRAND.name });
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
          <li data-s="hall">القاعة</li>
          <li data-s="world">العالم</li>
          <li data-s="country">الدولة</li>
          <li data-s="support">الدعم</li>
          <li data-s="impact">الأثر</li>
          <li data-s="big">الصورة الكلية</li>
        </ol>
        <Link to="/vision" className="chip">
          خروج إلى منصة الرؤية
        </Link>
      </header>

      <section id="gate">
        <div>
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
            <button id="enter" className="cta" type="button" disabled={state !== "ready"}>
              {state === "ready" ? "ادخل القاعة" : "تُجهَّز القاعة…"}
            </button>
          )}
        </div>
      </section>

      <div id="hint" />
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
