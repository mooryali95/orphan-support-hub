import { KahataynMark } from "@/components/brand/KahataynMark";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FollowedStrip } from "@/components/support/Follow";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useDemo } from "@/lib/demo-mode";
import { trialSlots } from "@/lib/trial-slots";
import { TRIAL_ENABLED, trialRoute } from "@/lib/trial-gate";
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
import { brandFor, pageTitle } from "@/config/brand";
import { copyOf, defineCopy, pluralOf, useCopy, useLocale } from "@/lib/locale";
import { LoadFailed } from "@/components/kit/LoadFailed";
import { DEMO_MODE, demoChildren } from "@/lib/demo-network";
import { DemoNotice } from "@/components/DemoNotice";
import { DemoChildCard } from "@/components/DemoChildCard";

const optionsQuery = queryOptions({
  queryKey: ["orphan-filter-options"],
  queryFn: () => getFilterOptions(),
});

const firstPageQuery = queryOptions({
  queryKey: ["orphan-cards", "default"],
  queryFn: () => listOrphanCards({ data: {} }),
});

export const Route = createFileRoute("/orphans/")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const title = pageTitle(copyOf(COPY, l).title, true, l);
    const description = brandFor(l).description;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
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
    if (so === "closest" || so === "newest" || so === "documented") out.sort = so;
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
  sort?: "closest" | "newest" | "documented";
  building?: boolean;
  page?: number;
};
type Sort = "waiting" | "closest" | "newest" | "documented";

const SORTS: Sort[] = ["waiting", "closest", "newest", "documented"];

const COPY = defineCopy("routes/orphans.index", {
  ar: {
    title: "دليل الأيتام",
    sorts: {
      waiting: "الأطول انتظاراً",
      closest: "الأقرب للاكتمال",
      newest: "الأحدث",
      documented: "الأكثر توثيقاً",
    } as Record<Sort, string>,
    ages: AGE_BAND_LABELS as Record<string, string>,
    female: "أنثى",
    male: "ذكر",
    open: "بحاجة لكافل",
    full: "مكفول",
    any: "الكل",
    building: "برنامج بناء أهلية",
    buildingOn: "برنامج بناء أهلية قائم",
    lead: "كلّ ملفٍّ هنا اعتمدته إدارة المنصّة بعد أن وثّقه مكتبٌ للندوة أو شريكٌ ميداني لها",
    inCountries: (n: number) => ` — في ${arCount(n, COUNTRIES)}.`,
    cardH: "ما يُعرض هنا بطاقةٌ لا ملفّ:",
    cardP:
      "اسمٌ مستعار، وبلدٌ ومنطقة، وفئةٌ عمرية، وحال التمويل. أمّا قصّة الطفل وصورته ومدينته فخلف إذنٍ من الإدارة يُطلَب من صفحته، لأنّ ملفّ طفلٍ ليس صفحةً تُتصفَّح.",
    search: "ابحث بالاسم المستعار أو رقم الملفّ",
    searchLabel: "بحث",
    allCountries: "كل البلدان",
    pickCountry: "اختر دولة",
    sortLabel: "ترتيب النتائج",
    fundingLabel: "تصفية حسب حالة الكفالة",
    more: "فلترة أدقّ",
    region: "المنطقة",
    allRegions: "كل المناطق",
    age: "الفئة العمرية",
    allAges: "كل الأعمار",
    gender: "الجنس",
    everyone: "الجميع",
    stage: "المرحلة الدراسية",
    allStages: "كل المراحل",
    group: "المجموعة",
    allGroups: "كل المجموعات",
    active: "الفلاتر النشطة",
    remove: (l: string) => `إزالة: ${l}`,
    clearAll: "مسح الكل",
    files: (n: number) => arCount(n, FILES),
    empty: "لا توجد نتائج مطابقة.",
    launchTitle: "دليل الأيتام قيد الإطلاق",
    launchText:
      "أول الملفات تُنشر بعد أن يوثّقها مكتبٌ للندوة أو شريكٌ ميداني لها وتعتمدها الإدارة. إلى ذلك الحين جرّب الرحلة كاملة، أو ادعم مكاناً بعينه الآن.",
    launchTextLive:
      "أول الملفات تُنشر بعد أن يوثّقها مكتبٌ للندوة أو شريكٌ ميداني لها وتعتمدها الإدارة. إلى ذلك الحين ادعم مكاناً بعينه الآن.",
    launchTry: "جرّب الرحلة كاملة",
    launchSupport: "ادعم مكاناً",
    tryA: "جرّب إزالة أحد الفلاتر أعلاه، أو",
    restart: "ابدأ من جديد",
    emptyGo: "أو اذهب إلى «ادعم» حيث نقترح لك أطفالاً ينتظرون، أو ادعم مكاناً بعينه.",
    emptyCta: "اقترح عليّ طفلاً",
    pagesLabel: "صفحات الدليل",
    prev: "السابق",
    next: "التالي",
    pageOf: (p: number, n: number) => `صفحة ${p} من ${n}`,
  },
  en: {
    title: "Children",
    sorts: {
      waiting: "Waiting longest",
      closest: "Closest to fully sponsored",
      newest: "Newest",
      documented: "Most documented",
    } as Record<Sort, string>,
    ages: {
      under_6: "Under 6",
      age_6_11: "6–11",
      age_12_14: "12–14",
      age_15_17: "15–17",
      age_18_plus: "18+",
      unknown: "Unknown",
    } as Record<string, string>,
    female: "Girl",
    male: "Boy",
    open: "Needs a sponsor",
    full: "Sponsored",
    any: "All",
    building: "Qualification program",
    buildingOn: "Qualification program under way",
    lead: "Every file shown here was approved by the administration after being documented by a WAMY office or field partner",
    inCountries: pluralOf({ one: " — in {0} country.", other: " — in {0} countries." }),
    cardH: "What you see here is a card, not a file:",
    cardP:
      "a pseudonym, country and region, age group and funding status. The child's story, photo and city sit behind permission from the administration, requested from their page; because a child's file isn't a page to browse.",
    search: "Search by pseudonym or file number",
    searchLabel: "Search",
    allCountries: "All countries",
    pickCountry: "Choose a country",
    sortLabel: "Sort results",
    fundingLabel: "Filter by sponsorship status",
    more: "More filters",
    region: "Region",
    allRegions: "All regions",
    age: "Age group",
    allAges: "All ages",
    gender: "Gender",
    everyone: "Everyone",
    stage: "School stage",
    allStages: "All stages",
    group: "Group",
    allGroups: "All groups",
    active: "Active filters",
    remove: (l: string) => `Remove: ${l}`,
    clearAll: "Clear all",
    files: pluralOf({ one: "{0} file", other: "{0} files" }),
    empty: "No matching results.",
    launchTitle: "The children's directory is launching soon",
    launchText:
      "The first files are published once a WAMY office or field partner documents them and the administration approves them. Until then, try the full journey or support a place now.",
    launchTextLive:
      "The first files are published once a WAMY office or field partner documents them and the administration approves them. Until then, you can support a place now.",
    launchTry: "Try the full journey",
    launchSupport: "Support a place",
    tryA: "Try removing one of the filters above, or",
    restart: "start over",
    emptyGo: "Or go to «Support», where we suggest children who are waiting, or support a place.",
    emptyCta: "Suggest for me",
    pagesLabel: "Directory pages",
    prev: "Previous",
    next: "Next",
    pageOf: (p: number, n: number) => `Page ${p} of ${n}`,
  },
});

