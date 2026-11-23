import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { sponsorEntry } from "@/config/platform";
import { Button } from "@/components/ui/button";
import { KahataynLockup } from "@/components/brand/KahataynMark";
import { PartnerLockup } from "@/components/brand/PartnerMark";
import { useAuth } from "@/hooks/useAuth";
import { PendingPaymentBar } from "@/components/support/PendingPaymentBar";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";
import { brandFor } from "@/config/brand";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { LanguageSwitch } from "@/components/kit/LanguageSwitch";
import { ThemeSwitch } from "@/components/kit/ThemeSwitch";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";

// three doors for a donor: whom, how to give, how it works. Home is the lockup; the trait model
// and the field organizations live in the footer (SiteFooter).
const ROUTES = ["/orphans", "/support", "/how-it-works", "/ask"] as const;
const COPY = defineCopy("components/SiteHeader", {
  ar: {
    nav: ["دليل الأيتام", "ادعم", "كيف تعمل", "اسأل"],
    skip: "تخطّي إلى المحتوى",
    home: "الصفحة الرئيسية",
    portals: "بواباتي",
    signIn: "تسجيل الدخول",
    sponsor: "اكفل يتيماً",
    menu: "القائمة",
  },
  en: {
    nav: ["Children", "Support", "How it works", "Ask"],
    skip: "Skip to content",
    home: "Home page",
    portals: "My portals",
    signIn: "Sign in",
    sponsor: "Sponsor a child",
    menu: "Menu",
  },
});

export function SiteHeader() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const c = useCopy(COPY);
  const brand = brandFor(useLocale());
  const NAV = ROUTES.map((to, i) => ({ to, label: c.nav[i] }));

  return (
    <header
      className="sticky top-0 z-50 bg-background/85 backdrop-blur"
      style={{ viewTransitionName: "site-header" }}
    >
      {/* رابط التخطّي أول ما يبلغه التبويب: يقفز بمستخدم لوحة المفاتيح فوق التنقّل. */}
      <a
        href="#main"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-b-lg px-4 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:inset-x-0 focus:mx-auto focus:w-fit"
      >
        {c.skip}
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link
          to="/"
          aria-label={`${brand.name} — ${c.home}`}
          className="shrink-0 whitespace-nowrap"
        >
          <KahataynLockup />
        </Link>
        {/* the partner beside the product: a hairline, then its mark (name on wide screens) */}
        {/* the mark from tablets up; with three links there is room for its full name from xl, in both languages */}
        <span aria-hidden="true" className="hidden h-8 w-px bg-border sm:block" />
        <PartnerLockup className="hidden shrink-0 xl:inline-flex" />
        <PartnerLockup compact className="hidden shrink-0 sm:inline-flex xl:hidden" />

        <nav className="hidden flex-1 items-center gap-1 ps-2 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <ThemeSwitch className="hidden sm:inline-grid" />
          <LanguageSwitch className="hidden sm:inline-flex" />
          {user && <NotificationBell />}
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link to="/workspaces">{c.portals}</Link>
              </Button>
              {/* the way to give stays in reach after signing in */}
              <Button asChild>
                <Link to={sponsorEntry()}>{c.sponsor}</Link>
              </Button>
            </>
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
                    {c.signIn}
                  </Button>
                )}
              />
              <Button asChild>
                <Link to={sponsorEntry()}>{c.sponsor}</Link>
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={c.menu}
            aria-expanded={open}
            aria-controls="site-mobile-nav"
            className="inline-flex size-11 items-center justify-center rounded-lg border border-border lg:hidden"
          >
            <Menu className="size-4" />
          </button>
        </div>
      </div>

      <div
        id="site-mobile-nav"
        className={cn("border-t border-border/70 lg:hidden", open ? "block" : "hidden")}
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
          <div className="flex items-center gap-1 sm:hidden">
            <LanguageSwitch className="justify-start" />
            <ThemeSwitch withLabel />
          </div>
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
                  {c.signIn}
                </button>
              )}
            />
          )}
          {/* whose platform this is: in the drawer, where it does not crowd the 360px bar */}
          <p
            className="border-t border-border/70 px-3 pt-3 pb-1 text-xs text-muted-foreground"
            data-brand-owner
          >
            {brand.ownerLine}
          </p>
        </nav>
      </div>
      <div className="brand-rule h-[3px] w-full" aria-hidden="true" />
      {user && <PendingPaymentBar />}
    </header>
  );
}
