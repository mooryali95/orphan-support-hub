import type { ErrorComponentProps } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { warmHallWhenIdle } from "@/lib/hall/idle-warm";
import { TRIAL_ENABLED } from "@/lib/trial-gate";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { onAuthEvent } from "@/lib/client-state";
import { BRAND_CSS } from "@/config/brand-colors";
import { readTheme } from "@/lib/theme";
import { BRAND, brandFor } from "@/config/brand";
import { jsonLdScript, siteJsonLd } from "@/lib/json-ld";
import {
  defineCopy,
  dirOf,
  LocaleProvider,
  readLocale,
  setMessages,
  type Locale,
  useCopy,
  useLocale,
} from "@/lib/locale";
import { getUiState, type UiState } from "@/lib/ui-i18n.functions";
import { PreviewBridge } from "@/components/i18n/PreviewBridge";
import { fontFaceCss, fontPreloads } from "@/lib/fonts";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { KahataynMark } from "@/components/brand/KahataynMark";
import { TRIAL_ENABLED, trialRoute } from "@/lib/trial-gate";

// في المتصفّح: حال اللغة مرّةً للجلسة، لا نداءً مع كل تنقّل.
const uiOnClient = new Map<string, UiState>();
async function loadUi(wanted: Locale): Promise<UiState> {
  const hit = typeof window !== "undefined" ? uiOnClient.get(wanted) : undefined;
  if (hit) return hit;
  try {
    const ui = await getUiState({ data: { locale: wanted } });
    if (typeof window !== "undefined") uiOnClient.set(wanted, ui);
    return ui;
  } catch {
    // تعذّر الخادم: العربية والإنجليزية في الكود تكفيان، وغيرهما يرجع للإنجليزية.
    return { locale: wanted === "ar" ? "ar" : "en", locales: [], messages: null };
  }
}

const NOT_FOUND = defineCopy("routes/__root/not_found", {
  ar: {
    title: "هذه الصفحة غير موجودة",
    text: "الرابط الذي فتحته غير صحيح أو تم نقل الصفحة.",
    home: "العودة للرئيسية",
    browse: "تصفّح الأطفال",
    try: "جرّب المنصّة",
  },
  en: {
    title: "This page does not exist",
    text: "The link you opened is wrong, or the page has moved.",
    home: "Back to home",
    browse: "Browse children",
    try: "Try the platform",
  },
});
const ERROR = defineCopy("routes/__root/error", {
  ar: {
    title: "تعذّر تحميل الصفحة",
    text: "حدث خلل غير متوقع. يمكنك المحاولة مجدداً أو العودة للرئيسية.",
    retry: "إعادة المحاولة",
    home: "الرئيسية",
    browse: "تصفّح الأطفال",
    ref: "رمز المرجع",
  },
  en: {
    title: "The page could not load",
    text: "Something unexpected went wrong. Try again, or go back home.",
    retry: "Try again",
    home: "Home",
    browse: "Browse children",
    ref: "Reference code",
  },
});

const ACTION =
  "inline-flex h-11 min-w-11 items-center justify-center rounded-md px-5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PRIMARY = `${ACTION} bg-primary text-primary-foreground hover:bg-primary/90`;
const SECONDARY = `${ACTION} border border-input bg-background text-foreground hover:bg-accent`;

function NotFoundComponent() {
  const c = useCopy(NOT_FOUND);
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <p aria-hidden="true" className="text-7xl font-bold text-muted-foreground/60">
            404
          </p>
          <h1 className="mt-4 text-2xl font-semibold text-foreground">{c.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{c.text}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link to="/" className={PRIMARY}>
              {c.home}
            </Link>
            <Link to="/orphans" className={SECONDARY}>
              {c.browse}
            </Link>
            {TRIAL_ENABLED ? (
              <Link to={trialRoute("/try")} className={SECONDARY}>
                {c.try}
              </Link>
            ) : null}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** رمزٌ معتم للدعم: وقتٌ مضغوط فقط، بلا معرّفات ولا تفاصيل خطأ. */
function referenceCode(): string {
  return Date.now().toString(36).toUpperCase();
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  const c = useCopy(ERROR);
  const [ref] = useState(referenceCode);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 items-center border-b px-4">
        <a href="/" className="inline-flex h-11 items-center" aria-label={c.home}>
          <KahataynMark className="size-9" />
        </a>
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-foreground">{c.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{c.text}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                router.invalidate();
                reset();
              }}
              className={PRIMARY}
            >
              {c.retry}
            </button>
            <a href="/" className={SECONDARY}>
              {c.home}
            </a>
            <a href="/orphans" className={SECONDARY}>
              {c.browse}
            </a>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            {c.ref}:{" "}
            <span className="font-mono" dir="ltr">
              {ref}
            </span>
          </p>
        </div>
      </main>
    </div>
  );
}

