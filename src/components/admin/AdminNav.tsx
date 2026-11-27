import { ChevronRight } from "lucide-react";
import { defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/admin/AdminNav", {
  ar: { screen: "الشاشة", label: "أقسام الإدارة" },
  en: { screen: "Screen", label: "Administration sections" },
});

export type AdminNavItem<T extends string> = { key: T; label: string; count: number | null };
export type AdminNavSection<T extends string> = { label: string; items: AdminNavItem<T>[] };

/**
 * تنقّل الإدارة: شريطٌ جانبي على الحاسوب، وقائمةٌ منسدلة على الجوال.
 * الأقسام الأربعة عناوين، وتحت كلٍّ شاشاته بعدّادها — بدل خمسة عشر زرّاً
 * متجاوراً. لا يغيّر شاشةً ولا وظيفة؛ يغيّر الوصول إليها فقط.
 */
export function AdminNav<T extends string>({
  sections,
  active,
  onSelect,
  homeLabel,
  onHome,
}: {
  sections: AdminNavSection<T>[];
  active: T;
  onSelect: (key: T) => void;
  homeLabel: string;
  onHome: () => void;
}) {
  const t = useCopy(COPY);
  return (
    <>
      {/* الجوال: قائمة منسدلة أصلية — تعمل بلوحة المفاتيح وقارئ الشاشة بلا كود. */}
      <div className="mb-6 lg:hidden">
        <label
          htmlFor="admin-screen"
          className="text-muted-foreground mb-2 block text-xs font-bold"
        >
          {t.screen}
        </label>
        <select
          id="admin-screen"
          value={active}
          onChange={(e) => {
            if (e.target.value === "__home") onHome();
            else onSelect(e.target.value as T);
          }}
          className="border-border bg-card focus-visible:ring-ring h-12 w-full rounded-xl border px-3 text-sm font-bold focus-visible:ring-2 focus-visible:outline-none"
        >
          <option value="__home">{homeLabel}</option>
          {sections.map((s) => (
            <optgroup key={s.label} label={s.label}>
              {s.items.map((it) => (
                <option key={it.key} value={it.key}>
                  {it.label}
                  {it.count ? ` (${it.count})` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* الحاسوب: شريطٌ ثابت يبقى ظاهراً أثناء التمرير. */}
      <nav aria-label={t.label} className="hidden lg:block">
        <div className="border-border bg-card sticky top-20 rounded-2xl border p-3">
          <a
            href="/admin"
            onClick={(e) => {
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              onHome();
            }}
            className="text-primary hover:bg-secondary/60 focus-visible:ring-ring mb-2 flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold focus-visible:ring-2 focus-visible:outline-none"
          >
            <ChevronRight aria-hidden="true" className="size-4 ltr:-scale-x-100" strokeWidth={2} />
            {homeLabel}
          </a>
          <div className="brand-rule mx-3 mb-3 h-px opacity-60" aria-hidden="true" />
          {sections.map((s) => (
            <div key={s.label} className="mb-3 last:mb-0">
              <p className="text-muted-foreground px-3 pt-1 pb-1.5 text-[11px] font-bold tracking-wide">
                {s.label}
              </p>
              <ul>
                {s.items.map((it) => {
                  const on = it.key === active;
                  return (
                    <li key={it.key}>
                      <button
                        type="button"
                        aria-current={on ? "page" : undefined}
                        onClick={() => onSelect(it.key)}
                        className={cn(
                          "focus-visible:ring-ring relative flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-start text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
                          on
                            ? "bg-primary/10 text-primary font-bold"
                            : "text-foreground/80 hover:bg-secondary/60 hover:text-foreground font-medium",
                        )}
                      >
                        {on && (
                          <span
                            aria-hidden="true"
                            className="bg-bridge absolute inset-y-2 start-0 w-[3px] rounded-full"
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate">{it.label}</span>
                        {it.count !== null && it.count > 0 && (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs tabular-nums",
                              on
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary text-foreground",
                            )}
                          >
                            {it.count}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
