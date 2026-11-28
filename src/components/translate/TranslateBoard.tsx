/**
 * مراجعة الترجمة: الشاشة المشتركة بين الصفحة الحقيقية (`/translate/$locale`) ونسختها التجريبية.
 *
 * كل سطر: الأصل العربي، والإنجليزي الذي تُرجم منه، والترجمة قابلةً للتصحيح. الحفظ يكتب
 * مسودّة، ويراجعها شخصٌ آخر، والنشر للإدارة وحدها بجلسة aal2. العينان في القاعدة
 * (`20261205100000_ui_i18n_four_eyes`)، والشاشة تعكسها فلا تعرض زرّاً سيُرفض.
 * البيانات عبر منفذ البيانات (`useDataFn`)، فتعمل الشاشة نفسها في التجربة بلا خادم.
 */
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { Check, Eye, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/kit/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { defineCopy, dirOf, LOCALE_COOKIE, nativeName, useCopy } from "@/lib/locale";
import {
  getLocaleWork,
  publishTranslations,
  reviewTranslations,
  saveTranslations,
  type WorkRow,
} from "@/lib/ui-i18n-admin.functions";
import { cn } from "@/lib/utils";

type Filter = "todo" | "missing" | "draft" | "reviewed" | "published" | "stale" | "all";
const FILTER_KEYS: Filter[] = ["todo", "draft", "stale", "missing", "reviewed", "published", "all"];
const PAGE = 50;

export const TRANSLATE_COPY = defineCopy("routes/translate", {
  ar: {
    pageTitle: "مراجعة الترجمة",
    title: (name: string) => `مراجعة الترجمة: ${name}`,
    description: "صحّح، وراجِع، ثم تنشر الإدارة.",
    backAdmin: "اللوحة",
    backWorkspaces: "بواباتي",
    preview: "عاين الموقع بهذه اللغة",
    loading: "جارٍ تحميل النصوص",
    failed: "تعذّر فتح المراجعة",
    filterGroup: "تصفية",
    filters: {
      todo: "يحتاج عملاً",
      draft: "مسودّة",
      stale: "تغيّر أصله",
      missing: "ناقص",
      reviewed: "مراجَع",
      published: "منشور",
      all: "الكل",
    },
    missingTitle: "الناقص في كل صفحة",
    missingNone: "لا نصّ ناقص في هذه اللغة.",
    missingCount: (k: number) => `${k} ناقص`,
    fourEyes:
      "عينان قبل النشر: لا تراجع نصّاً حرّرته، ولا ينشر المدير نصّاً حرّره. الإدارة غير مستثناة.",
    mine: "حرّرته أنت: يراجعه غيرك",
    save: "احفظ مسودّة",
    savedDraft: "حُفظ مسودّة، ويراجعه شخصٌ آخر",
    noDraftsPicked: "لا مسودّات حرّرها غيرك في المحدّد.",
    noReviewedPicked: "لا مراجَع حرّره غيرك في المحدّد.",
    reviewed: (n: number) => `رُوجع ${n} نصّاً`,
    published: (n: number) => `نُشر ${n} نصّاً`,
    search: "ابحث في الأصل أو الترجمة أو المفتاح",
    searchLabel: "بحث",
    nsLabel: "الصفحة أو المكوّن",
    allNs: "كل الصفحات",
    pickPage: (n: number) => `حدّد الصفحة (${n} محدّد)`,
    reviewPicked: "راجِع المحدّد",
    publishPicked: "انشر المحدّد",
    stepUp: "النشر يحتاج التحقّق بخطوتين في هذه الجلسة.",
    stepUpLink: "تحقّق من لوحة الإدارة",
    count: (n: number) => `${n} نصّاً`,
    nothing: "لا شيء هنا.",
    pages: "الصفحات",
    prev: "السابق",
    next: "التالي",
    placeholders: "المواضع {0} {1} يجب أن تبقى كما في الأصل.",
    pick: (k: string) => `حدّد ${k}`,
    noArabic: "بلا أصل عربي",
    translation: (k: string) => `الترجمة: ${k}`,
    status: { missing: "ناقص", draft: "مسودّة", reviewed: "مراجَع", published: "منشور" },
    staleChip: "تغيّر الأصل",
    machine: "آلية",
  },
  en: {
    pageTitle: "Translation review",
    title: (name: string) => `Translation review: ${name}`,
    description: "Correct, review, then the admin team publishes.",
    backAdmin: "Dashboard",
    backWorkspaces: "My workspaces",
    preview: "Preview the site in this language",
    loading: "Loading strings",
    failed: "The review could not be opened",
    filterGroup: "Filter",
    filters: {
      todo: "Needs work",
      draft: "Draft",
      stale: "Source changed",
      missing: "Missing",
      reviewed: "Reviewed",
      published: "Published",
      all: "All",
    },
    missingTitle: "Missing per page",
    missingNone: "No string is missing in this language.",
    missingCount: (k: number) => `${k} missing`,
    fourEyes:
      "Two people before publishing: you do not review a string you edited, and an admin does not publish a string they edited. Admins are not exempt.",
    mine: "You edited this, so someone else reviews it",
    save: "Save draft",
    savedDraft: "Saved as a draft for someone else to review",
    noDraftsPicked: "No drafts edited by someone else are selected.",
    noReviewedPicked: "No reviewed strings edited by someone else are selected.",
    reviewed: (n: number) => `${n} strings reviewed`,
    published: (n: number) => `${n} strings published`,
    search: "Search the source, the translation or the key",
    searchLabel: "Search",
    nsLabel: "Page or component",
    allNs: "All pages",
    pickPage: (n: number) => `Select this page (${n} selected)`,
    reviewPicked: "Review selected",
    publishPicked: "Publish selected",
    stepUp: "Publishing needs two-step verification in this session.",
    stepUpLink: "Verify from the admin dashboard",
    count: (n: number) => `${n} strings`,
    nothing: "Nothing here.",
    pages: "Pages",
    prev: "Previous",
    next: "Next",
    placeholders: "Placeholders {0} {1} must stay as in the source.",
    pick: (k: string) => `Select ${k}`,
    noArabic: "No Arabic source",
    translation: (k: string) => `Translation: ${k}`,
    status: { missing: "Missing", draft: "Draft", reviewed: "Reviewed", published: "Published" },
    staleChip: "Source changed",
    machine: "Machine",
  },
});

const STATUS_CLS: Record<WorkRow["status"], string> = {
  missing: "border border-dashed border-border text-muted-foreground",
  draft: "bg-accent text-accent-foreground",
  reviewed: "bg-primary/15 text-primary",
  published: "bg-primary text-primary-foreground",
};

/** عدد الناقص لكل مساحة اسم، مرتّباً من الأكثر؛ النقر يصفّي الناقص فيها. */
function MissingByNamespace({
  missingByNs,
  active,
  onPick,
}: {
  missingByNs: Map<string, number>;
  active: string;
  onPick: (ns: string) => void;
}) {
  const c = useCopy(TRANSLATE_COPY);
  const list = [...missingByNs.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return (
    <section aria-labelledby="missing-by-ns" className="mt-3">
      <h2 id="missing-by-ns" className="text-sm font-semibold">
        {c.missingTitle}
      </h2>
      {list.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">{c.missingNone}</p>
      ) : (
        <ul className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
          {list.map(([n, k]) => (
            <li key={n}>
              <button
                type="button"
                aria-pressed={active === n}
                onClick={() => onPick(n)}
                className={cn(
                  "min-h-11 rounded-full px-3 text-xs tabular-nums",
                  active === n ? "bg-primary text-primary-foreground" : "bg-secondary",
                )}
              >
                <bdi dir="ltr">{n}</bdi> {c.missingCount(k)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export type TranslateBoardProps = {
  locale: string;
  isAdmin: boolean;
  /** المدير بجلسة aal1 وله عاملٌ ثانٍ: النشر معطّلٌ بسببٍ مقروء. */
  needsStepUp: boolean;
  /** يلفّ الشاشة: لوحة المنصّة في الحقيقي، ورأس الدور في التجربة. */
  shell: (p: { title: string; description: string; children: ReactNode }) => ReactNode;
  /** رابط الرجوع ورابط التحقّق: صفحاتٌ حقيقية أو نظائرها في التجربة. */
  links: { admin: string; workspaces: string };
  /** المعاينة تضع كعكة اللغة وتفتح الموقع؛ في التجربة تُخفى (لا مسودّات تُجلب). */
  canPreview?: boolean;
};

export function TranslateBoard({
  locale,
  isAdmin,
  needsStepUp,
  shell,
  links,
  canPreview = true,
}: TranslateBoardProps) {
  const c = useCopy(TRANSLATE_COPY);
  const qc = useQueryClient();
  const fetchWork = useDataFn("translate.work", getLocaleWork);
  const review = useDataFn("translate.review", reviewTranslations);
  const publish = useDataFn("translate.publish", publishTranslations);
  const workKey = useDataKey(["locale-work", locale]);
  const { data, isPending } = useQuery({
    queryKey: workKey,
    queryFn: () => fetchWork({ data: { locale } }),
  });
  const [filter, setFilter] = useState<Filter>("todo");
  const [ns, setNs] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const rows: WorkRow[] = data?.ok ? data.data.rows : [];
  const namespaces = useMemo(() => [...new Set(rows.map((r) => r.ns))].sort(), [rows]);
  const missingByNs = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.status === "missing") m.set(r.ns, (m.get(r.ns) ?? 0) + 1);
    return m;
  }, [rows]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      const f =
        filter === "all" ||
        (filter === "todo" && (r.status === "missing" || r.status === "draft" || r.stale)) ||
        (filter === "stale" && r.stale) ||
        (filter !== "todo" && filter !== "stale" && r.status === filter && !r.stale);
      return (
        f &&
        (!ns || r.ns === ns) &&
        (!needle || [r.key, r.ar, r.en, r.text ?? ""].some((s) => s.toLowerCase().includes(needle)))
      );
    });
  }, [rows, filter, ns, q]);
  const pageRows = shown.slice(page * PAGE, page * PAGE + PAGE);
  const counts = useMemo(() => {
    // أعداد المرشّحات بنطاق الصفحة المختارة: «ناقص» يقول كم بقي فيها هي، لا في الموقع كلّه.
    const k = { missing: 0, draft: 0, reviewed: 0, published: 0, stale: 0 };
    for (const r of rows) {
      if (ns && r.ns !== ns) continue;
      k[r.status]++;
      if (r.stale) k.stale++;
    }
    return k;
  }, [rows, ns]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: workKey });
    void qc.invalidateQueries({ queryKey: ["review-locales"] });
  };

  async function bulk(kind: "review" | "publish") {
    const keys = [...picked].filter((k) => {
      const r = rows.find((x) => x.key === k);
      // العينان: ما حرّره القارئ لا يراجعه ولا ينشره، والإدارة غير مستثناة.
      return (
        r &&
        !r.stale &&
        !r.mine &&
        (kind === "review" ? r.status === "draft" : r.status === "reviewed")
      );
    });
    if (keys.length === 0)
      return void toast.info(kind === "review" ? c.noDraftsPicked : c.noReviewedPicked);
    setBusy(true);
    const r = await (kind === "review" ? review : publish)({ data: { locale, keys } });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(kind === "review" ? c.reviewed(r.data) : c.published(r.data));
    setPicked(new Set());
    refresh();
  }

  function preview() {
    // المعاينة للمراجع وحده: كعكة اللغة، وعلامة المعاينة يقرؤها المتصفّح فيجلب المسودّات.
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.cookie = `kh_preview=${locale}; Path=/; Max-Age=86400; SameSite=Lax`;
    window.open("/", "_blank", "noopener");
  }

  return shell({
    title: c.title(nativeName(locale)),
    description: c.description,
    children: (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Link
            to={(isAdmin ? links.admin : links.workspaces) as "/"}
            className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4"
          >
            {isAdmin ? c.backAdmin : c.backWorkspaces}
          </Link>
          <span className="ms-auto" />
          {canPreview && (
            <Button className="min-h-11" variant="outline" onClick={preview}>
              <Eye aria-hidden="true" /> {c.preview}
            </Button>
          )}
        </div>

        {isPending ? (
          <p role="status" className="mt-10 flex justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">{c.loading}</span>
          </p>
        ) : !data?.ok ? (
          <EmptyState className="mt-6" title={c.failed} text={data?.error ?? ""} />
        ) : (
          <>
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label={c.filterGroup}
            >
              {FILTER_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  onClick={() => {
                    setFilter(key);
                    setPage(0);
                  }}
                  className={cn(
                    "min-h-11 rounded-full px-4 text-xs font-medium transition-colors",
                    filter === key
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary hover:bg-secondary/70",
                  )}
                >
                  {c.filters[key]}
                  {key in counts && (
                    <span className="ms-1 tabular-nums opacity-75">
                      {counts[key as keyof typeof counts]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <MissingByNamespace
              missingByNs={missingByNs}
              active={ns}
              onPick={(n) => {
                setNs(n);
                setFilter("missing");
                setPage(0);
              }}
            />

            <p className="mt-3 text-xs text-muted-foreground">{c.fourEyes}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-56 flex-1">
                <Search
                  className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(0);
                  }}
                  placeholder={c.search}
                  aria-label={c.searchLabel}
                  className="pe-9"
                />
              </div>
              <select
                value={ns}
                onChange={(e) => {
                  setNs(e.target.value);
                  setPage(0);
                }}
                aria-label={c.nsLabel}
                className="h-11 max-w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{c.allNs}</option>
                {namespaces.map((n) => (
                  <option key={n} value={n}>
                    {missingByNs.get(n) ? `${n} (${c.missingCount(missingByNs.get(n)!)})` : n}
                  </option>
                ))}
              </select>
            </div>

            <div className="sticky top-0 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-background/90 py-2 backdrop-blur">
              <label className="flex min-h-11 items-center gap-2 px-1 text-xs">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={pageRows.length > 0 && pageRows.every((r) => picked.has(r.key))}
                  onChange={(e) =>
                    setPicked((p) => {
                      const n = new Set(p);
                      for (const r of pageRows) {
                        if (e.target.checked) n.add(r.key);
                        else n.delete(r.key);
                      }
                      return n;
                    })
                  }
                />
                {c.pickPage(picked.size)}
              </label>
              <Button
                className="min-h-11"
                variant="outline"
                disabled={busy || picked.size === 0}
                onClick={() => bulk("review")}
              >
                <Check aria-hidden="true" /> {c.reviewPicked}
              </Button>
              {isAdmin && (
                <>
                  <Button
                    className="min-h-11"
                    disabled={busy || (picked.size === 0 && !needsStepUp)}
                    aria-disabled={needsStepUp || undefined}
                    aria-describedby={needsStepUp ? "publish-step-up" : undefined}
                    onClick={() => !needsStepUp && bulk("publish")}
                  >
                    {c.publishPicked}
                  </Button>
                  {needsStepUp && (
                    <p id="publish-step-up" className="text-xs text-muted-foreground">
                      {c.stepUp}{" "}
                      <Link to={links.admin as "/"} className="underline underline-offset-4">
                        {c.stepUpLink}
                      </Link>
                    </p>
                  )}
                </>
              )}
              <span className="ms-auto text-xs text-muted-foreground tabular-nums">
                {c.count(shown.length)}
              </span>
            </div>

            {pageRows.length === 0 ? (
              <p className="mt-10 text-center text-sm text-muted-foreground">{c.nothing}</p>
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card">
                {pageRows.map((r) => (
                  <ReviewRow
                    key={r.key}
                    row={r}
                    locale={locale}
                    picked={picked.has(r.key)}
                    onPick={(on) =>
                      setPicked((p) => {
                        const n = new Set(p);
                        if (on) n.add(r.key);
                        else n.delete(r.key);
                        return n;
                      })
                    }
                    onSaved={refresh}
                  />
                ))}
              </ul>
            )}

            {shown.length > PAGE && (
              <nav
                className="mt-4 flex items-center justify-center gap-3 text-sm"
                aria-label={c.pages}
              >
                <Button
                  className="min-h-11"
                  variant="outline"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  {c.prev}
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {page + 1} / {Math.ceil(shown.length / PAGE)}
                </span>
                <Button
                  className="min-h-11"
                  variant="outline"
                  disabled={(page + 1) * PAGE >= shown.length}
                  onClick={() => setPage(page + 1)}
                >
                  {c.next}
                </Button>
              </nav>
            )}
          </>
        )}
      </>
    ),
  });
}

function ReviewRow({
  row,
  locale,
  picked,
  onPick,
  onSaved,
}: {
  row: WorkRow;
  locale: string;
  picked: boolean;
  onPick: (on: boolean) => void;
  onSaved: () => void;
}) {
  const save = useDataFn("translate.save", saveTranslations);
  const [text, setText] = useState(row.text ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = text.trim() !== (row.text ?? "");
  const c = useCopy(TRANSLATE_COPY);

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    const r = await save({ data: { locale, items: [{ key: row.key, text: text.trim() }] } });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    if (r.data.rejected.length) return void toast.error(c.placeholders);
    toast.success(c.savedDraft);
    onSaved();
  }

  return (
    <li className="grid gap-3 p-4 md:grid-cols-[auto_1fr_1fr_1.2fr]">
      <input
        type="checkbox"
        className="mt-1 size-5"
        checked={picked}
        onChange={(e) => onPick(e.target.checked)}
        aria-label={c.pick(row.key)}
      />
      <div className="min-w-0">
        <p className="text-sm leading-7" dir="rtl" lang="ar">
          {row.ar || <span className="text-muted-foreground">{c.noArabic}</span>}
        </p>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground" dir="ltr">
          {row.key}
        </p>
      </div>
      <p className="text-sm leading-7 text-muted-foreground" dir="ltr" lang="en">
        {row.en}
      </p>
      <div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          dir={dirOf(locale)}
          lang={locale}
          rows={Math.min(6, Math.max(2, Math.ceil(row.en.length / 60)))}
          aria-label={c.translation(row.key)}
          className="text-sm"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLS[row.status])}
          >
            {c.status[row.status]}
          </span>
          {row.stale && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
              {c.staleChip}
            </span>
          )}
          {row.origin === "machine" && (
            <span className="text-xs text-muted-foreground">{c.machine}</span>
          )}
          {row.mine && row.status !== "published" && (
            <span className="text-xs text-muted-foreground">{c.mine}</span>
          )}
          <span className="ms-auto" />
          <Button
            className="min-h-11"
            variant="ghost"
            disabled={busy || !dirty}
            onClick={() => submit()}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {c.save}
          </Button>
        </div>
      </div>
    </li>
  );
}
