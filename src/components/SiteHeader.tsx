import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IocoLockup } from "@/components/brand/IocoMark";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "الرئيسية" },
  { to: "/orphans", label: "دليل الأيتام" },
  { to: "/how-it-works", label: "كيف تعمل الكفالة" },
  { to: "/organizations", label: "جهات الرعاية" },
] as const;

export function SiteHeader() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link to="/" aria-label="IOCO — الصفحة الرئيسية">
          <IocoLockup />
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
          {user ? (
            <Button asChild size="sm">
              <Link to="/dashboard">لوحتي</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link to="/auth">تسجيل الدخول</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/orphans">اكفل يتيماً</Link>
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="القائمة"
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border md:hidden"
          >
            <Menu className="size-4" />
          </button>
        </div>
      </div>

      <div className={cn("border-t border-border/70 md:hidden", open ? "block" : "hidden")}>
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
            <Link
              to="/auth"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              تسجيل الدخول
            </Link>
          )}
        </nav>
      </div>
      <div className="brand-rule h-[3px] w-full" aria-hidden="true" />
    </header>
  );
}
