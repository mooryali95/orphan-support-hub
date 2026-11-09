import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

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
  });

  return router;
};