const AGE_BANDS: AgeBand[] = ["under_6", "age_6_11", "age_12_14", "age_15_17", "age_18_plus"];

const PAGE = 24;

/**
 * الدليل — بطاقاتٌ لا ملفّات.
 *
 * والفلترة **في القاعدة لا في المتصفّح**: فلترةٌ في العميل تعني أن
 * الصفحة حمّلت كل شيء ثم أخفت بعضه — وما حُمِّل وصل. وهي كذلك لا
 * تُرقّم: خمسون ملفاً تمرّ، وخمسة آلاف لا.
 */
// الوضع التجريبي: الدليل نفسه في مكانه، ومصدره كتالوج التجربة وبطاقاتها (كما في «جرّب»)، وكلّ
// بطاقةٍ تقود إلى صفحة طفل التجربة. لا قراءة من القاعدة في هذا الفرع ولا كتابة.
// يأتي من التجربة إن وُجدت (`@/lib/trial-slots`)؛ وبعد حذفها لا جلسة عرض، فالدليل الحقيقي.
const loadDemoDirectory = trialSlots?.loadDirectory;
const DemoDirectory = loadDemoDirectory ? lazy(loadDemoDirectory) : null;

function OrphansPage() {
  const demo = useDemo();
  if (!demo || !DemoDirectory) return <RealOrphansPage />;
  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 outline-none">
        <Suspense fallback={null}>
          <DemoDirectory />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}

