import { ChevronLeft, ChevronRight } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";

import type { AdminTab } from "@/lib/admin-overview";
import { dirOf, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

/** ما تفعله اللوحة خارج نفسها: فتح شاشةٍ قائمة، وتبديل العيّنة النموذجية. */
export type OverviewActions = {
  open: (tab: AdminTab) => void;
  setSample: (on: boolean) => void;
};
export const OverviewActionsContext = createContext<OverviewActions>({
  open: () => {},
  setSample: () => {},
});

/**
 * زرٌّ يفتح شاشةً قائمة من مساحة العمل الإدارية (تبويبات ‎/admin نفسها): اللوحة
 * تبويبها الأوّل، فالانتقال تبديلُ تبويبٍ في الصفحة لا تحميلٌ جديد.
 */
export function TabLink({
  tab,
  className,
  children,
  ...rest
}: {
  tab: AdminTab;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const { open } = useContext(OverviewActionsContext);
  return (
    <button
      type="button"
      onClick={() => open(tab)}
      className={cn("text-start", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

/** رابطٌ نصّي هادئ بسهمٍ يتبع اتجاه القراءة. */
export function MoreLink({ tab, children }: { tab: AdminTab; children: ReactNode }) {
  return (
    <TabLink
      tab={tab}
      className="ov-bleed inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      <Forward className="size-4" />
    </TabLink>
  );
}

/**
 * سهم «إلى الأمام» باتجاه القراءة. يُختار من لغة اللوحة لا من `rtl:` — اللوحة قد
 * تُعرض بالإنجليزية داخل غلافٍ عربيّ الاتجاه، فمحدِّد السلف يخطئ.
 */
export function Forward({ className }: { className?: string }) {
  const Icon = dirOf(useLocale()) === "rtl" ? ChevronLeft : ChevronRight;
  return <Icon aria-hidden="true" className={className} strokeWidth={2} />;
}

export function SampleTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-bridge/60 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-bridge-ink">
      {children}
    </span>
  );
}

/** لوحةٌ واحدة: عنوانٌ وسطرٌ يشرحه، ثم محتواها، ثم روابط شاشاتها. */
export function Panel({
  id,
  title,
  lead,
  tag,
  aside,
  footer,
  className,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  tag?: string | null;
  aside?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "flex flex-col rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={id} className="font-display text-xl leading-8 font-bold">
              {title}
            </h2>
            {tag && <SampleTag>{tag}</SampleTag>}
          </div>
          {lead && <p className="mt-1 text-sm leading-7 text-muted-foreground">{lead}</p>}
        </div>
        {aside}
      </div>
      <div className="mt-5 flex-1">{children}</div>
      {footer && (
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border pt-3">
          {footer}
        </div>
      )}
    </section>
  );
}

/** رقمٌ صغير فوق تسميته — للأرقام الثانوية داخل اللوحات. */
export function Fig({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string | undefined;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-lg leading-7 font-bold tabular-nums">{value}</p>
      <p className="text-sm leading-6 text-muted-foreground">{label}</p>
      {hint && <p className="text-xs leading-5 text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

/**
 * شريطٌ رفيع من جزأين: النبيذي لما تحقّق، والشمبانيا لما بقي، وبينهما فاصلٌ بلون
 * السطح. بلا نصٍّ داخله؛ التسمية والأرقام بجواره دائماً، فلا يُقرأ باللون وحده.
 */
export function SplitBar({
  done,
  rest,
  label,
  className,
}: {
  done: number;
  rest: number;
  label: string;
  className?: string;
}) {
  const total = done + rest;
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("flex h-2 gap-0.5 overflow-hidden rounded-full", className)}
    >
      {total === 0 && <span className="h-full flex-1 rounded-full bg-secondary" />}
      {done > 0 && <span className="h-full rounded-full bg-primary" style={{ flexGrow: done }} />}
      {rest > 0 && <span className="h-full rounded-full bg-bridge" style={{ flexGrow: rest }} />}
    </div>
  );
}

/** مفتاح الشريط: نقطةٌ بلون الجزء بجوار اسمه وعدده، بحبر النصّ لا بلون البيانات. */
export function Key({
  tone,
  label,
  value,
}: {
  tone: "done" | "rest";
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span
        aria-hidden="true"
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          tone === "done" ? "bg-primary" : "bg-bridge",
        )}
      />
      <span className="text-lg leading-7 font-bold tabular-nums">{value}</span>
      <span className="text-sm leading-6 text-muted-foreground">{label}</span>
    </div>
  );
}

/** مقياس تغطية: الممتلئ نبيذي، والمسار درجةٌ أفتح من اللون نفسه. */
export function Meter({ percent, label }: { percent: number; label: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={p}
      className="h-1.5 overflow-hidden rounded-full bg-primary/15"
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${p}%` }} />
    </div>
  );
}

/** حالةٌ هادئة داخل لوحة: فراغٌ أو تعذّر، بجملةٍ تقول ما هنا. */
export function Quiet({ title, text }: { title: string; text?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center">
      <p className="text-sm font-bold">{title}</p>
      {text && (
        <p className="mx-auto mt-1 max-w-sm text-sm leading-7 text-muted-foreground">{text}</p>
      )}
    </div>
  );
}
