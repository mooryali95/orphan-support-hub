import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KahataynLockup } from "@/components/brand/KahataynMark";
import { NotificationBell } from "@/components/NotificationBell";
import { supabase } from "@/integrations/supabase/client";
import { wipeBrowserUserData } from "@/lib/client-state";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABELS } from "@/lib/format";
import { getMyWorkspaces } from "@/lib/workspaces.functions";
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
    translate: "الترجمة",
    notifications: "الإشعارات",
    account: "حسابي",
    sponsor: "كافل",
    supervisorRole: "مشرف",
    translatorRole: "مراجع ترجمة",
    officeRole: "عضو مكتب",
    donorRole: "جهة مانحة",
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
    translate: "Translation",
    notifications: "Notifications",
    account: "My account",
    sponsor: "Sponsor",
    supervisorRole: "Supervisor",
    translatorRole: "Translation reviewer",
    officeRole: "Office member",
    donorRole: "Donor entity",
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
  // الأبواب والعنوان من علاقات الحساب كلّها لا من user_roles وحده (UX-16):
  // المشرف وعضو المكتب والمترجم كانوا يُقرؤون «كافلاً».
  const fetchWorkspaces = useServerFn(getMyWorkspaces);
  const { data: wsRes } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => fetchWorkspaces(),
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  });
  const ws = wsRes?.workspaces ?? null;
  const translatorLocale = ws?.translator_locales?.[0]?.code;
  const roleLabels = [
    ...roles.filter((r) => r !== "sponsor").map((r) => ROLE_LABELS[r] ?? r),
    ...(ws?.supervisor ? [t.supervisorRole] : []),
    ...((ws?.offices.length ?? 0) > 0 ? [t.officeRole] : []),
    ...((ws?.translator_locales?.length ?? 0) > 0 ? [t.translatorRole] : []),
    ...((ws?.donor_entities.length ?? 0) > 0 ? [t.donorRole] : []),
  ];

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
            {/* «الإشراف» للمشرف المعتمد وحده: لغيره كان باباً إلى «لستَ مشرفاً»
                بلا طريق (UX-16). وطريق الاعتماد مشروحٌ في صفحته لمن يصلها. */}
            {ws?.supervisor && (
              <Link
                to="/supervisor"
                className="rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                {t.supervisor}
              </Link>
            )}
            {translatorLocale && (
              <Link
                to="/translate/$locale"
                params={{ locale: translatorLocale }}
                className="rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                {t.translate}
              </Link>
            )}
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
                {roleLabels.join("، ") || t.sponsor}
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
