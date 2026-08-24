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

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الرابط الذي فتحته غير صحيح أو تم نقل الصفحة.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">تعذّر تحميل الصفحة</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          حدث خلل غير متوقع. يمكنك المحاولة مجدداً أو العودة للرئيسية.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            إعادة المحاولة
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            الرئيسية
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
function NavigationProgress() {
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  // الخادم يرسم الجذر وحالة الموجّه «pending» دائماً، فلو أعلنّا التحميل أثناء
  // التوليد لاختلف HTML الخادم عن أول رسم في المتصفّح وأعاد React بناء الشجرة
  // كاملة. المؤشّر شأن عميل خالص: لا يظهر إلا بعد التركيب.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isLoading = mounted && pending;

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
        {isLoading ? "جارٍ تحميل الصفحة" : ""}
      </div>
    </>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "IOCO — منصة كفالة الأيتام" },
      {
        name: "description",
        content:
          "IOCO تعبر باليتيم من شاطئ الاحتياج إلى شاطئ العمران عبر ملفات موثّقة من جهات رعاية معتمدة.",
      },
      { property: "og:title", content: "IOCO — منصة كفالة الأيتام" },
      {
        property: "og:description",
        content:
          "IOCO تعبر باليتيم من شاطئ الاحتياج إلى شاطئ العمران عبر ملفات موثّقة من جهات رعاية معتمدة.",
      },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "ar_SA" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#142F52" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&family=Amiri:wght@400;700&display=swap",
      },
      // العلامة المضغوطة: مقطع «IO» بالطفل في الفراغ السالب — يصمد عند 16px
      // لأنه كتلتان لونيتان لا تفاصيل خطية.
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "alternate icon", href: "/favicon.png", type: "image/png", sizes: "64x64" },
      { rel: "apple-touch-icon", href: "/brand/ioco-192.png", sizes: "192x192" },
      { rel: "icon", href: "/brand/ioco-512.png", type: "image/png", sizes: "512x512" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationProgress />
      <Outlet />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
