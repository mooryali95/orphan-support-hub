import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const menuButton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // the open menu holds focus: the first link takes it, Tab cycles through the menu and its
  // button, and Esc closes it and hands focus back to the button
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("a, button")?.focus();
  }, [open]);
  const c = useCopy(COPY);
  const brand = brandFor(useLocale());
  const NAV = ROUTES.map((to, i) => ({ to, label: c.nav[i] }));
  // ارتفاع الرأس الفعلي (يزيد بشريط الدفع المنتظر أو القائمة المفتوحة) في `--site-header-h`،
  // فيلتصق ما تحته (شريط التجربة) أسفله تماماً ولا ينزلق تحته عند التمرير.
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--site-header-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--site-header-h");
    };
  }, []);

  return (
    <header
      ref={ref}
      className="sticky z-50 bg-background/85 backdrop-blur"
      style={{ viewTransitionName: "site-header", top: "var(--demo-bar-h, 0px)" }}
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
          aria-label={`${brand.name}: ${c.home}`}
          className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap"
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
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
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
                    className="hidden h-11 sm:inline-flex"
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
            ref={menuButton}
            onClick={() => setOpen((v) => !v)}
            onKeyDown={(e) => {
              if (!open) return;
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Tab" && e.shiftKey) {
                const items = menu.current?.querySelectorAll<HTMLElement>(
                  "a[href], button:not([disabled])",
                );
                const last = items?.[items.length - 1];
                if (last) {
                  e.preventDefault();
                  last.focus();
                }
              }
            }}
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
        ref={menu}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            menuButton.current?.focus();
            return;
          }
          if (e.key !== "Tab" || !menu.current || !menuButton.current) return;
          const items = [
            menuButton.current,
            ...menu.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
          ];
          const at = items.indexOf(document.activeElement as HTMLElement);
          const next = e.shiftKey ? at - 1 : at + 1;
          if (next < 0 || next >= items.length) {
            e.preventDefault();
            items[next < 0 ? items.length - 1 : 0]?.focus();
          }
        }}
        className={cn("border-t border-border/70 lg:hidden", open ? "block" : "hidden")}
      >
        <nav className="mx-auto flex max-w-6xl flex-col p-2">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
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
                  className="min-h-11 rounded-lg px-3 text-start text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
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
