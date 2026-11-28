import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Check, Eye, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { DashboardShell } from "@/components/DashboardShell";
import { EmptyState } from "@/components/kit/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { pageTitle } from "@/config/brand";
import { dirOf, LOCALE_COOKIE, nativeName } from "@/lib/locale";
import {
  getLocaleWork,
  publishTranslations,
  reviewTranslations,
  saveTranslations,
  type WorkRow,
} from "@/lib/ui-i18n-admin.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/translate/$locale")({
  head: () => ({
    meta: [{ title: pageTitle("مراجعة الترجمة", false) }, { name: "robots", content: "noindex" }],
  }),
  component: ReviewPage,
});

type Filter = "todo" | "missing" | "draft" | "reviewed" | "published" | "stale" | "all";
const FILTERS: Array<[Filter, string]> = [
  ["todo", "يحتاج عملاً"],
  ["draft", "مسودّة"],
  ["stale", "تغيّر أصله"],
  ["missing", "ناقص"],
  ["reviewed", "مراجَع"],
  ["published", "منشور"],
  ["all", "الكل"],
];
const PAGE = 50;

const STATUS: Record<WorkRow["status"], [string, string]> = {
  missing: ["ناقص", "border border-dashed border-border text-muted-foreground"],
  draft: ["مسودّة", "bg-accent text-accent-foreground"],
  reviewed: ["مراجَع", "bg-primary/15 text-primary"],
  published: ["منشور", "bg-primary text-primary-foreground"],
};

/**
 * مراجعة الترجمة: لمراجع اللغة من مكتب الدولة، وللإدارة.
 *
 * كل سطر: الأصل العربي، والإنجليزي الذي تُرجم منه، والترجمة قابلةً
 * للتصحيح. «احفظ وراجِع» يكتب التصحيح مراجَعاً باسم المراجع. والنشر
 * للإدارة وحدها. و«عاين» يفتح الموقع بهذه اللغة قبل نشرها.
 */
