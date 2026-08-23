import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IocoLockup } from "@/components/brand/IocoMark";
import { NotificationBell } from "@/components/NotificationBell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABELS } from "@/lib/format";

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

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="border-b border-border bg-background">
        <div className="brand-rule h-[3px] w-full" aria-hidden="true" />
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link to="/" aria-label="IOCO — الصفحة الرئيسية">
            <IocoLockup compact />
          </Link>

          <nav className="hidden items-center gap-1 text-sm md:flex">
            <Link
              to="/dashboard"
              className="rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              كفالاتي
            </Link>
            {isCareOrg && (
              <Link
                to="/org"
                className="rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                جهة الرعاية
              </Link>
            )}
            {isGuardian && (
              <Link
                to="/guardian"
                className="rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                من أرعاهم
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/admin"
                className="rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                الإدارة
              </Link>
            )}
            <Link
              to="/orphans"
              className="rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              دليل الأيتام
            </Link>
          </nav>

          <div className="ms-auto flex items-center gap-3">
            <NotificationBell />
            <div className="hidden text-end sm:block">
              <p className="text-xs font-medium">{user?.email}</p>
              <p className="text-[11px] text-muted-foreground">
                {roles.map((r) => ROLE_LABELS[r] ?? r).join("، ") || "كافل"}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="size-4" />
              خروج
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
