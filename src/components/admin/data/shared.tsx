import type { ReactNode } from "react";
import { DatabaseZap, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { flagOf } from "@/lib/countries";
import type { CountryRow } from "@/lib/data-entry";
import { useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

import { COPY } from "./copy";

export type Area = "countries" | "regions" | "groups" | "persons" | "bulk" | "team";
export const AREAS: readonly Area[] = ["countries", "regions", "groups", "persons", "bulk", "team"];

/** ما تتشاركه الخانات: الدول المحمَّلة، والدولة المختارة، والتنقّل بينها. */
export type Shared = {
  countries: CountryRow[];
  platformCurrency: string | null;
  country: string;
  setCountry: (code: string) => void;
  go: (area: Area, country?: string) => void;
  reloadCountries: () => void;
};

export const CARD =
  "rounded-2xl bg-card shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06),0_2px_4px_0_rgb(0_0_0/0.04)]";
/** علامة الاختيار بلون الهوية من رمزه، بلا صنفٍ جديد في ورقة الأنماط. */
export const ACCENT = { accentColor: "var(--primary)" } as const;
export const SELECT =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

/** رمز خطأ القاعدة ← جملةٌ مفهومة. */
export function useErrorText() {
  const c = useCopy(COPY);
  return (code: string | undefined) =>
    (c.errors as Record<string, string>)[code ?? ""] ?? c.errors.failed;
}

/** هجرةٌ لم تُطبَّق: ملاحظةٌ واضحة لا صفحةٌ مكسورة. */
export function NeedsUpdate({ className }: { className?: string }) {
  const c = useCopy(COPY);
  return (
    <div
      role="status"
      className={cn(
        "rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center",
        className,
      )}
    >
      <DatabaseZap
        className="mx-auto size-7 text-bridge-ink"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <p className="mt-3 text-base font-bold">{c.needsUpdateTitle}</p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-muted-foreground">
        {c.needsUpdateText}
      </p>
    </div>
  );
}

export function Busy() {
  const c = useCopy(COPY);
  return (
    <div className="flex justify-center py-12" role="status" aria-label={c.loading}>
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

export function Failed({ onRetry }: { onRetry: () => void }) {
  const c = useCopy(COPY);
  return (
    <div role="alert" className="rounded-2xl border border-border bg-card p-8 text-center">
      <p className="text-sm text-muted-foreground">{c.loadFailed}</p>
      <Button type="button" variant="outline" className="mt-4" onClick={onRetry}>
        {c.retry}
      </Button>
    </div>
  );
}

export function SectionHead({
  title,
  hint,
  action,
}: {
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-lg font-bold text-balance">{title}</h3>
        <p className="mt-1 max-w-2xl text-sm leading-7 text-muted-foreground">{hint}</p>
      </div>
      {action}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p
          id={`${htmlFor}-msg`}
          role="alert"
          className="mt-1.5 text-xs font-medium text-destructive"
        >
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${htmlFor}-msg`} className="mt-1.5 text-xs leading-5 text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/** اختيار دولةٍ من سجلّ المنصّة (لا من العالم): ما في السجلّ وحده يُربط به. */
export function CountrySelect({
  id,
  value,
  onChange,
  countries,
  allLabel,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  countries: ReadonlyArray<Pick<CountryRow, "code" | "name_ar">>;
  allLabel?: string;
  invalid?: boolean;
}) {
  const c = useCopy(COPY);
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid || undefined}
      className={SELECT}
    >
      <option value="">{allLabel ?? c.chooseCountry}</option>
      {countries.map((x) => (
        <option key={x.code} value={x.code}>
          {flagOf(x.code)} {x.name_ar}
        </option>
      ))}
    </select>
  );
}

export function Pill({ tone, children }: { tone: "wine" | "gold" | "quiet"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "wine" && "bg-primary/10 text-primary",
        tone === "gold" && "bg-bridge/15 text-bridge-ink",
        tone === "quiet" && "bg-secondary text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
