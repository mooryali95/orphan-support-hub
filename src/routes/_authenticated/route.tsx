import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/useAuth";

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
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);

    const roles = (roleRows ?? []).map((r) => r.role as AppRole);
    return { user: data.user, roles };
  },
  component: () => <Outlet />,
});
