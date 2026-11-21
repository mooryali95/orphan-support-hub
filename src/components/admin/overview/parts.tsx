import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { createContext, useContext, type MouseEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { AdminTab, Amount } from "@/lib/admin-overview";
import { formatMoney } from "@/lib/format";
import { dirOf, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

/** ما تفعله اللوحة خارج نفسها: فتح شاشةٍ قائمة، وتبديل العيّنة النموذجية. */
export type OverviewActions = {
  open: (tab: AdminTab) => void;
  /** عنوان الشاشة نفسها: الرابط يُفتح في نافذةٍ جديدة ويُنسخ ويُشارَك. */
  href: (tab: AdminTab) => string;
  setSample: (on: boolean) => void;
  /** `null` تعيد الفترة الافتراضية (لا تُكتب في العنوان). */
  setPeriod: (months: number | null) => void;
};
export const OverviewActionsContext = createContext<OverviewActions>({
  open: () => {},
  href: () => "#",
  setSample: () => {},
  setPeriod: () => {},
});

/**
 * رابطٌ إلى شاشةٍ قائمة من مساحة العمل الإدارية (‎/admin?tab=…). رابطٌ حقيقي: يُفتح
 * في نافذةٍ جديدة ويُنسخ، والنقر العادي تبديلُ تبويبٍ في الصفحة لا تحميلٌ جديد —
 * والعنوان يتغيّر، فزرّ الرجوع يعيد إلى اللوحة.
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
  "data-sev"?: string;
}) {
  const { open, href } = useContext(OverviewActionsContext);
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    open(tab);
  };
  return (
    <a href={href(tab)} onClick={go} className={cn("text-start", className)} {...rest}>
      {children}
    </a>
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
 * شريطٌ رفيع: الجزء المتحقّق بلون الهوية، والباقي مسارٌ من اللون نفسه مخفَّفاً،
 * وبينهما فاصلٌ بلون السطح. لونٌ واحد ودرجته — الجزء من كلّه، لا فئتان تتنافسان —
 * فلا يحمل اللون هويّةً يُخطئها من لا يميّز الألوان. والتسمية والأرقام بجواره دائماً.
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
      {total === 0 && <span className="ov-track h-full flex-1 rounded-full" />}
      {done > 0 && <span className="ov-mark h-full rounded-full" style={{ flexGrow: done }} />}
      {rest > 0 && <span className="ov-track h-full rounded-full" style={{ flexGrow: rest }} />}
    </div>
  );
}

/** مفتاح الشريط: نقطةٌ بلون الجزء بجوار اسمه، بحبر النصّ لا بلون البيانات. */
export function Key({ tone, label }: { tone: "done" | "rest"; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={cn("size-2.5 shrink-0 rounded-full", tone === "done" ? "ov-mark" : "ov-track")}
      />
      {label}
    </span>
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
      className="ov-track h-1.5 overflow-hidden rounded-full"
    >
      <div className="ov-mark h-full rounded-full" style={{ width: `${p}%` }} />
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

/**
 * تعذّرت القراءة — غير الفراغ: إطارٌ متّصل وعلامة تنبيه وزرّ إعادة، حيث الفراغ
 * إطارٌ منقّط بلا علامة. من يرى اللوحة يعرف أنّ الرقم غائبٌ لا صفر.
 */
export function Failed({
  title,
  text,
  retry,
  onRetry,
}: {
  title: string;
  text?: string;
  retry?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="ov-failed flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl p-4"
    >
      <TriangleAlert
        aria-hidden="true"
        className="size-5 shrink-0 text-destructive"
        strokeWidth={1.5}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{title}</p>
        {text && <p className="text-sm leading-7 text-muted-foreground">{text}</p>}
      </div>
      {retry && onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="ov-noprint">
          {retry}
        </Button>
      )}
    </div>
  );
}

/** مبالغ بعملاتها متجاورةً — لا تُجمع عملتان. */
export function Amounts({ items, locale }: { items: readonly Amount[]; locale: string }) {
  return (
    <span className="inline-flex flex-wrap gap-x-3">
      {items.map((a) => (
        <span key={a.currency}>{formatMoney(a.amount, a.currency, locale)}</span>
      ))}
    </span>
  );
}

/** اختيارٌ من بضع قيم: أزرارٌ متلاصقة، المختار مملوء. */
export function Segmented<T extends number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="ov-seg ov-noprint">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
