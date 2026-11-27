import { dehydrate, hydrate, QueryClient, type DehydratedState } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * ما جلبته المحمّلات على الخادم يصل المتصفّح مع الصفحة ولا يُجلب ثانيةً
 * (PERF-02/RT-03): تُجفَّف ذاكرة الاستعلامات في حالة الموجّه وتُروى منها عند
 * الإماهة. ومدّة الصلاحية الافتراضية دقيقة، فلا يُعاد جلب ما وصل للتوّ عند
 * التركيب ولا عند العودة إلى التبويب.
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, refetchOnWindowFocus: false },
    },
  });
}

// حالة الذاكرة بيانات JSON في جوهرها، لكنّ أنواع react-query لا تثبت ذلك لمدقّق
// قابلية التسلسل في الموجّه (مفاتيح `unknown`)، فتُمرَّر بنوعٍ معتم.
type Dehydrated = { queries: Record<string, never> };

/**
 * أحادية CSP للطلب الجاري (APP-08): يضبط الخادم موصّلها (request-context.ts)،
 * وفي المتصفّح لا موصّل فلا أحادية — المتصفّح لا يحتاجها بعد الرسم.
 */
function cspNonce(): string | undefined {
  const read = (globalThis as Record<string, unknown>)["__iocoCspNonce"];
  return typeof read === "function" ? (read as () => string | undefined)() : undefined;
}

export const getRouter = () => {
  const queryClient = makeQueryClient();
  const nonce = cspNonce();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    ...(nonce ? { ssr: { nonce } } : {}),
    scrollRestoration: true,
    // تحميلٌ مسبق عند النيّة (مرور المؤشّر أو اللمس) لكلّ رابط: حزمة الصفحة
    // وبياناتها تبدأ قبل النقر. والبيانات تحكمها staleTime في react-query.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // لا يظهر مؤشّر التنقّل قبل 250ms حتى لا يومض في التنقّلات الفورية،
    // وإذا ظهر يبقى 400ms على الأقل فلا يُرى كوميض مبتور.
    defaultPendingMs: 250,
    defaultPendingMinMs: 400,
    // التنقّل بين الصفحات بانتقالٍ هادئ (View Transitions، حركته في
    // src/styles/motion.css) حيث يدعمه المتصفّح، وإلا فتبديلٌ فوري. وهو لتغيّر
    // الصفحة وحده: الفلترة وموضع الخريطة والوسم وإعادة الجلب تبقى في مكانها،
    // فلا تخفت الصفحة كلّها لتغيّرٍ في جزءٍ منها.
    defaultViewTransition: { types: ({ pathChanged }) => (pathChanged ? ["page"] : false) },
    // الاستعلامات الناجحة وحدها تُجفَّف (الافتراضي)، فلا يُرسل وعدٌ معلّق ولا
    // خطأ. والمسارات المحمية لا تُرسم على الخادم أصلاً (ssr: false)، فلا يدخل
    // هنا إلا ما رُسم للزائر في الصفحة نفسها.
    dehydrate: (): Dehydrated => ({
      queries: dehydrate(queryClient) as unknown as Dehydrated["queries"],
    }),
    hydrate: (data: Dehydrated) => {
      hydrate(queryClient, data.queries as unknown as DehydratedState);
    },
  });

  return router;
};
