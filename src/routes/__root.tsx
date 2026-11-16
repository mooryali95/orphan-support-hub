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
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { onAuthEvent } from "@/lib/client-state";
import { BRAND_CSS } from "@/config/brand-colors";
import { readTheme } from "@/lib/theme";
import { BRAND, brandFor } from "@/config/brand";
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

const FONTS_CSS =
  "https://fonts.googleapis.com/css2?family=Readex+Pro:wght@300;400;500;600;700&family=Amiri:wght@400;700&display=swap";

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
    title: "الصفحة غير موجودة",
    text: "الرابط الذي فتحته غير صحيح أو تم نقل الصفحة.",
    home: "العودة للرئيسية",
  },
  en: {
    title: "Page not found",
    text: "The link you opened is wrong, or the page has moved.",
    home: "Back to home",
  },
});
const ERROR = defineCopy("routes/__root/error", {
  ar: {
    title: "تعذّر تحميل الصفحة",
    text: "حدث خلل غير متوقع. يمكنك المحاولة مجدداً أو العودة للرئيسية.",
    retry: "إعادة المحاولة",
    home: "الرئيسية",
  },
  en: {
    title: "The page could not load",
    text: "Something unexpected went wrong. Try again, or go back home.",
    retry: "Try again",
    home: "Home",
  },
});

function NotFoundComponent() {
  const c = useCopy(NOT_FOUND);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{c.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{c.text}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {c.home}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  const c = useCopy(ERROR);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">{c.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{c.text}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {c.retry}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {c.home}
          </a>
        </div>
      </div>
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
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // الاتصال المسبق بأصلَي الخطوط يُكتب أوّل <head> في RootShell (قبل وحدات
      // الحزمة المحمّلة مسبقاً)، لا هنا: هنا كان يقع بعدها فلا يسبق شيئاً (RT-05).
      // الأوزان المستعملة فقط: Tajawal 400/500/700/800 (300 لا يُستعمل)، وAmiri
      // 400 للنصّ النبوي و700 للعناوين. و`display=swap` يرسم النصّ فوراً بالبديل.
      { rel: "stylesheet", href: FONTS_CSS },
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preload" as="style" href={FONTS_CSS} />
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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const locale = useLocale();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // الخروج، أو دخول مستخدمٍ غير من ترك بياناته على الجهاز: تُمحى مسودّات
      // العمل من المتصفّح وذاكرة الاستعلامات معها، فلا يرى الثاني ما للأوّل (UX-05).
      onAuthEvent(event, session?.user?.id ?? null, () => queryClient.clear());
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationProgress />
      <PreviewBridge>
        <Outlet />
      </PreviewBridge>
      <Toaster position="top-center" richColors dir={dirOf(locale)} />
    </QueryClientProvider>
  );
}