function ReviewPage() {
  const { locale } = Route.useParams();
  const { roles } = Route.useRouteContext();
  const isAdmin = roles.includes("admin");
  const qc = useQueryClient();
  const fetchWork = useServerFn(getLocaleWork);
  const review = useServerFn(reviewTranslations);
  const publish = useServerFn(publishTranslations);
  const { data, isPending } = useQuery({
    queryKey: ["locale-work", locale],
    queryFn: () => fetchWork({ data: { locale } }),
  });
  const [filter, setFilter] = useState<Filter>("todo");
  const [ns, setNs] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const rows = data?.ok ? data.data.rows : [];
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
    const c = { missing: 0, draft: 0, reviewed: 0, published: 0, stale: 0 };
    for (const r of rows) {
      c[r.status]++;
      if (r.stale) c.stale++;
    }
    return c;
  }, [rows]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["locale-work", locale] });
    void qc.invalidateQueries({ queryKey: ["review-locales"] });
  };

  async function bulk(kind: "review" | "publish") {
    const keys = [...picked].filter((k) => {
      const r = rows.find((x) => x.key === k);
      return r && !r.stale && (kind === "review" ? r.status === "draft" : r.status === "reviewed");
    });
    if (keys.length === 0)
      return void toast.info(
        kind === "review" ? "لا مسودّات في المحدّد." : "لا مراجَع في المحدّد.",
      );
    setBusy(true);
    const r = await (kind === "review" ? review : publish)({ data: { locale, keys } });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(kind === "review" ? `رُوجع ${r.data} نصّاً` : `نُشر ${r.data} نصّاً`);
    setPicked(new Set());
    refresh();
  }

  function preview() {
    // المعاينة للمراجع وحده: كعكة اللغة، وعلامة المعاينة يقرؤها المتصفّح فيجلب المسودّات.
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.cookie = `kh_preview=${locale}; Path=/; Max-Age=86400; SameSite=Lax`;
    window.open("/", "_blank", "noopener");
  }

  const name = nativeName(locale);

  return (
    <DashboardShell title={`مراجعة الترجمة: ${name}`} description="صحّح، وراجِع، ثم تنشر الإدارة.">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link to="/admin" className="text-muted-foreground underline underline-offset-4">
          ← اللوحة
        </Link>
        <span className="ms-auto" />
        <Button size="sm" variant="outline" onClick={preview}>
          <Eye aria-hidden="true" /> عاين الموقع بهذه اللغة
        </Button>
      </div>

      {isPending ? (
        <Loader2 className="mx-auto mt-10 size-5 animate-spin text-muted-foreground" />
      ) : !data?.ok ? (
        <EmptyState className="mt-6" title="تعذّر فتح المراجعة" text={data?.error ?? ""} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="تصفية">
            {FILTERS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => {
                  setFilter(key);
                  setPage(0);
                }}
                className={cn(
                  "min-h-8 rounded-full px-3 text-xs font-medium transition-colors",
                  filter === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary hover:bg-secondary/70",
                )}
              >
                {label}
                {key in counts && (
                  <span className="ms-1 tabular-nums opacity-75">
                    {counts[key as keyof typeof counts]}
                  </span>
                )}
              </button>
            ))}
          </div>

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
                placeholder="ابحث في الأصل أو الترجمة أو المفتاح"
                aria-label="بحث"
                className="pe-9"
              />
            </div>
            <select
              value={ns}
              onChange={(e) => {
                setNs(e.target.value);
                setPage(0);
              }}
              aria-label="الصفحة أو المكوّن"
              className="h-11 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">كل الصفحات</option>
              {namespaces.map((n) => (
                <option key={n} value={n}>
                  {missingByNs.get(n) ? `${n} (${missingByNs.get(n)} ناقص)` : n}
                </option>
              ))}
            </select>
          </div>

          <div className="sticky top-0 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-background/90 py-2 backdrop-blur">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="size-4"
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
              حدّد الصفحة ({picked.size} محدّد)
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || picked.size === 0}
              onClick={() => bulk("review")}
            >
              <Check aria-hidden="true" /> راجِع المحدّد
            </Button>
            {isAdmin && (
              <Button
                size="sm"
                disabled={busy || picked.size === 0}
                onClick={() => bulk("publish")}
              >
                انشر المحدّد
              </Button>
            )}
            <span className="ms-auto text-xs text-muted-foreground tabular-nums">
              {shown.length} نصّاً
            </span>
          </div>

          {pageRows.length === 0 ? (
            <p className="mt-10 text-center text-sm text-muted-foreground">لا شيء هنا.</p>
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
              aria-label="الصفحات"
            >
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                السابق
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                {page + 1} / {Math.ceil(shown.length / PAGE)}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={(page + 1) * PAGE >= shown.length}
                onClick={() => setPage(page + 1)}
              >
                التالي
              </Button>
            </nav>
          )}
        </>
      )}
    </DashboardShell>
  );
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
  const save = useServerFn(saveTranslations);
  const [text, setText] = useState(row.text ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = text.trim() !== (row.text ?? "");
  const [label, cls] = STATUS[row.status];

  async function submit(reviewToo: boolean) {
    if (!text.trim()) return;
    setBusy(true);
    const r = await save({
      data: { locale, items: [{ key: row.key, text: text.trim() }], review: reviewToo },
    });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    if (r.data.rejected.length)
      return void toast.error("المواضع {0} {1} يجب أن تبقى كما في الأصل.");
    toast.success(reviewToo ? "حُفظ ورُوجع" : "حُفظ مسودّة");
    onSaved();
  }

  return (
    <li className="grid gap-3 p-4 md:grid-cols-[auto_1fr_1fr_1.2fr]">
      <input
        type="checkbox"
        className="mt-1 size-4"
        checked={picked}
        onChange={(e) => onPick(e.target.checked)}
        aria-label={`حدّد ${row.key}`}
      />
      <div className="min-w-0">
        <p className="text-sm leading-7" dir="rtl" lang="ar">
          {row.ar || "—"}
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
          aria-label={`الترجمة: ${row.key}`}
          className="text-sm"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", cls)}>{label}</span>
          {row.stale && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
              تغيّر الأصل
            </span>
          )}
          {row.origin === "machine" && <span className="text-xs text-muted-foreground">آلية</span>}
          <span className="ms-auto" />
          <Button size="sm" variant="ghost" disabled={busy || !dirty} onClick={() => submit(false)}>
            احفظ
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !text.trim() || (!dirty && row.status !== "draft" && !row.stale)}
            onClick={() => submit(true)}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            احفظ وراجِع
          </Button>
        </div>
      </div>
    </li>
  );
}
