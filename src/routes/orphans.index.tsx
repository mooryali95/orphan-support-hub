import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { OrphanCard } from "@/components/OrphanCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { listOrphanCards, getFilterOptions } from "@/lib/protection.functions";
import { getSupportCatalog } from "@/lib/support.functions";
import { AGE_BAND_LABELS, type AgeBand } from "@/integrations/supabase/types.extra";
import { cn } from "@/lib/utils";
import { CountryPicker } from "@/components/geo/CountryPicker";
import { countryName, resolveCountry } from "@/lib/countries";
import { findCountry, geoQuery } from "@/lib/geo";
import { arCount, COUNTRIES, FILES } from "@/lib/plural";
import { BRAND, pageTitle } from "@/config/brand";

const optionsQuery = queryOptions({
  queryKey: ["orphan-filter-options"],
  queryFn: () => getFilterOptions(),
});

const firstPageQuery = queryOptions({
  queryKey: ["orphan-cards", "default"],
  queryFn: () => listOrphanCards({ data: {} }),
});

export const Route = createFileRoute("/orphans/")({
  head: () => ({
    meta: [
      { title: pageTitle("دليل الأيتام") },
      {
        name: "description",
        content: BRAND.description,
      },
      { property: "og:title", content: pageTitle("دليل الأيتام") },
      {
        property: "og:description",
        content: BRAND.description,
      },
    ],
  }),
  // الفلترة في الرابط: تُشارَك، ويعيدها زرّ الرجوع، ولا تضيع بالتحديث.
  validateSearch: (raw: Record<string, unknown>): DirectorySearch => {
    const str = (k: string) => (typeof raw[k] === "string" && raw[k] ? String(raw[k]) : undefined);
    const out: DirectorySearch = {};
    for (const k of ["q", "country", "region", "age", "gender", "stage", "group"] as const) {
      const v = str(k);
      if (v) out[k] = v;
    }
    const f = str("funding");
    if (f === "open" || f === "full") out.funding = f;
    const so = str("sort");
    if (so === "closest" || so === "newest") out.sort = so;
    if (raw["building"] === true || raw["building"] === "1" || raw["building"] === 1)
      out.building = true;
    const pg = Number(raw["page"]);
    if (Number.isInteger(pg) && pg > 0) out.page = pg;
    return out;
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(firstPageQuery),
  component: OrphansPage,
});

type Funding = "any" | "open" | "full";
type DirectorySearch = {
  q?: string;
  country?: string;
  region?: string;
  age?: string;
  gender?: string;
  stage?: string;
  group?: string;
  funding?: "open" | "full";
  sort?: "closest" | "newest";
  building?: boolean;
  page?: number;
};
type Sort = "waiting" | "closest" | "newest";

const SORTS: Array<[Sort, string]> = [
  ["waiting", "الأطول انتظاراً"],
  ["closest", "الأقرب للاكتمال"],
  ["newest", "الأحدث"],
];

const AGE_BANDS: AgeBand[] = ["under_6", "age_6_11", "age_12_14", "age_15_17", "age_18_plus"];

const PAGE = 24;

/**
 * الدليل — بطاقاتٌ لا ملفّات.
 *
 * والفلترة **في القاعدة لا في المتصفّح**: فلترةٌ في العميل تعني أن
 * الصفحة حمّلت كل شيء ثم أخفت بعضه — وما حُمِّل وصل. وهي كذلك لا
 * تُرقّم: خمسون ملفاً تمرّ، وخمسة آلاف لا.
 */
function OrphansPage() {
  const { data: first } = useSuspenseQuery(firstPageQuery);
  const { data: options } = useQuery(optionsQuery);
  // البلد والمنطقة من مصدر الجغرافيا الواحد — ما تُظهره الخارطة يجده الدليل.
  const { data: geo } = useQuery(geoQuery);
  // المجموعات من كتالوج الدعم العامّ: اسمٌ ومنطقة وعدد، بلا مشرف ولا أسماء.
  const { data: catalog } = useQuery({
    queryKey: ["support-catalog"],
    queryFn: () => getSupportCatalog(),
  });
  const groups = catalog?.catalog?.groups ?? [];

  const sp = Route.useSearch();
  const navigate = Route.useNavigate();
  const sort: Sort = sp.sort ?? "waiting";
  const funding: Funding = sp.funding ?? "any";
  const page = sp.page ?? 0;

  /** كل تغييرٍ في الفلترة يعيدنا إلى الصفحة الأولى، وإلا ظهرت صفحةٌ فارغة. */
  function set(
    patch: { [K in keyof DirectorySearch]?: DirectorySearch[K] | undefined },
    keepPage = false,
  ) {
    void navigate({
      search: (prev) => {
        const next: Record<string, unknown> = { ...prev, ...patch };
        if (!keepPage) delete next["page"];
        for (const k of Object.keys(next)) {
          if (next[k] === "" || next[k] === undefined || next[k] === false) delete next[k];
        }
        return next as DirectorySearch;
      },
      replace: true,
      resetScroll: false,
      viewTransition: false,
    });
  }

  // البحث النصّي يُكتب محلياً ويصل الرابطَ بعد توقّف الكتابة.
  const [text, setText] = useState(sp.q ?? "");
  useEffect(() => setText(sp.q ?? ""), [sp.q]);
  useEffect(() => {
    if (text.trim() === (sp.q ?? "")) return;
    const id = setTimeout(() => set({ q: text.trim() || undefined }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const [panelOpen, setPanelOpen] = useState(false);

  const filters = {
    ...(sp.q ? { search: sp.q } : {}),
    ...(sp.country ? { country: sp.country } : {}),
    ...(sp.region ? { region: sp.region } : {}),
    ...(sp.age ? { ageBand: sp.age as AgeBand } : {}),
    ...(sp.gender ? { gender: sp.gender as "male" | "female" } : {}),
    ...(sp.stage ? { educationStage: sp.stage } : {}),
    ...(sp.group ? { group: sp.group } : {}),
    ...(funding !== "any" ? { funding } : {}),
    ...(sp.building ? { building: true } : {}),
    sort,
    limit: PAGE,
    offset: page * PAGE,
  };

  const pristine = Object.keys(sp).length === 0;

  const { data: result, isFetching } = useQuery({
    queryKey: ["orphan-cards", filters],
    queryFn: () => listOrphanCards({ data: filters }),
    enabled: !pristine,
    placeholderData: (prev) => prev,
  });

  const shown = pristine ? first : (result ?? first);
  const rows = shown.rows;
  const total = shown.total;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? id;
  const countryLabel = (v: string) => {
    const code = resolveCountry(v);
    return code ? countryName(code) : v;
  };

  /** الفلاتر النشطة رقاقاتٍ تُزال واحدةً واحدة — يرى الزائر لماذا قلّت النتائج. */
  const chips: Array<{ key: string; label: string; clear: () => void }> = [
    ...(sp.q ? [{ key: "q", label: `«${sp.q}»`, clear: () => set({ q: undefined }) }] : []),
    ...(sp.country
      ? [
          {
            key: "country",
            label: countryLabel(sp.country),
            clear: () => set({ country: undefined, region: undefined }),
          },
        ]
      : []),
    ...(sp.region
      ? [{ key: "region", label: sp.region, clear: () => set({ region: undefined }) }]
      : []),
    ...(sp.age
      ? [
          {
            key: "age",
            label: AGE_BAND_LABELS[sp.age as AgeBand] ?? sp.age,
            clear: () => set({ age: undefined }),
          },
        ]
      : []),
    ...(sp.gender
      ? [
          {
            key: "gender",
            label: sp.gender === "female" ? "أنثى" : "ذكر",
            clear: () => set({ gender: undefined }),
          },
        ]
      : []),
    ...(sp.stage
      ? [{ key: "stage", label: sp.stage, clear: () => set({ stage: undefined }) }]
      : []),
    ...(sp.group
      ? [{ key: "group", label: groupName(sp.group), clear: () => set({ group: undefined }) }]
      : []),
    ...(funding !== "any"
      ? [
          {
            key: "funding",
            label: funding === "open" ? "بحاجة لكافل" : "مكفول",
            clear: () => set({ funding: undefined }),
          },
        ]
      : []),
    ...(sp.building
      ? [{ key: "building", label: "برنامج بناء أهلية", clear: () => set({ building: undefined }) }]
      : []),
  ];
  const panelCount = chips.filter((c) => !["q", "funding"].includes(c.key)).length;

  function reset() {
    setText("");
    void navigate({ search: {}, replace: true, resetScroll: false, viewTransition: false });
  }

  const fromGeo = !!geo?.available;
  const countries = fromGeo ? geo.countries.map((c) => c.value) : (options?.countries ?? []);
  const countryCounts = fromGeo
    ? Object.fromEntries(
        geo.countries.filter((c) => c.total != null).map((c) => [c.value, c.total!]),
      )
    : undefined;
  // المناطق تتبع الدولة المختارة؛ وبلا دولة: كلّ المناطق.
  const geoCountry = findCountry(geo, sp.country);
  const regions = fromGeo
    ? (geoCountry ? [geoCountry] : geo.countries).flatMap((c) => c.regions.map((r) => r.value))
    : (options?.regions ?? []);

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-3xl font-extrabold">دليل الأيتام</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
          جميع الملفات المعروضة معتمدة من الإدارة بعد توثيقها من جهة رعاية مرخّصة
          {countries.length > 1 ? ` — في ${arCount(countries.length, COUNTRIES)}.` : "."}
        </p>

        {/* القاعدة تُشرَح قبل أن تُصادَف: من يفتح ملفّاً ويجده مقتضباً
            ينبغي أن يكون عرف السبب هنا. */}
        <p className="mt-4 flex max-w-2xl items-start gap-2 rounded-2xl bg-secondary/60 p-4 text-xs leading-6">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-shore-thrive" aria-hidden="true" />
          <span>
            <strong className="text-foreground">ما يُعرض هنا بطاقةٌ لا ملفّ:</strong> اسمٌ مستعار،
            وبلدٌ ومنطقة، وفئةٌ عمرية، وحال التمويل. أمّا قصّة الطفل وصورته ومدينته فخلف إذنٍ من
            الإدارة يُطلَب من صفحته — لأنّ ملفّ طفلٍ ليس صفحةً تُتصفَّح.
          </span>
        </p>

        <div className="mt-8 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Search
                className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="ابحث بالاسم المستعار أو رقم الملف"
                aria-label="بحث"
                className="pe-9 text-base md:text-sm"
              />
            </div>

            {/* الدولة في الواجهة لا في اللوحة: أوّل ما يسأل عنه الكافل. */}
            <div className="w-full sm:w-56">
              <CountryPicker
                value={sp.country ?? ""}
                onChange={(v) => set({ country: v || undefined, region: undefined })}
                values={countries}
                {...(countryCounts ? { counts: countryCounts } : {})}
              />
            </div>

            <select
              value={sort}
              onChange={(e) =>
                set({
                  sort:
                    e.target.value === "waiting"
                      ? undefined
                      : (e.target.value as "closest" | "newest"),
                })
              }
              aria-label="ترتيب النتائج"
              className="h-9 rounded-md border border-input bg-background px-3 text-base md:text-sm"
            >
              {SORTS.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>

            <div
              role="group"
              aria-label="تصفية حسب حالة الكفالة"
              className="flex rounded-md border border-input p-1"
            >
              {(
                [
                  ["any", "الكل"],
                  ["open", "بحاجة لكافل"],
                  ["full", "مكفول"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={funding === key}
                  onClick={() => set({ funding: key === "any" ? undefined : key })}
                  className={cn(
                    "min-h-8 rounded px-3 py-1 text-xs font-medium transition-colors",
                    funding === key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* على الجوال تُطوى بقية الفلاتر خلف زرٍّ يذكر عدد النشط منها. */}
            <Button
              type="button"
              variant="outline"
              className="md:hidden"
              aria-expanded={panelOpen}
              aria-controls="directory-filters"
              onClick={() => setPanelOpen((o) => !o)}
            >
              <SlidersHorizontal aria-hidden="true" />
              فلترة أدقّ
              {panelCount > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-xs tabular-nums text-primary-foreground">
                  {panelCount}
                </span>
              )}
            </Button>
          </div>

          <div
            id="directory-filters"
            className={cn(
              "flex-wrap items-end gap-x-4 gap-y-3 rounded-2xl border border-border bg-card p-4 md:flex [&>div]:flex [&>div]:min-w-36 [&>div]:flex-col [&>div]:gap-1",
              panelOpen ? "flex" : "hidden",
            )}
          >
            <Picker
              id="f-region"
              label="المنطقة"
              value={sp.region ?? ""}
              onChange={(v) => set({ region: v || undefined })}
              all="كل المناطق"
              options={[...new Set(regions)]}
            />
            <div>
              <Label htmlFor="f-age" className="text-xs">
                الفئة العمرية
              </Label>
              <select
                id="f-age"
                value={sp.age ?? ""}
                onChange={(e) => set({ age: e.target.value || undefined })}
                className="mt-1 h-9 rounded-md border border-input bg-background px-3 text-base md:text-sm"
              >
                <option value="">كل الأعمار</option>
                {AGE_BANDS.map((b) => (
                  <option key={b} value={b}>
                    {AGE_BAND_LABELS[b]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="f-gender" className="text-xs">
                الجنس
              </Label>
              <select
                id="f-gender"
                value={sp.gender ?? ""}
                onChange={(e) => set({ gender: e.target.value || undefined })}
                className="mt-1 h-9 rounded-md border border-input bg-background px-3 text-base md:text-sm"
              >
                <option value="">الجميع</option>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </div>
            <Picker
              id="f-stage"
              label="المرحلة الدراسية"
              value={sp.stage ?? ""}
              onChange={(v) => set({ stage: v || undefined })}
              all="كل المراحل"
              options={options?.stages ?? []}
            />
            {groups.length > 0 && (
              <div>
                <Label htmlFor="f-group" className="text-xs">
                  المجموعة
                </Label>
                <select
                  id="f-group"
                  value={sp.group ?? ""}
                  onChange={(e) => set({ group: e.target.value || undefined })}
                  className="mt-1 h-9 rounded-md border border-input bg-background px-3 text-base md:text-sm"
                >
                  <option value="">كل المجموعات</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {g.region ? ` — ${g.region}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label className="flex min-h-9 items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={!!sp.building}
                onChange={(e) => set({ building: e.target.checked || undefined })}
                className="size-4"
              />
              برنامج بناء أهلية قائم
            </label>
          </div>

          {chips.length > 0 && (
            <ul className="flex flex-wrap items-center gap-2" aria-label="الفلاتر النشطة">
              {chips.map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={c.clear}
                    className="inline-flex min-h-8 items-center gap-1 rounded-full bg-secondary px-3 text-xs transition-[background-color,transform] duration-150 hover:bg-secondary/70 active:scale-[0.97]"
                    aria-label={`إزالة: ${c.label}`}
                  >
                    <bdi>{c.label}</bdi>
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
              <li>
                <Button type="button" size="sm" variant="ghost" onClick={reset}>
                  مسح الكل
                </Button>
              </li>
            </ul>
          )}
        </div>

        <p
          className={cn(
            "mt-6 text-xs text-muted-foreground transition-opacity",
            isFetching && "opacity-60",
          )}
          aria-live="polite"
        >
          {arCount(total, FILES)}
        </p>

        {rows.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            <p>لا توجد نتائج مطابقة.</p>
            {chips.length > 0 && (
              <p className="mt-3">
                جرّب إزالة أحد الفلاتر أعلاه، أو{" "}
                <button
                  type="button"
                  onClick={reset}
                  className="font-medium text-primary underline underline-offset-4"
                >
                  ابدأ من جديد
                </button>
                .
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((orphan, i) => (
              // المفتاح يتضمّن الصفحة: صفحةٌ جديدة تصعد بطاقاتها بالتتابع من جديد.
              <div
                key={`${page}-${orphan.id}`}
                className="stagger-in"
                style={{ ["--i" as string]: i }}
              >
                <OrphanCard orphan={orphan} />
              </div>
            ))}
          </div>
        )}

        {pages > 1 && (
          <nav
            aria-label="صفحات الدليل"
            className="mt-8 flex items-center justify-center gap-3 text-sm"
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => set({ page: page - 1 || undefined }, true)}
            >
              السابق
            </Button>
            <span aria-live="polite" className="text-muted-foreground text-xs tabular-nums">
              صفحة {page + 1} من {pages}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page + 1 >= pages}
              onClick={() => set({ page: page + 1 }, true)}
            >
              التالي
            </Button>
          </nav>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function Picker({
  id,
  label,
  value,
  onChange,
  all,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  all: string;
  options: string[];
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 rounded-md border border-input bg-background px-3 text-base md:text-sm"
      >
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
