import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, ShieldCheck } from "lucide-react";
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
  loader: ({ context }) => context.queryClient.ensureQueryData(firstPageQuery),
  component: OrphansPage,
});

type Funding = "any" | "open" | "full";
type Sort = "waiting" | "closest" | "newest";

const SORTS: Array<[Sort, string]> = [
  ["waiting", "الأطول انتظاراً"],
  ["closest", "الأقرب للاكتمال"],
  ["newest", "الأحدث"],
];

const AGE_BANDS: AgeBand[] = ["under_6", "age_6_11", "age_12_14", "age_15_17", "age_18_plus"];

/** جمع عربي سليم: «ملف» للواحد، «ملفان» للاثنين، «ملفات» لما بينهما. */
function countLabel(n: number) {
  if (n === 0) return "لا ملفات";
  if (n === 1) return "ملف واحد";
  if (n === 2) return "ملفان";
  if (n <= 10) return `${n} ملفات`;
  return `${n} ملفاً`;
}

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
  // المجموعات من كتالوج الدعم العامّ: اسمٌ ومنطقة وعدد، بلا مشرف ولا أسماء.
  const { data: catalog } = useQuery({
    queryKey: ["support-catalog"],
    queryFn: () => getSupportCatalog(),
  });
  const groups = catalog?.catalog?.groups ?? [];

  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [ageBand, setAgeBand] = useState("");
  const [gender, setGender] = useState("");
  const [stage, setStage] = useState("");
  const [group, setGroup] = useState("");
  const [funding, setFunding] = useState<Funding>("any");
  const [building, setBuilding] = useState(false);
  const [sort, setSort] = useState<Sort>("waiting");
  const [page, setPage] = useState(0);

  const filters = {
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(country ? { country } : {}),
    ...(region ? { region } : {}),
    ...(ageBand ? { ageBand: ageBand as AgeBand } : {}),
    ...(gender ? { gender: gender as "male" | "female" } : {}),
    ...(stage ? { educationStage: stage } : {}),
    ...(group ? { group } : {}),
    ...(funding !== "any" ? { funding } : {}),
    ...(building ? { building: true } : {}),
    sort,
    limit: PAGE,
    offset: page * PAGE,
  };

  const pristine =
    !search.trim() &&
    !country &&
    !region &&
    !ageBand &&
    !gender &&
    !stage &&
    !group &&
    funding === "any" &&
    !building &&
    sort === "waiting" &&
    page === 0;

  const { data: result } = useQuery({
    queryKey: ["orphan-cards", filters],
    queryFn: () => listOrphanCards({ data: filters }),
    enabled: !pristine,
    placeholderData: (prev) => prev,
  });

  const shown = pristine ? first : (result ?? first);
  const rows = shown.rows;
  const total = shown.total;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  function reset() {
    setSearch("");
    setCountry("");
    setRegion("");
    setAgeBand("");
    setGender("");
    setStage("");
    setGroup("");
    setFunding("any");
    setBuilding(false);
    setSort("waiting");
    setPage(0);
  }

  /** كل تغييرٍ في الفلترة يعيدنا إلى الصفحة الأولى، وإلا ظهرت صفحةٌ فارغة. */
  function onFilter<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(0);
    };
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-3xl font-extrabold">دليل الأيتام</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
          جميع الملفات المعروضة معتمدة من الإدارة بعد توثيقها من جهة رعاية مرخّصة.
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
              <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => onFilter(setSearch)(e.target.value)}
                placeholder="ابحث بالاسم المستعار أو رقم الملف"
                aria-label="بحث"
                className="pe-9"
              />
            </div>

            <select
              value={sort}
              onChange={(e) => onFilter(setSort)(e.target.value as Sort)}
              aria-label="ترتيب النتائج"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
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
                  onClick={() => onFilter(setFunding)(key)}
                  className={cn(
                    "rounded px-3 py-1 text-xs font-medium transition-colors",
                    funding === key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
            <Picker
              id="f-country"
              label="البلد"
              value={country}
              onChange={onFilter(setCountry)}
              all="كل البلدان"
              options={options?.countries ?? []}
            />
            <Picker
              id="f-region"
              label="المنطقة"
              value={region}
              onChange={onFilter(setRegion)}
              all="كل المناطق"
              options={options?.regions ?? []}
            />
            <div>
              <Label htmlFor="f-age" className="text-xs">
                الفئة العمرية
              </Label>
              <select
                id="f-age"
                value={ageBand}
                onChange={(e) => onFilter(setAgeBand)(e.target.value)}
                className="mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
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
                value={gender}
                onChange={(e) => onFilter(setGender)(e.target.value)}
                className="mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">الجميع</option>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </div>
            <Picker
              id="f-stage"
              label="المرحلة الدراسية"
              value={stage}
              onChange={onFilter(setStage)}
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
                  value={group}
                  onChange={(e) => onFilter(setGroup)(e.target.value)}
                  className="mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
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
            <label className="flex items-center gap-2 pb-2 text-xs">
              <input
                type="checkbox"
                checked={building}
                onChange={(e) => onFilter(setBuilding)(e.target.checked)}
                className="size-4"
              />
              برنامج بناء أهلية قائم
            </label>
            {!pristine && (
              <Button type="button" size="sm" variant="ghost" onClick={reset}>
                مسح الفلترة
              </Button>
            )}
          </div>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">{countLabel(total)}</p>

        {rows.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            لا توجد نتائج مطابقة لبحثك.
          </p>
        ) : (
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((orphan) => (
              <OrphanCard key={orphan.id} orphan={orphan} />
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
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              السابق
            </Button>
            <span aria-live="polite" className="text-muted-foreground text-xs">
              صفحة {page + 1} من {pages}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
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
        className="mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
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