function RealOrphansPage() {
  const locale = useLocale();
  const t = useCopy(COPY);
  const { data: first } = useSuspenseQuery(firstPageQuery);
  const { data: options } = useQuery(optionsQuery);
  // البلد والمنطقة من مصدر الجغرافيا الواحد — ما تُظهره الخريطة يجده الدليل.
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
  /* the server answered with an error (unreachable database, too many requests): not "no results" */
  const failed = !DEMO_MODE && Boolean(shown.error);
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  function retry() {
    setRetrying(true);
    void queryClient
      .invalidateQueries({ queryKey: ["orphan-cards"] })
      .finally(() => setRetrying(false));
  }
  const sample = demoChildren(filters);
  const total = DEMO_MODE ? sample.total : shown.total;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? id;
  const countryLabel = (v: string) => {
    const code = resolveCountry(v);
    return code ? countryName(code, locale) : v;
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
            label: t.ages[sp.age] ?? sp.age,
            clear: () => set({ age: undefined }),
          },
        ]
      : []),
    ...(sp.gender
      ? [
          {
            key: "gender",
            label: sp.gender === "female" ? t.female : t.male,
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
            label: funding === "open" ? t.open : t.full,
            clear: () => set({ funding: undefined }),
          },
        ]
      : []),
    ...(sp.building
      ? [{ key: "building", label: t.building, clear: () => set({ building: undefined }) }]
      : []),
  ];
  // بلا فلترٍ ولا ملفٍّ منشور: الدليل قبل إطلاقه، لا «لا نتائج مطابقة».
  const prelaunch = !DEMO_MODE && total === 0 && chips.length === 0;
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
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <h1 className="text-4xl leading-[1.3] font-bold md:text-5xl">{t.title}</h1>
        {DEMO_MODE && <DemoNotice />}
        <FollowedStrip className="mt-4" />
        <p className="mt-3 max-w-2xl text-base leading-8 text-muted-foreground">
          {DEMO_MODE
            ? locale === "ar"
              ? "بطاقاتٌ نموذجية للتجربة فقط"
              : "Fictional example cards only"
            : t.lead}
          {countries.length > 1 ? t.inCountries(countries.length) : "."}
        </p>

        {/* القاعدة تُشرَح قبل أن تُصادَف: من يفتح ملفّاً ويجده مقتضباً
            ينبغي أن يكون عرف السبب هنا. */}
        <p className="mt-4 flex max-w-2xl items-start gap-2 rounded-2xl bg-secondary/60 p-4 text-xs leading-6">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-shore-thrive" aria-hidden="true" />
          <span>
            <strong className="text-foreground">{t.cardH}</strong> {t.cardP}
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
                placeholder={t.search}
                aria-label={t.searchLabel}
                className="pe-9 text-base md:text-sm"
              />
            </div>

            {/* الدولة في الواجهة لا في اللوحة: أوّل ما يسأل عنه الكافل. */}
            <div className="w-full sm:w-56">
              <CountryPicker
                value={sp.country ?? ""}
                onChange={(v) => set({ country: v || undefined, region: undefined })}
                values={countries}
                lang={locale}
                allLabel={t.allCountries}
                placeholder={t.pickCountry}
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
                      : (e.target.value as "closest" | "newest" | "documented"),
                })
              }
              aria-label={t.sortLabel}
              className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-base sm:flex-none md:text-sm"
            >
              {SORTS.map((key) => (
                <option key={key} value={key}>
                  {t.sorts[key]}
                </option>
              ))}
            </select>

            <div
              role="group"
              aria-label={t.fundingLabel}
              className="flex w-full rounded-lg border border-input p-1 sm:w-auto"
            >
              {(
                [
                  ["any", t.any],
                  ["open", t.open],
                  ["full", t.full],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={funding === key}
                  onClick={() => set({ funding: key === "any" ? undefined : key })}
                  className={cn(
                    "min-h-10 flex-1 rounded-md px-3 max-sm:min-h-11 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring sm:flex-none",
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
              {t.more}
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
              label={t.region}
              value={sp.region ?? ""}
              onChange={(v) => set({ region: v || undefined })}
              all={t.allRegions}
              options={[...new Set(regions)]}
            />
            <div>
              <Label htmlFor="f-age" className="text-xs">
                {t.age}
              </Label>
              <select
                id="f-age"
                value={sp.age ?? ""}
                onChange={(e) => set({ age: e.target.value || undefined })}
                className="mt-1 h-11 rounded-md border border-input bg-background px-3 text-base md:text-sm"
              >
                <option value="">{t.allAges}</option>
                {AGE_BANDS.map((b) => (
                  <option key={b} value={b}>
                    {t.ages[b]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="f-gender" className="text-xs">
                {t.gender}
              </Label>
              <select
                id="f-gender"
                value={sp.gender ?? ""}
                onChange={(e) => set({ gender: e.target.value || undefined })}
                className="mt-1 h-11 rounded-md border border-input bg-background px-3 text-base md:text-sm"
              >
                <option value="">{t.everyone}</option>
                <option value="male">{t.male}</option>
                <option value="female">{t.female}</option>
              </select>
            </div>
            <Picker
              id="f-stage"
              label={t.stage}
              value={sp.stage ?? ""}
              onChange={(v) => set({ stage: v || undefined })}
              all={t.allStages}
              options={options?.stages ?? []}
            />
            {groups.length > 0 && (
              <div>
                <Label htmlFor="f-group" className="text-xs">
                  {t.group}
                </Label>
                <select
                  id="f-group"
                  value={sp.group ?? ""}
                  onChange={(e) => set({ group: e.target.value || undefined })}
                  className="mt-1 h-11 rounded-md border border-input bg-background px-3 text-base md:text-sm"
                >
                  <option value="">{t.allGroups}</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {g.region ? ` — ${g.region}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!sp.building}
                onChange={(e) => set({ building: e.target.checked || undefined })}
                className="size-4"
              />
              {t.buildingOn}
            </label>
          </div>

          {chips.length > 0 && (
            <ul className="flex flex-wrap items-center gap-2" aria-label={t.active}>
              {chips.map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={c.clear}
                    className="inline-flex min-h-9 items-center gap-1 rounded-full bg-secondary px-3 text-sm pointer-coarse:min-h-11 max-sm:min-h-11 transition-[background-color,transform] duration-150 hover:bg-secondary/70 active:scale-[0.97]"
                    aria-label={t.remove(c.label)}
                  >
                    <bdi>{c.label}</bdi>
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
              <li>
                <Button type="button" size="sm" variant="ghost" onClick={reset}>
                  {t.clearAll}
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
          {failed || prelaunch ? "" : t.files(total)}
        </p>

        {failed ? (
          // تعذّر الجلب ليس «لا نتائج»: يُقال كما هو، ومعه إعادة المحاولة.
          <LoadFailed className="mt-10" busy={isFetching || retrying} onRetry={retry} />
        ) : (DEMO_MODE ? sample.rows.length : rows.length) === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center text-sm text-muted-foreground">
            <KahataynMark
              compact
              tone="current"
              className="mx-auto h-10 w-auto text-muted-foreground/30"
            />
            <p className="mt-4 text-base font-medium text-foreground">
              {prelaunch ? t.launchTitle : t.empty}
            </p>
            {prelaunch && (
              <p className="mx-auto mt-2 max-w-md leading-7">
                {TRIAL_ENABLED ? t.launchText : t.launchTextLive}
              </p>
            )}
            {chips.length > 0 && (
              <p className="mt-3">
                {t.tryA}{" "}
                <button
                  type="button"
                  onClick={reset}
                  className="font-medium text-primary underline underline-offset-4"
                >
                  {t.restart}
                </button>
                .
              </p>
            )}
            {prelaunch ? (
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {TRIAL_ENABLED && (
                  <Link
                    to={trialRoute("/try")}
                    className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
                  >
                    {t.launchTry}
                  </Link>
                )}
                <Link
                  to="/support"
                  className="inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-5 text-sm font-bold text-foreground"
                >
                  {t.launchSupport}
                </Link>
              </div>
            ) : (
              <>
                <p className="mx-auto mt-4 max-w-md leading-7">{t.emptyGo}</p>
                <Link
                  to="/support"
                  className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
                >
                  {t.emptyCta}
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {DEMO_MODE
              ? sample.rows.map((child, i) => (
                  // the same CSS stagger as the real cards below (no animation library)
                  <div key={child.id} className="stagger-in" style={{ ["--i" as string]: i }}>
                    <DemoChildCard child={child} />
                  </div>
                ))
              : rows.map((orphan, i) => (
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
            aria-label={t.pagesLabel}
            className="mt-8 flex items-center justify-center gap-3 text-sm"
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="max-sm:min-h-11 max-sm:px-4"
              disabled={page === 0}
              onClick={() => set({ page: page - 1 || undefined }, true)}
            >
              {t.prev}
            </Button>
            <span aria-live="polite" className="text-muted-foreground text-xs tabular-nums">
              {t.pageOf(page + 1, pages)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="max-sm:min-h-11 max-sm:px-4"
              disabled={page + 1 >= pages}
              onClick={() => set({ page: page + 1 }, true)}
            >
              {t.next}
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
        className="mt-1 h-11 rounded-md border border-input bg-background px-3 text-base md:text-sm"
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
