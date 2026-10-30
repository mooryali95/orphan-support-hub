import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { KahataynLockup } from "@/components/brand/KahataynMark";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";
import { BRAND } from "@/config/brand";
import { AuthDialog } from "@/components/auth/AuthDialog";

const NAV = [
  { to: "/", label: "الرئيسية" },
  { to: "/orphans", label: "دليل الأيتام" },
  { to: "/support", label: "ادعم" },
  { to: "/traits", label: "نموذج السمات" },
  { to: "/how-it-works", label: "كيف تعمل" },
  { to: "/organizations", label: "جهات الرعاية" },
] as const;

export function SiteHeader() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background/85 backdrop-blur">
      {/* رابط التخطّي أول ما يبلغه التبويب: يقفز بمستخدم لوحة المفاتيح فوق التنقّل. */}
      <a
        href="#main"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-b-lg px-4 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:inset-x-0 focus:mx-auto focus:w-fit"
      >
        تخطّي إلى المحتوى
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link to="/" aria-label={`${BRAND.name} — الصفحة الرئيسية`}>
          <KahataynLockup />
        </Link>

        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          {user && <NotificationBell />}
          {user ? (
            <Button asChild size="sm">
              <Link to="/workspaces">بواباتي</Link>
            </Button>
          ) : (
            <>
              <AuthDialog
                trigger={(open) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hidden sm:inline-flex"
                    onClick={open}
                  >
                    تسجيل الدخول
                  </Button>
                )}
              />
              <Button asChild size="sm">
                <Link to="/orphans">اكفل يتيماً</Link>
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="القائمة"
            aria-expanded={open}
            aria-controls="site-mobile-nav"
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border md:hidden"
          >
            <Menu className="size-4" />
          </button>
        </div>
      </div>

      <div
        id="site-mobile-nav"
        className={cn("border-t border-border/70 md:hidden", open ? "block" : "hidden")}
      >
        <nav className="mx-auto flex max-w-6xl flex-col p-2">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          {!user && (
            <AuthDialog
              trigger={(openAuth) => (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    openAuth();
                  }}
                  className="rounded-lg px-3 py-2 text-start text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  تسجيل الدخول
                </button>
              )}
            />
          )}
        </nav>
      </div>
      <div className="brand-rule h-[3px] w-full" aria-hidden="true" />
    </header>
  );
}
