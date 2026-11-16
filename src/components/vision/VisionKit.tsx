import { Link, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ResetSandbox, VisionStoreProvider } from "@/components/vision/VisionStore";
import type { T } from "@/data/vision-demo";
import { defineCopy, intlOf, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/vision/VisionKit", {
  ar: {
    concept: "تصوّر · بيانات توضيحية",
    conceptNote:
      "منصّتا التشغيل والقرار هنا افتراضيتان تعملان على بيئةٍ تجريبية في متصفّحك: كلّ تبرّعٍ أو جلسةٍ أو قرارٍ تجريه هنا يحرّك الطبقات الثلاث كما سيحرّكها التكامل الحقيقي. لا يُحصَّل مالٌ ولا يُكشف طفل، والأسماء مستعارة.",
    nav: "منصة الرؤية والتوجهات",
    hub: "المنظومة",
    ops: "التشغيل",
    decision: "القرار",
    cycle: "الدورة",
    money: "رحلة المال",
    me: "ادخل بدورك",
  },
  en: {
    concept: "Concept · illustrative data",
    conceptNote:
      "The operations and decision platforms here are virtual and run on a sandbox in your browser: every donation, session or decision you make moves all three layers as the real integration will. No money is collected, no child is identified, and names are pseudonyms.",
    nav: "Vision and Directions platform",
    hub: "System",
    ops: "Operations",
    decision: "Decision",
    cycle: "Cycle",
    money: "Money journey",
    me: "Enter by role",
  },
});

/** نصٌّ ثنائيّ من بيانات العرض بلغة الواجهة. */
export function useT() {
  const locale = useLocale();
  return (x: T) => (locale === "ar" ? x.ar : x.en);
}

export function useNum() {
  const locale = useLocale();
  return (n: number, opts?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(intlOf(locale), opts).format(n);
}

export function ConceptBadge({ className }: { className?: string }) {
  const c = useCopy(COPY);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-wine-ink",
        className,
      )}
    >
      {c.concept}
    </span>
  );
}

const TABS = [
  { to: "/vision", key: "hub" },
  { to: "/vision/operations", key: "ops" },
  { to: "/vision/decision", key: "decision" },
  { to: "/vision/cycle", key: "cycle" },
  { to: "/vision/payments", key: "money" },
  { to: "/vision/me", key: "me" },
] as const;

/** غلاف صفحات منصة الرؤية والتوجهات: الرأس، وشريط التنقّل بين الصفحات الخمس، والتنبيه. */
export function VisionShell({ children }: { children: ReactNode }) {
  const c = useCopy(COPY);
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <VisionStoreProvider>
      <div className="theme-light min-h-dvh bg-ivory text-foreground">
        <SiteHeader />
        <main id="main" tabIndex={-1}>
          <nav
            aria-label={c.nav}
            className="sticky top-16 z-30 border-b border-wine/10 bg-ivory/90 backdrop-blur"
          >
            <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
              {TABS.map((tab) => {
                const on = path === tab.to || (tab.to !== "/vision" && path.startsWith(tab.to));
                return (
                  <Link
                    key={tab.to}
                    to={tab.to}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "min-h-9 shrink-0 rounded-full px-4 py-2 text-sm whitespace-nowrap transition-colors",
                      on ? "bg-wine text-ivory" : "text-wine-ink hover:bg-wine/5",
                    )}
                  >
                    {c[tab.key]}
                  </Link>
                );
              })}
              <ConceptBadge className="ms-auto shrink-0" />
            </div>
          </nav>
          {children}
          <aside
            role="note"
            className="mx-auto max-w-3xl px-4 pb-16 text-center text-sm leading-7 text-muted-foreground"
          >
            {c.conceptNote}
            <span className="mt-2 block">
              <ResetSandbox />
            </span>
          </aside>
        </main>
        <SiteFooter />
      </div>
    </VisionStoreProvider>
  );
}

