import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KahataynLockup } from "@/components/brand/KahataynMark";
import { NotificationBell } from "@/components/NotificationBell";
import { supabase } from "@/integrations/supabase/client";
import { wipeBrowserUserData } from "@/lib/client-state";
import { useAuth } from "@/hooks/useAuth";
import { ModeSwitcher } from "@/components/ModeSwitcher";
import { useViewMode } from "@/hooks/useViewMode";
import { BRAND } from "@/config/brand";
import { defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("components/DashboardShell", {
  ar: {
    home: "الصفحة الرئيسية",
    nav: "التنقّل",
    sponsorships: "أثري",
    org: "الجهة الميدانية",
    guardian: "من أرعاهم",
    admin: "الإدارة",
    directory: "دليل الأيتام",
    support: "ادعم",
    supervisor: "الإشراف",
    translate: "الترجمة",
    notifications: "الإشعارات",
    account: "حسابي",
    signOut: "خروج",
  },
  en: {
    home: "Home",
    nav: "Navigation",
    sponsorships: "My impact",
    org: "Field organization",
    guardian: "In my care",
    admin: "Administration",
    directory: "Children's directory",
    support: "Support",
    supervisor: "Supervision",
    translate: "Translation",
    notifications: "Notifications",
    account: "My account",
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const t = useCopy(COPY);
  const { mode, workspaces } = useViewMode();

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
              يُمرَّر أفقياً تحت الشعار. والأبواب لوضع العرض الفعّال وحده: لا
              تختلط أبواب الإدارة بأبواب الداعم (انظر src/lib/view-mode.ts). */}
          <nav
            aria-label={t.nav}
            className="order-last -mx-4 flex w-[calc(100%+2rem)] items-center gap-1 overflow-x-auto whitespace-nowrap border-t border-border px-4 py-2 text-sm md:order-none md:mx-0 md:w-auto md:border-0 md:p-0"
          >
            {mode === "admin" && <NavLink to="/admin">{t.admin}</NavLink>}
            {mode === "supporter" && (
              <>
                <NavLink to="/dashboard">{t.sponsorships}</NavLink>
                <NavLink to="/orphans">{t.directory}</NavLink>
                <NavLink to="/support">{t.support}</NavLink>
              </>
            )}
            {mode === "org" && <NavLink to="/org">{t.org}</NavLink>}
            {mode === "guardian" && <NavLink to="/guardian">{t.guardian}</NavLink>}
            {mode === "supervisor" && <NavLink to="/supervisor">{t.supervisor}</NavLink>}
            {mode === "office" &&
              workspaces?.offices.map((o) => (
                <Link
                  key={o.id}
                  to="/office/$officeId"
                  params={{ officeId: o.id }}
                  className={NAV_CLASS}
                  activeProps={{ className: "bg-secondary text-foreground" }}
                >
                  {o.name}
                </Link>
              ))}
            {mode === "donor" &&
              workspaces?.donor_entities.map((e) => (
                <Link
                  key={e.id}
                  to="/donor/$entityId"
                  params={{ entityId: e.id }}
                  className={NAV_CLASS}
                  activeProps={{ className: "bg-secondary text-foreground" }}
                >
                  {e.name}
                </Link>
              ))}
            {mode === "translator" &&
              workspaces?.translator_locales?.map((l) => (
                <Link
                  key={l.code}
                  to="/translate/$locale"
                  params={{ locale: l.code }}
                  className={NAV_CLASS}
                  activeProps={{ className: "bg-secondary text-foreground" }}
                >
                  {t.translate} · {l.name}
                </Link>
              ))}
            {/* التفضيلات ليست إعداداً ثانوياً: بلا مدخلٍ ظاهر إليها يصير
                إلغاء الاشتراك حكراً على من وصلته رسالة. */}
            <NavLink to="/settings/notifications">{t.notifications}</NavLink>
            <NavLink to="/account">{t.account}</NavLink>
          </nav>

          <div className="ms-auto flex items-center gap-3">
            <NotificationBell />
            <p className="hidden text-xs font-medium sm:block">{user?.email}</p>
            <ModeSwitcher />
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="size-4" />
              {t.signOut}
            </Button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-[1.75rem] leading-tight font-extrabold md:text-[2rem]">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-base leading-8 text-muted-foreground">{description}</p>
        )}
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}

const NAV_CLASS =
  "rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground";

function NavLink({
  to,
  children,
}: {
  to:
    | "/admin"
    | "/dashboard"
    | "/orphans"
    | "/support"
    | "/org"
    | "/guardian"
    | "/supervisor"
    | "/settings/notifications"
    | "/account";
  children: ReactNode;
}) {
  return (
    <Link to={to} className={NAV_CLASS} activeProps={{ className: "bg-secondary text-foreground" }}>
      {children}
    </Link>
  );
}
