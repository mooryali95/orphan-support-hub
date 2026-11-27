import { exitDemo, useDemo } from "@/lib/demo-mode";
import { defineCopy, useCopy } from "@/lib/locale";

const COPY = defineCopy("components/DemoModeBar", {
  ar: {
    label: "الوضع التجريبي",
    note: "بيانات وهمية، بلا حساب ولا خصم.",
    donor: "رحلة الداعم",
    roles: "الأدوار",
    admin: "لوحة الإدارة",
    hall: "قاعة الأثر",
    exit: "العودة إلى المنصّة الحقيقية",
  },
  en: {
    label: "Demo mode",
    note: "Sample data, no account and nothing charged.",
    donor: "Supporter journey",
    roles: "Roles",
    admin: "Admin panel",
    hall: "Impact hall",
    exit: "Back to the real platform",
  },
});

const LINK =
  "inline-flex min-h-9 items-center rounded-full px-3 text-xs font-bold hover:bg-background/15 dark:hover:bg-foreground/10";

/**
 * روابط عاديّة لا روابط الموجّه: الشريط قطعةٌ تُحمَّل وحدها، فلا يشارك صفحاتِ المنصّة وحداتِها.
 *
 * شريط الوضع التجريبي: يظهر فوق كل صفحةٍ ما دام الزائر في التجربة، فلا تُقرأ أرقام العيّنة
 * نتائجَ حقيقية، ويجمع أبوابها الثلاثة ومخرجها في مكانٍ واحد.
 */
export default function DemoModeBar() {
  const demo = useDemo();
  const c = useCopy(COPY);
  if (!demo) return null;
  return (
    <div
      role="region"
      data-demo-bar
      aria-label={c.label}
      className="sticky top-0 z-50 bg-foreground text-background dark:border-b dark:border-border dark:bg-secondary dark:text-foreground print:hidden"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
        <span className="inline-flex items-center gap-2 text-sm font-bold">{c.label}</span>
        <span className="text-xs opacity-90">{c.note}</span>
        <nav className="ms-auto flex flex-wrap items-center gap-1">
          <a href="/try" className={LINK}>
            {c.donor}
          </a>
          <a href="/try#try-roles" className={LINK}>
            {c.roles}
          </a>
          <a href="/try/admin" className={LINK}>
            {c.admin}
          </a>
          <a href="/hall?try=1" className={LINK}>
            {c.hall}
          </a>
          <button
            type="button"
            className={`${LINK} gap-1 border border-current/40`}
            onClick={() => {
              exitDemo();
              window.location.assign("/");
            }}
          >
            {c.exit}
          </button>
        </nav>
      </div>
    </div>
  );
}
