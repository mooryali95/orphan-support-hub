import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Globe2, Languages, Loader2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/kit/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { countryName } from "@/lib/countries";
import { languagesOf } from "@/lib/country-languages";
import { getSourcesOverview, type SourcesOverview } from "@/lib/integrity.functions";
import { nativeName } from "@/lib/locale";
import {
  enableLocale,
  getLocaleReviewers,
  getMyReviewLocales,
  importBundledDraft,
  setLocaleReviewer,
  setLocaleStatus,
  type ReviewLocale,
} from "@/lib/ui-i18n-admin.functions";
import { cn } from "@/lib/utils";

const arName = (code: string) => {
  try {
    return new Intl.DisplayNames(["ar"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
};

/**
 * اللغات والترجمة — من الدول المرتبطة إلى لغةٍ منشورة.
 *
 * كل دولةٍ لها منصّة تشغيلٍ مرتبطة تقترح لغاتها؛ الإدارة تفعّل ما يلزم
 * (مسودّة)، وتسمّي مراجعيه من مكتب الدولة، وتستورد المسودّة الآلية إن
 * وُجدت. المراجعون يصحّحون ويراجعون، والإدارة تنشر، ثم تُطلق اللغة للعموم.
 */
export function LocalesPanel() {
  const qc = useQueryClient();
  const fetchSources = useServerFn(getSourcesOverview);
  const fetchLocales = useServerFn(getMyReviewLocales);
  const enable = useServerFn(enableLocale);
  const { data: rawSources } = useQuery({
    queryKey: ["sources-overview"],
    queryFn: () => fetchSources(),
  });
  const { data: res, isPending } = useQuery({
    queryKey: ["review-locales"],
    queryFn: () => fetchLocales(),
  });
  const [busy, setBusy] = useState<string | null>(null);

  if (isPending)
    return <Loader2 className="mx-auto mt-10 size-5 animate-spin text-muted-foreground" />;
  if (!res?.ok)
    return (
      <EmptyState
        className="mt-6"
        title="لوحة اللغات تتجهّز"
        text={res?.error ?? "تظهر بعد تطبيق حزمة النشر على القاعدة."}
      />
    );

  const { locales, total, bundled } = res.data;
  const enabled = new Map(locales.map((l) => [l.code, l]));
  const sources = rawSources
    ? ((JSON.parse(rawSources) as SourcesOverview | null)?.sources ?? [])
    : [];
  const countries = [...new Set(sources.map((s) => s.country))];

  // اقتراحات الدول المرتبطة: لغةٌ ← الدول التي تقترحها.
  const suggested = new Map<string, string[]>();
  for (const c of countries)
    for (const l of languagesOf(c)) suggested.set(l, [...(suggested.get(l) ?? []), c]);

  async function onEnable(code: string, country: string) {
    setBusy(code);
    const r = await enable({ data: { locale: code, country } });
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success(`فُعّلت ${arName(code)} مسودّةً لـ${countryName(country)}`);
    void qc.invalidateQueries({ queryKey: ["review-locales"] });
  }

  return (
    <div className="mt-8 space-y-10">
      <section aria-labelledby="loc-sugg">
        <h2 id="loc-sugg" className="flex items-center gap-2 text-lg font-bold">
          <Globe2 className="size-5 text-primary" aria-hidden="true" />
          لغات الدول المرتبطة
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-7 text-muted-foreground">
          كل منصّة تشغيلٍ مرتبطة تقترح لغات دولتها. العربية والإنجليزية مدمجتان؛ وما سواهما يُفعَّل
          مسودّةً، ولا يراه الزائر حتى يُراجَع ويُنشر.
        </p>
        {countries.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">لا منصّات مرتبطة بعد.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...suggested.entries()].map(([code, cs]) => {
              const builtIn = code === "ar" || code === "en";
              const on = enabled.get(code);
              const missing = cs.filter((c) => !on?.countries.includes(c));
              return (
                <li key={code} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-bold">
                      {arName(code)}{" "}
                      <span lang={code} className="text-sm font-normal text-muted-foreground">
                        {nativeName(code)}
                      </span>
                    </p>
                    <StatusChip status={builtIn ? "built-in" : (on?.status ?? "suggested")} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {cs.map((c) => countryName(c)).join("، ")}
                  </p>
                  {!builtIn && missing.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      disabled={busy === code}
                      onClick={() => onEnable(code, missing[0]!)}
                    >
                      {busy === code && <Loader2 className="animate-spin" aria-hidden="true" />}
                      {on ? `أضف ${countryName(missing[0]!)}` : "فعّل مسودّة"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="loc-on">
        <h2 id="loc-on" className="flex items-center gap-2 text-lg font-bold">
          <Languages className="size-5 text-primary" aria-hidden="true" />
          اللغات المفعّلة
        </h2>
        {locales.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">لم تُفعَّل لغةٌ بعد.</p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {locales.map((l) => (
              <LocaleCard key={l.code} l={l} total={total} hasDraft={bundled.includes(l.code)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusChip({ status }: { status: "built-in" | "suggested" | "draft" | "live" }) {
  const map = {
    "built-in": ["مدمجة", "bg-secondary text-muted-foreground"],
    suggested: ["مقترحة", "border border-border text-muted-foreground"],
    draft: ["مسودّة", "bg-accent text-accent-foreground"],
    live: ["منشورة للعموم", "bg-primary text-primary-foreground"],
  } as const;
  const [label, cls] = map[status];
  return (
    <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium", cls)}>
      {label}
    </span>
  );
}

function LocaleCard({ l, total, hasDraft }: { l: ReviewLocale; total: number; hasDraft: boolean }) {
  const qc = useQueryClient();
  const setStatus = useServerFn(setLocaleStatus);
  const importDraft = useServerFn(importBundledDraft);
  const [busy, setBusy] = useState(false);
  const c = l.counts ?? {};
  const published = c.published ?? 0;
  const reviewed = c.reviewed ?? 0;
  const draft = c.draft ?? 0;
  const pct = (n: number) => `${Math.round((n / Math.max(1, total)) * 100)}%`;
  const refresh = () => void qc.invalidateQueries({ queryKey: ["review-locales"] });

  async function run(p: Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "تعذّر التنفيذ.");
    toast.success(ok);
    refresh();
  }

  return (
    <article className="rounded-3xl bg-card p-5 shadow-[0_0_0_1px_rgb(0_0_0/0.06)]">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">
            {arName(l.code)}{" "}
            <span lang={l.code} className="text-sm font-normal text-muted-foreground">
              {l.name}
            </span>
          </h3>
          <p className="text-xs text-muted-foreground">
            {l.countries.map((x) => countryName(x)).join("، ") || "—"}
          </p>
        </div>
        <StatusChip status={l.status} />
      </header>

      {/* التقدّم: منشور، ثم مراجَع، ثم مسودّة — من مجموع نصوص الفهرس. */}
      <div
        className="mt-4 flex h-2 overflow-hidden rounded-full bg-secondary"
        role="img"
        aria-label={`منشور ${pct(published)}، مراجَع ${pct(reviewed)}، مسودّة ${pct(draft)}`}
      >
        <span className="bg-primary" style={{ width: pct(published) }} />
        <span className="bg-primary/45" style={{ width: pct(reviewed) }} />
        <span className="bg-bridge/50" style={{ width: pct(draft) }} />
      </div>
      <dl className="mt-2 grid grid-cols-4 gap-2 text-xs">
        {[
          ["منشور", published],
          ["مراجَع", reviewed],
          ["مسودّة", draft],
          ["ناقص", Math.max(0, total - published - reviewed - draft)],
        ].map(([k, v]) => (
          <div key={k as string}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link to="/translate/$locale" params={{ locale: l.code }}>
            افتح المراجعة
          </Link>
        </Button>
        {hasDraft && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(
                importDraft({ data: { locale: l.code } }).then((r) =>
                  r.ok ? { ok: true } : { ok: false, error: r.error },
                ),
                "استُوردت المسودّة الآلية — تنتظر المراجعة",
              )
            }
          >
            استورد المسودّة الآلية
          </Button>
        )}
        {l.status === "draft" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || published === 0}
            title={published === 0 ? "انشر نصوصاً أوّلاً" : undefined}
            onClick={() =>
              run(setStatus({ data: { locale: l.code, status: "live" } }), "أُطلقت اللغة للعموم")
            }
          >
            أطلق للعموم
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(setStatus({ data: { locale: l.code, status: "draft" } }), "أُوقفت اللغة")
            }
          >
            أوقف عن العموم
          </Button>
        )}
      </div>
      <Reviewers code={l.code} />
    </article>
  );
}

function Reviewers({ code }: { code: string }) {
  const qc = useQueryClient();
  const fetchList = useServerFn(getLocaleReviewers);
  const setReviewer = useServerFn(setLocaleReviewer);
  const { data } = useQuery({
    queryKey: ["locale-reviewers", code],
    queryFn: () => fetchList({ data: { locale: code } }),
  });
  const [email, setEmail] = useState("");
  const list = data?.ok ? data.data : [];

  async function change(e: string, add: boolean) {
    const r = await setReviewer({ data: { locale: code, email: e, add } });
    if (!r.ok) return void toast.error(r.error);
    if (add) setEmail("");
    void qc.invalidateQueries({ queryKey: ["locale-reviewers", code] });
  }

  return (
    <div className="mt-5 border-t border-border pt-4">
      <p className="text-xs font-semibold">المراجعون (من مكتب الدولة)</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {list.length === 0 && <li className="text-xs text-muted-foreground">لا مراجع بعد.</li>}
        {list.map((r) => (
          <li
            key={r.email}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs"
          >
            <bdi dir="ltr">{r.email}</bdi>
            <button
              type="button"
              aria-label={`إزالة ${r.email}`}
              onClick={() => change(r.email, false)}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) void change(email.trim(), true);
        }}
      >
        <Input
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="reviewer@example.org"
          aria-label="بريد المراجع"
          className="h-9"
        />
        <Button type="submit" size="sm" variant="outline">
          <UserPlus aria-hidden="true" /> أضف
        </Button>
      </form>
    </div>
  );
}
