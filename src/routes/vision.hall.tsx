import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * قاعة الأثر انتقلت إلى منصة الدعم (`/hall`): هي رحلة الداعم وأثره، لا تصوّر صاحب القرار.
 * الرابط القديم يُحوَّل إليها فلا ينكسر ما شاركه أحد.
 */
export const Route = createFileRoute("/vision/hall")({
  beforeLoad: () => {
    throw redirect({ to: "/hall", replace: true });
  },
});