/** رأس قسم: رقمٌ ذهبيّ، وتسمية الطبقة، وعنوانٌ نبيذيّ. */
export function Eyebrow({
  n,
  label,
  title,
  lead,
}: {
  n?: string;
  label: string;
  title: string;
  lead?: string;
}) {
  return (
    <header className="vision-rise text-center">
      {n && <p className="font-serif text-3xl text-gold-ink">{n}</p>}
      <p className="mt-1 text-sm font-semibold text-gold-ink">{label}</p>
      <h1 className="mt-2 text-3xl font-extrabold text-wine md:text-5xl">{title}</h1>
      {lead && <p className="mx-auto mt-3 max-w-2xl leading-8 text-muted-foreground">{lead}</p>}
    </header>
  );
}

/**
 * إطار منصّةٍ شريكة كما في الفيلم: شريطٌ داكن بعنوانها، ثم شريط تنقّلها
 * الداخلي بتسميتها. «فاتح» للدعم والتشغيل، و«داكن» للقرار.
 */
export function PlatformFrame({
  host,
  brand,
  chip,
  tabs,
  active,
  onTab,
  tone = "light",
  children,
}: {
  host: string;
  brand: string;
  chip: string;
  tabs?: ReadonlyArray<{ key: string; label: string }>;
  active?: string;
  onTab?: (key: string) => void;
  tone?: "light" | "dark";
  children: ReactNode;
}) {
  const dark = tone === "dark";
  return (
    <div
      className={cn(
        "vision-frame overflow-hidden rounded-3xl shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_30px_60px_-24px_rgb(43_11_20/0.45)]",
        dark
          ? "bg-[radial-gradient(120%_80%_at_80%_0%,#5b1626,var(--color-wine-deep)_70%)] text-ivory"
          : "bg-[#fdf9f3]",
      )}
    >
      <div className="flex items-center gap-2 bg-[#1f1416] px-4 py-2 text-xs text-gold-soft">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="size-2.5 rounded-full bg-white/15" />
          <i className="size-2.5 rounded-full bg-white/15" />
          <i className="size-2.5 rounded-full bg-white/15" />
        </span>
        <span dir="ltr" className="mx-auto font-mono tracking-wide opacity-80">
          {host}
        </span>
      </div>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 border-b px-4 py-3 md:px-6",
          dark ? "border-white/10" : "border-wine/10",
        )}
      >
        <span className="flex items-center gap-2 font-bold">
          <span
            aria-hidden="true"
            className={cn(
              "grid size-8 place-items-center rounded-full font-serif text-lg",
              dark ? "bg-ivory text-wine" : "bg-wine text-ivory",
            )}
          >
            هـ
          </span>
          {brand}
        </span>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold",
            dark ? "bg-gold text-wine-deep" : "bg-wine text-ivory",
          )}
        >
          {chip}
        </span>
        {tabs && (
          <div role="tablist" className="flex flex-wrap gap-1 md:ms-4">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active === tab.key}
                onClick={() => onTab?.(tab.key)}
                className={cn(
                  "min-h-9 rounded-full px-3 text-sm transition-colors",
                  active === tab.key
                    ? dark
                      ? "bg-white/12 text-ivory"
                      : "bg-wine/8 font-semibold text-wine"
                    : dark
                      ? "text-ivory/70 hover:bg-white/8"
                      : "text-muted-foreground hover:bg-wine/5",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        <ConceptBadge className="ms-auto" />
      </div>
      <div key={active} className="vision-rise p-4 md:p-8">
        {children}
      </div>
    </div>
  );
}

/** رقمٌ يتدحرج إلى قيمته حين يظهر — بخطٍّ مزخرف كأرقام الفيلم. */
export function Tally({
  to,
  decimals = 0,
  suffix = "",
  className,
}: {
  to: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const num = useNum();
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const [n, setN] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = from.current;
    if (reduce) {
      from.current = to;
      return setN(to);
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 1100);
      const v = start + (to - start) * (1 - (1 - p) ** 4);
      setN(v);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return (
    <span ref={ref} className={cn("font-serif tabular-nums", className)}>
      {num(n, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/** شريطٌ يمتلئ بنسبته؛ ما تجاوز ١٠٠٪ يُرسم ممتلئاً بعلامة. */
export function Bar({
  pct,
  className,
  tone = "gold",
}: {
  pct: number;
  className?: string;
  tone?: "gold" | "wine";
}) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-current/10", className)}>
      <div
        className={cn("vision-bar h-full rounded-full", tone === "gold" ? "bg-gold" : "bg-wine")}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}
