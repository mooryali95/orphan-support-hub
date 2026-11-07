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

export const getRouter = () => {
  const queryClient = makeQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // لا يظهر مؤشّر التنقّل قبل 250ms حتى لا يومض في التنقّلات الفورية،
    // وإذا ظهر يبقى 400ms على الأقل فلا يُرى كوميض مبتور.
    defaultPendingMs: 250,
    defaultPendingMinMs: 400,
    // التنقّل بين الصفحات بانتقالٍ ناعم (View Transitions) حيث يدعمه المتصفّح؛
    // وتغيّر موضع الخارطة أو الفلترة يُطفئه في ندائه، فحركته هي الحركة.
    defaultViewTransition: true,
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