/**
 * مؤشّر التنقّل. المُحمِّلات (loaders) تنتظر البيانات قبل رسم الصفحة الجديدة،
 * فيبقى المستخدم على الصفحة القديمة بلا أي إشارة أن نقرته سُجّلت — وهذا أول
 * ما تنصّ عليه إرشادات نيلسن: إظهار حالة النظام. الشريط يظهر بعد التأخير
 * المحدَّد في `defaultPendingMs` فلا يومض في التنقّلات السريعة، ويُعلَن نصّياً
 * لقارئ الشاشة لأن الشريط وحده لا يُقرأ.
 */
const LOADING = defineCopy("routes/__root/loading", {
  ar: { text: "جارٍ تحميل الصفحة" },
  en: { text: "Loading page" },
});

function NavigationProgress() {
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  // الخادم يرسم الجذر وحالة الموجّه «pending» دائماً، فلو أعلنّا التحميل أثناء
  // التوليد لاختلف HTML الخادم عن أول رسم في المتصفّح وأعاد React بناء الشجرة
  // كاملة. المؤشّر شأن عميل خالص: لا يظهر إلا بعد التركيب.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isLoading = mounted && pending;
  const loading = useCopy(LOADING);

  return (
    <>
      <div
        aria-hidden="true"
        className={cn(
          "fixed inset-x-0 top-0 z-[100] h-0.5 origin-right transition-opacity duration-200 motion-reduce:transition-none",
          "brand-rule",
          isLoading ? "animate-pulse opacity-100" : "opacity-0",
        )}
      />
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isLoading ? loading.text : ""}
      </div>
    </>
  );
}

const titleFor = (l: Locale) => `${brandFor(l).name} — ${brandFor(l).slogan}`;
const ogLocale = (l: Locale) => (l === "ar" ? "ar_SA" : l === "en" ? "en_US" : l);

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // اللغة قبل أي رسم: الخادم يقرؤها من الكعكة فيخرج <html> باتجاهه الصحيح.
  // والترجمة المنشورة معها، فلا تُرسم الصفحة بالإنجليزية ثم تتبدّل.
  beforeLoad: async () => {
    const [ui, theme] = await Promise.all([readLocale().then(loadUi), readTheme()]);
    // قبل العناوين: دوالّ head تقرأ الترجمة من المخزن قبل أن يُرسم أي مكوّن.
    if (ui.messages) setMessages(ui.locale, ui.messages);
    return { locale: ui.locale, ui, theme };
  },
  head: ({ match }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: titleFor(match.context.locale ?? "ar") },
      {
        name: "description",
        content: brandFor(match.context.locale ?? "ar").description,
      },
      { property: "og:title", content: titleFor(match.context.locale ?? "ar") },
      {
        property: "og:description",
        content: brandFor(match.context.locale ?? "ar").description,
      },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: ogLocale(match.context.locale ?? "ar") },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: BRAND.themeColor },
      { name: "author", content: brandFor(match.context.locale ?? "ar").ownerName },
      { property: "og:site_name", content: brandFor(match.context.locale ?? "ar").name },
    ],
    // whose platform this is, for search engines: the platform as a site, published by its owner
    scripts: [jsonLdScript(siteJsonLd(match.context.locale ?? "ar"))],
    links: [
      { rel: "stylesheet", href: appCss },
      // الخطوط من أصلنا (src/lib/fonts.ts): تعريفاتها مضمَّنة في RootShell وتحميلها
      // المسبق هناك بحسب اتجاه اللغة؛ لا ورقة أنماطٍ خارجية تحجب الرسم.
      // العلامة المضغوطة: مقطع «IO» بالطفل في الفراغ السالب — يصمد عند 16px
      // لأنه كتلتان لونيتان لا تفاصيل خطية.
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "alternate icon", href: "/favicon.png", type: "image/png", sizes: "64x64" },
      { rel: "apple-touch-icon", href: "/brand/app-192.png", sizes: "192x192" },
      { rel: "icon", href: "/brand/app-512.png", type: "image/png", sizes: "512x512" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const { locale, ui, theme } = Route.useRouteContext();
  return (
    <html
      lang={locale}
      dir={dirOf(locale)}
      className={theme === "dark" ? "dark" : undefined}
      style={{ colorScheme: theme }}
      suppressHydrationWarning
    >
      <head>
        {fontPreloads(dirOf(locale)).map((href) => (
          <link
            key={href}
            rel="preload"
            as="font"
            type="font/woff2"
            href={href}
            crossOrigin="anonymous"
          />
        ))}
        <style dangerouslySetInnerHTML={{ __html: fontFaceCss(dirOf(locale)) }} />
        <HeadContent />
        {/* ألوان الهوية من brand.json — قبل أوّل رسم فلا وميض. */}
        <style dangerouslySetInnerHTML={{ __html: BRAND_CSS }} />
      </head>
      <body>
        <LocaleProvider locale={locale} messages={ui.messages ?? undefined} available={ui.locales}>
          {children}
        </LocaleProvider>
        <Scripts />
      </body>
    </html>
  );
}

