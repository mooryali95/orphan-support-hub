import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isDemoSession } from "@/lib/demo-mode";
import { trialRoute } from "@/lib/trial-gate";
import type { AppRole } from "@/hooks/useAuth";
import { LocaleProvider } from "@/lib/locale";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * حارس المصادقة، ومعه الأدوار (M2).
 *
 * الأدوار تُحمَّل هنا مرّة واحدة وتُمرَّر في سياق المسار، فلا يُعيد كل
 * مسار ابن جلبها. وهي **راحة لا حماية**: الحماية الحقيقية سياسات RLS
 * ودوال القاعدة التي تفحص `is_admin()` بنفسها.
 *
 * وفائدتها أن مستخدماً بلا دور يُحوَّل بدل أن يرى شاشة فارغة تتلوها
 * أخطاء صلاحية — وهو فرق في التجربة لا في الأمن، ولذلك لا يُعتمد عليه.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // الوضع التجريبي: «أثري» هو أثر التجربة. المخرج إلى الرحلة الحقيقية يُنهي الوضع أوّلاً
    // (TryShell وأزرار «الرحلة الحقيقية»)، فلا يُحجب داعمٌ حقيقي عن لوحته.
    if (location.pathname === "/dashboard" && isDemoSession())
      throw redirect({ to: trialRoute("/try/impact") });
    const { data, error } = await supabase.auth.getUser();
    // الرابط المحمي يحفظ وجهته (UX-09): بعد الدخول يعود إليها لا إلى اللوحة.
    if (error || !data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);

    const roles = (roleRows ?? []).map((r) => r.role as AppRole);
    return { user: data.user, roles };
  },
  // البوابات بعد الدخول عربيةٌ في هذه المرحلة: من اختار الإنجليزية يراها
  // متّسقةً من اليمين بالعربية، لا نصّاً عربياً في تخطيطٍ من اليسار. وحين
  // تُترجم بوابةٌ يُرفع هذا الغلاف عنها.
  // بين فتح الرابط ومعرفة الجلسة لا شاشة فارغة (UI-17): هيكل البوابة بأبعاد
  // محتواها — ترويسة، وعنوان، وثلاثة مؤشّرات، وصفوف — فلا يقفز شيء حين تصل.
  pendingComponent: PortalSkeleton,
  component: () => (
    <LocaleProvider locale="ar">
      <div dir="rtl" lang="ar">
        <Outlet />
      </div>
    </LocaleProvider>
  ),
});

function PortalSkeleton() {
  return (
    <div dir="rtl" lang="ar" className="min-h-dvh bg-secondary/30" aria-busy="true">
      <div className="border-b border-border bg-background">
        <div className="brand-rule h-[3px] w-full" aria-hidden="true" />
        <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-4 px-4">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="ms-auto h-9 w-24" />
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-4 py-10" aria-hidden="true">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="mt-3 h-5 w-72 max-w-full" />
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-5">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="mt-2 h-4 w-24" />
            </div>
          ))}
        </div>
        <div className="mt-10 space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-4 rounded-2xl border border-border bg-card p-5">
              <Skeleton className="size-16 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
