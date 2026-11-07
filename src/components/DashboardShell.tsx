import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KahataynLockup } from "@/components/brand/KahataynMark";
import { NotificationBell } from "@/components/NotificationBell";
import { supabase } from "@/integrations/supabase/client";
import { wipeBrowserUserData } from "@/lib/client-state";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABELS } from "@/lib/format";
import { BRAND } from "@/config/brand";
import { defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("components/DashboardShell", {
  ar: {
    home: "الصفحة الرئيسية",
    nav: "التنقّل",
    portals: "بواباتي",
    sponsorships: "كفالاتي",
    org: "جهة الرعاية",
    guardian: "من أرعاهم",
    admin: "الإدارة",
    directory: "دليل الأيتام",
    supervisor: "الإشراف",
    notifications: "الإشعارات",
    account: "حسابي",
    sponsor: "كافل",
    signOut: "خروج",
  },
  en: {
    home: "Home",
    nav: "Navigation",
    portals: "My portals",
    sponsorships: "My sponsorships",
    org: "Care organization",
    guardian: "In my care",
    admin: "Administration",
    directory: "Children's directory",
    supervisor: "Supervision",
    notifications: "Notifications",
    account: "My account",
    sponsor: "Sponsor",
    signOut: "Sign out",
  },
});

export function DashboardShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { user, roles, isAdmin, isCareOrg, isGuardian } = useAuth();
  const navigate = useNavigate();
  const t = useCopy(COPY);

  async function signOut() {
    // يُمحى ما في المتصفّح قبل الخروج نفسه: الجهاز قد يكون مشتركاً (UX-05).
    wipeBrowserUserData();
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-dvh bg-secondary/30">
      <header className="border-b border-border bg-background">
        <div className="brand-rule h-[3px] w-full" aria-hidden="true" />
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-x-4 px-4">
          <Link to="/" aria-label={`${BRAND.name} — ${t.home}`}>
            <KahataynLockup compact />
          </Link>

          {/* على الجوال كان التنقّل مخفياً كلّياً فلا سبيل إلى البوابات؛ صار صفاً
              يُمرَّر أفقياً تحت الشعار. */}
          <nav
            aria-label={t.nav}
            className="order-last -mx-4 flex w-[calc(100%+2rem)] items-center gap-1 overflow-x-auto whitespace-nowrap border-t border-border px-4 py-2 text-sm md:order-none md:mx-0 md:w-auto md:border-0 md:p-0"
          >
            <Link
              to="/workspaces"
              className="rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {t.portals}
            </Link>
            <Link
              to="/dashboard"
              className="rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {t.sponsorships}
            </Link>
            {isCareOrg && (
              <Link
                to="/org"
                className="rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                {t.org}
              </Link>
            )}
            {isGuardian && (
              <Link
                to="/guardian"
                className="rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                {t.guardian}
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/admin"
                className="rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                {t.admin}
              </Link>
            )}
            <Link
              to="/orphans"
              className="rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {t.directory}
            </Link>
            {/* لوحة المشرف تظهر للجميع عمداً: من ليس مشرفاً تُخبره الصفحة
                بذلك وتشرح كيف يصير، بدل أن يكون الباب مخفياً فلا يُعرف. */}
            <Link
              to="/supervisor"
              className="rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {t.supervisor}
            </Link>
            {/* التفضيلات ليست إعداداً ثانوياً: بلا مدخلٍ ظاهر إليها يصير
                إلغاء الاشتراك حكراً على من وصلته رسالة. */}
            <Link
              to="/settings/notifications"
              className="rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {t.notifications}
            </Link>
            <Link
              to="/account"
              className="rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {t.account}
            </Link>
          </nav>

          <div className="ms-auto flex items-center gap-3">
            <NotificationBell />
            <div className="hidden text-end sm:block">
              <p className="text-xs font-medium">{user?.email}</p>
              <p className="text-[11px] text-muted-foreground">
                {roles.map((r) => ROLE_LABELS[r] ?? r).join("، ") || t.sponsor}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="size-4" />
              {t.signOut}
            </Button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-extrabold">{title}</h1>
        {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}
