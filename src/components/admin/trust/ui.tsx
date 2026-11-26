import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { DatabaseZap, Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { countryName, flagOf } from "@/lib/countries";
import { formatDate } from "@/lib/format";
import { useCopy, useLocale } from "@/lib/locale";
import type { TrustResult } from "@/lib/trust-center.functions";

import { TRUST_COPY } from "./copy";

export const CARD =
  "rounded-2xl bg-card shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06),0_2px_4px_0_rgb(0_0_0/0.04)]";
export const TH =
  "px-3 py-2.5 text-start text-xs font-bold whitespace-nowrap text-muted-foreground";
export const TD = "px-3 py-3 align-middle";
export const NUM = "tabular-nums text-end";

/** اسم الدولة بلغة الواجهة: العربية من السجلّ، وغيرها من المتصفّح. */
export function useCountryLabel() {
  const locale = useLocale();
  return (code: string, nameAr?: string) =>
    locale === "ar" && nameAr ? nameAr : countryName(code, locale);
}

export function CountryCell({ code, nameAr }: { code: string; nameAr?: string }) {
  const label = useCountryLabel();
  return (
    <span className="inline-flex min-w-0 items-center gap-2 font-bold">
      <span aria-hidden="true">{flagOf(code)}</span>
      <bdi className="min-w-0 break-words">{label(code, nameAr)}</bdi>
    </span>
  );
}

export function useWhen() {
  const locale = useLocale();
  return (iso: string | null) => (iso ? formatDate(iso, locale) : null);
}

/** الأيام الكاملة منذ طابعٍ ما. */
export const daysSince = (iso: string, now = Date.now()) =>
  Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));

/** رابطٌ داخلي يفتح بالنقر دون إعادة تحميل، ويبقى رابطاً لفتحه في لسانٍ جديد. */
export function InnerLink({
  href,
  onOpen,
  children,
  className,
}: {
  href: string;
  onOpen: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onOpen();
      }}
      className={
        className ??
        "text-primary focus-visible:ring-ring inline-flex min-h-10 items-center rounded-md px-1 text-sm font-bold whitespace-nowrap underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
      }
    >
      {children}
    </a>
  );
}

export function SectionHead({ id, title, hint }: { id: string; title: string; hint: string }) {
  return (
    <div className="mb-4">
      <h3 id={id} className="text-lg font-bold text-balance">
        {title}
      </h3>
      <p className="text-muted-foreground mt-1 max-w-3xl text-sm leading-7 text-pretty">{hint}</p>
    </div>
  );
}

/**
 * الحالات الستّ لكل قسم: تحميل، وخطأ، وبلا صلاحية، و«تحتاج تحديث القاعدة»؛
 * والعادي والفارغ يرسمهما القسم نفسه.
 */
export function Loadable<T>({
  query,
  children,
}: {
  query: UseQueryResult<TrustResult<T>>;
  children: (data: T) => ReactNode;
}) {
  const c = useCopy(TRUST_COPY);
  if (query.isPending) {
    return (
      <div className="flex justify-center py-12" role="status" aria-label={c.loading}>
        <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }
  const r = query.data;
  if (!r || !r.ok) {
    if (r?.missing) {
      return (
        <div
          role="status"
          className="border-border bg-card/60 rounded-2xl border border-dashed p-8 text-center"
        >
          <DatabaseZap
            className="text-bridge-ink mx-auto size-7"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <p className="mt-3 text-base font-bold">{c.needsUpdateTitle}</p>
          <p className="text-muted-foreground mx-auto mt-2 max-w-lg text-sm leading-7">
            {c.needsUpdateText}
          </p>
        </div>
      );
    }
    if (r?.error === "admin_only") {
      return (
        <div
          role="status"
          className="border-border bg-card rounded-2xl border border-dashed p-8 text-center"
        >
          <Lock
            className="text-muted-foreground mx-auto size-6"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <p className="text-muted-foreground mt-3 text-sm">{c.forbidden}</p>
        </div>
      );
    }
    return (
      <div role="alert" className="border-border bg-card rounded-2xl border p-8 text-center">
        <p className="text-muted-foreground text-sm">{c.failed}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => void query.refetch()}
        >
          {c.retry}
        </Button>
      </div>
    );
  }
  return <>{children(r.data)}</>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="border-border bg-card text-muted-foreground rounded-2xl border border-dashed p-8 text-center text-sm leading-7">
      {children}
    </p>
  );
}
