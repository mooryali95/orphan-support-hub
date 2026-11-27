import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { TryChildCard } from "@/components/try/TryChildCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { countryName } from "@/lib/countries";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import {
  localTryChild,
  TRY_CHILDREN,
  TRY_CYCLE,
  TRY_WORLD_CHILDREN,
  TRY_WORLD_EXTRA,
  type TryChild,
} from "@/lib/try-demo";
import { cn } from "@/lib/utils";

const PAGE = 12;

const COPY = defineCopy("components/try/TryDirectory", {
  ar: {
    title: "دليل التجربة",
    lead: (n: string) =>
      `${n} طفلاً بأسماءٍ مستعارة في كلّ دول الشبكة. ابحث وصفِّ وادعم كما في الدليل الحقيقي، كلّه محاكاة لا يُخصم منه شيء.`,
    search: "ابحث بالاسم أو الدولة أو الرمز",
    allCountries: "كل الدول",
    all: "الكل",
    waiting: "ينتظر كافلاً",
    partial: "مكفول جزئياً",
    none: "لا أطفال بهذه الشروط. غيّر البحث أو الفلتر.",
    page: (p: number, of: number, n: string) => `${n} طفلاً · صفحة ${p} من ${of}`,
    prev: "السابقة",
    next: "التالية",
  },
  en: {
    title: "Trial directory",
    lead: (n: string) =>
      `${n} sample children across the network's countries, with pseudonyms. Search, filter and support as in the real directory. Everything is simulated; nothing is charged.`,
    search: "Search by name, country or code",
    allCountries: "All countries",
    all: "All",
    waiting: "Waiting for a sponsor",
    partial: "Partly sponsored",
    none: "No children match. Change the search or the filter.",
    page: (p: number, of: number, n: string) => `${n} children · page ${p} of ${of}`,
    prev: "Previous",
    next: "Next",
  },
});

type Status = "all" | "waiting" | "partial";

/**
 * دليل التجربة: كلّ أطفال التجربة (الستّة المختارون، وطفل كلّ دولة، والإضافيون
 * في كلّ منطقة) ببحثٍ وفلترة وصفحات — ليُجرَّب الدليل بحجمٍ يشبه الحقيقة.
 * لا شيء هنا يصل خادماً: الأطفال مولَّدون في المتصفّح (`try-world`).
 */
export function TryDirectory() {
  const t = useCopy(COPY);
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [co, setCo] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [page, setPage] = useState(0);
  // الدليل يُرسم في المتصفّح وحده: ترتيب أسماء الدول يختلف بين الخادم والمتصفّح فيختلّ الربط.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const all = useMemo<TryChild[]>(
    () =>
      [
        // ملفّ «الدورة الكاملة» المنشور أوّلاً، ثم البقيّة بالأطول انتظاراً
        ...TRY_CYCLE,
        ...[...TRY_CHILDREN, ...TRY_WORLD_CHILDREN, ...TRY_WORLD_EXTRA].sort(
          (a, b) => b.waitingDays - a.waitingDays,
        ),
      ].map((c) => localTryChild(c, locale)),
    [locale],
  );
  const countries = useMemo(
    () =>
      [...new Set(all.map((c) => c.co))]
        .map((code) => ({ code, name: countryName(code, locale) }))
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
    [all, locale],
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(
      (c) =>
        (!co || c.co === co) &&
        (status === "all" || (status === "waiting" ? c.funded === 0 : c.funded > 0)) &&
        (!needle ||
          c.name.toLowerCase().includes(needle) ||
          c.country.toLowerCase().includes(needle) ||
          c.code.toLowerCase().includes(needle)),
    );
  }, [all, q, co, status]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const current = Math.min(page, pages - 1);
  const rows = shown.slice(current * PAGE, current * PAGE + PAGE);
  const n = (v: number) => v.toLocaleString(locale, { numberingSystem: "latn" });

  if (!mounted) {
    return (
      <section aria-labelledby="try-directory" className="mt-16">
        <h2 id="try-directory" className="text-2xl font-bold">
          {t.title}
        </h2>
      </section>
    );
  }

  const chip = (on: boolean) =>
    cn(
      "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-bold transition-colors",
      on
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card hover:border-primary/50",
    );

  return (
    <section aria-labelledby="try-directory" className="mt-16">
      <h2 id="try-directory" className="text-2xl font-bold">
        {t.title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
        {t.lead(n(all.length))}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label={t.search}
            placeholder={t.search}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            className="h-10 ps-9"
          />
        </div>
        <select
          aria-label={t.allCountries}
          value={co}
          onChange={(e) => {
            setCo(e.target.value);
            setPage(0);
          }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{t.allCountries}</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        {(["all", "waiting", "partial"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            className={chip(status === s)}
            onClick={() => {
              setStatus(s);
              setPage(0);
            }}
          >
            {t[s]}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t.none}
        </p>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((k) => (
            <TryChildCard key={k.id} child={k} />
          ))}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between text-xs">
        <span className="tabular-nums text-muted-foreground">
          {t.page(current + 1, pages, n(shown.length))}
        </span>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
            aria-label={t.prev}
          >
            <ChevronRight className="size-4 ltr:-scale-x-100" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={current + 1 >= pages}
            onClick={() => setPage(current + 1)}
            aria-label={t.next}
          >
            <ChevronLeft className="size-4 ltr:-scale-x-100" />
          </Button>
        </div>
      </div>
    </section>
  );
}