const DEMO_KEY = "platform-demo-mode";

// شريط التجربة في قطعته: لا يدخل حزمة أيّ صفحة إلا لزائرٍ في الوضع التجريبي.
const loadDemoBar = () => import("@/components/DemoModeBar");
const DemoModeBar = lazy(loadDemoBar);
// على الخادم تُحمَّل القطعة مع العامل، فيُرسم الشريط في أوّل HTML لمسارات التجربة لا بعده.
if (import.meta.env.SSR && TRIAL_ENABLED) void loadDemoBar();

/**
 * يقرأ جلسة التجربة بعد التركيب (المفتاح والحدث نفسهما في `@/lib/demo-mode`)، دون استيراد
 * الوحدة: لا يدخل حزمة الدخول من الوضع التجريبي إلا هذا السطر.
 *
 * مسارات التجربة (`/try…`) تدخل الوضع التجريبي دائماً، فيُرسم الشريط فيها من الخادم
 * ويُحفظ مكانه قبل الترطيب؛ لولا ذلك لظهر بعده فدفع الصفحة إلى الأسفل (CLS نحو 0.16 على 360px).
 */
function DemoBarSlot() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onTry = TRIAL_ENABLED && (pathname === "/try" || pathname.startsWith("/try/"));
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        setDemo(window.sessionStorage.getItem(DEMO_KEY) === "1");
      } catch {
        setDemo(false);
      }
    };
    read();
    window.addEventListener(DEMO_KEY, read);
    return () => window.removeEventListener(DEMO_KEY, read);
  }, []);
  return demo || onTry ? (
    <Suspense fallback={null}>
      <DemoModeBar force={onTry} />
    </Suspense>
  ) : null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const locale = useLocale();
  const router = useRouter();

  useEffect(() => {
    // متصفّحٌ يحجب التخزين يرمي عند إنشاء عميل الدخول: الصفحات العامّة والوضع التجريبي
    // لا تحتاج دخولاً، فتبقى تعمل بزائرٍ غير داخل بدل صفحة خطأ.
    try {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        // الخروج، أو دخول مستخدمٍ غير من ترك بياناته على الجهاز: تُمحى مسودّات
        // العمل من المتصفّح وذاكرة الاستعلامات معها، فلا يرى الثاني ما للأوّل (UX-05).
        onAuthEvent(event, session?.user?.id ?? null, () => queryClient.clear());
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      });
      return () => data.subscription.unsubscribe();
    } catch {
      return;
    }
  }, [router, queryClient]);

  // تحميلٌ هادئ لقاعة الأثر في الخلفية بعد استقرار الصفحة الأولى، فلا يشعر الزائر بثقلٍ عند وصولها
  useEffect(() => warmHallWhenIdle(() => router.preloadRoute({ to: "/hall" })), [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationProgress />
      <DemoBarSlot />
      <PreviewBridge>
        <Outlet />
      </PreviewBridge>
      <Toaster position="top-center" richColors dir={dirOf(locale)} />
    </QueryClientProvider>
  );
}
