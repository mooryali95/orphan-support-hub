import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, CircleDashed, Link2, Loader2, ShieldAlert, ShieldCheck, Siren } from "lucide-react";

import { StatTile } from "@/components/kit/StatTile";
import { EmptyState } from "@/components/kit/EmptyState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { flagOf } from "@/lib/countries";
import { formatDate } from "@/lib/format";
import {
  getSourcesOverview,
  setCountryEmergency,
  setSource,
  verifyIntegrity,
  type SourceChecklist,
  type SourceRow,
  type SourcesOverview,
} from "@/lib/integrity.functions";
import { cn } from "@/lib/utils";

const STEPS: Array<[keyof SourceChecklist, string, string]> = [
  ["key_issued", "مفتاح المزامنة", "يصدر من «التكامل» بنطاق مزامنة منصّة التشغيل"],
  ["org_linked", "الجهة المسؤولة", "تُربط من «حالة المزامنة» أدناه"],
  ["first_sync", "أوّل مزامنة", "تصل أوّل دفعة من المنصّة"],
  ["reconciled", "مطابقةٌ نظيفة", "تطابق كل المعرّفات بلا انحراف"],
  ["office_reviewed", "مراجعة المكتب الوطني", "يراجع المكتب البيانات المستوردة"],
  ["regions_mapped", "ربط المناطق بالخارطة", "أسماء المناطق تطابق الخارطة"],
];

const STATUS: Record<SourceRow["status"], { label: string; tone: string }> = {
  onboarding: { label: "قيد الإعداد", tone: "bg-secondary text-muted-foreground" },
  trial: { label: "تجريبي", tone: "bg-accent text-accent-foreground" },
  active: { label: "مفعّل", tone: "bg-primary/10 text-primary" },
  paused: { label: "موقوف", tone: "bg-secondary text-muted-foreground" },
};

const NEXT: Partial<Record<SourceRow["status"], SourceRow["status"]>> = {
  onboarding: "trial",
  trial: "active",
};

/**
 * الدول ومصادرها — كل دولةٍ تُضاف بقائمة تحقّق لا بخطوة، وتُرى صحّتها من
 * نظرة: متى آخر مزامنة، وكم مقفول، وكم اختلافاً ينتظر.
 */
export function SourcesPanel() {
  const fetchOverview = useServerFn(getSourcesOverview);
  const verify = useServerFn(verifyIntegrity);
  const { data: raw, isPending } = useQuery({
    queryKey: ["sources-overview"],
    queryFn: () => fetchOverview(),
  });
  const o = raw ? (JSON.parse(raw) as SourcesOverview | null) : null;
  const [chain, setChain] = useState<null | { ok: boolean; checked: number; broken_at?: number }>(
    null,
  );
  const [checking, setChecking] = useState(false);

  if (isPending)
    return <Loader2 className="mx-auto mt-10 size-5 animate-spin text-muted-foreground" />;
  if (!o)
    return (
      <EmptyState
        className="mt-6"
        title="سجلّ المصادر يتجهّز الآن"
        text="يظهر بعد تطبيق حزمة النشر على القاعدة."
      />
    );

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="المصادر" value={String(o.sources.length)} />
        <StatTile label="ملفّات مقفولة" value={String(o.locked_total)} hint="كفالة أو دعم أو صرف" />
        <StatTile
          label="اختلافات تنتظر"
          value={String(o.open_discrepancies)}
          tone={o.open_discrepancies ? "gold" : "primary"}
        />
        <StatTile label="طلبات فكّ مفتوحة" value={String(o.pending_unlocks)} />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary/50 p-4">
        <ShieldCheck className="size-5 text-primary" strokeWidth={1.5} aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm leading-6">
          كل قفلٍ وطلبٍ وتغييرٍ ممسوك يُكتب في سجلٍّ لا يُعدَّل، كل سطرٍ فيه مربوطٌ ببصمة سابقه.
          {chain && (
            <strong className={cn("ms-2", chain.ok ? "text-primary" : "text-destructive")}>
              {chain.ok
                ? `السلسلة سليمة (${chain.checked} سطراً).`
                : `انكسرت السلسلة عند السطر ${chain.broken_at}.`}
            </strong>
          )}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            setChain(await verify());
            setChecking(false);
          }}
        >
          {checking ? <Loader2 className="animate-spin" /> : <ShieldCheck aria-hidden="true" />}
          تحقّق من السلسلة
        </Button>
      </div>

      {o.sources.length === 0 ? (
        <EmptyState title="لا مصادر بعد" text="أضف منصّة تشغيلٍ لدولة من سجلّات المنصّة." />
      ) : (
        <ul className="grid gap-5 lg:grid-cols-2">
          {o.sources.map((s, i) => (
            <li key={s.key} className="stagger-in" style={{ ["--i" as string]: i }}>
              <SourceCard s={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SourceCard({ s }: { s: SourceRow }) {
  const save = useServerFn(setSource);
  const emergency = useServerFn(setCountryEmergency);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const done = STEPS.filter(([k]) => s.checklist[k]).length;
  const next = NEXT[s.status];
  const inEmergency = s.country_status === "emergency";

  async function run(
    fn: () => Promise<{ ok: boolean; error?: string; missing?: string[] }>,
    ok: string,
  ) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      toast.error(
        r.missing?.length
          ? `ينقص: ${r.missing.map((m) => STEPS.find(([k]) => k === m)?.[1] ?? m).join("، ")}`
          : (r.error ?? "تعذّر التنفيذ"),
      );
      return false;
    }
    toast.success(ok);
    await qc.invalidateQueries({ queryKey: ["sources-overview"] });
    return true;
  }

  return (
    <article
      className={cn(
        "h-full rounded-3xl bg-card p-6 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06),0_2px_4px_0_rgb(0_0_0/0.04)]",
        inEmergency && "ring-2 ring-destructive/40",
      )}
    >
      <header className="flex items-start gap-3">
        <span className="text-3xl leading-none" aria-hidden="true">
          {flagOf(s.country)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold">{s.country_name}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {s.name} · <bdi dir="ltr">{s.key}</bdi>
          </p>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS[s.status].tone)}>
          {STATUS[s.status].label}
        </span>
      </header>

      {inEmergency && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <Siren className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>وضع الطوارئ:</strong> الكفالة الجديدة موقوفة. {s.emergency_note}
          </span>
        </p>
      )}

      <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
        {(
          [
            ["مستورد", s.mirrored],
            ["مقفول", s.locked],
            ["اختلافات", s.open_discrepancies],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="rounded-2xl bg-secondary/50 py-3">
            <dd
              className={cn(
                "text-2xl font-extrabold tabular-nums",
                label === "اختلافات" && n > 0 && "text-bridge-ink",
              )}
            >
              {n}
            </dd>
            <dt className="text-xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        آخر مزامنة: {s.last_sync_at ? formatDate(s.last_sync_at) : "لم تبدأ"} · آخر مطابقة:{" "}
        {s.last_reconcile_at ? formatDate(s.last_reconcile_at) : "لم تُجرَ"} · {s.batches} دفعة
        موثّقة
      </p>
      {s.last_error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
          <ShieldAlert className="size-3.5" aria-hidden="true" /> {s.last_error}
        </p>
      )}

      <section className="mt-5" aria-label={`قائمة تفعيل ${s.country_name}`}>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">قائمة التفعيل</span>
          <span className="tabular-nums text-muted-foreground">
            {done} من {STEPS.length}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-700 ease-[var(--ease-out)]"
            style={{ width: `${(done / STEPS.length) * 100}%` }}
          />
        </div>
        <ol className="mt-3 space-y-1.5">
          {STEPS.map(([k, label, hint]) => {
            const ok = s.checklist[k];
            const manual = k === "office_reviewed" || k === "regions_mapped";
            return (
              <li key={k} className="flex items-center gap-2.5 text-sm">
                {ok ? (
                  <Check className="size-4 shrink-0 text-primary" aria-label="مكتمل" />
                ) : (
                  <CircleDashed
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-label="ينتظر"
                  />
                )}
                <span className={cn("min-w-0 flex-1", !ok && "text-muted-foreground")}>
                  {label}
                  {!ok && <span className="block text-xs">{hint}</span>}
                </span>
                {manual && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          save({
                            data: {
                              key: s.key,
                              status: null,
                              officeReviewed: k === "office_reviewed" ? !ok : null,
                              regionsMapped: k === "regions_mapped" ? !ok : null,
                            },
                          }),
                        ok ? "أُلغي التأشير" : "أُشّر",
                      )
                    }
                    className="min-h-8 rounded-full px-2.5 text-xs font-medium text-primary hover:bg-primary/5"
                  >
                    {ok ? "إلغاء" : "تأشير"}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <footer className="mt-6 flex flex-wrap gap-2">
        {next && (
          <Button
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  save({
                    data: { key: s.key, status: next, officeReviewed: null, regionsMapped: null },
                  }),
                next === "active" ? "فُعّل المصدر — الكفالة مفتوحة في الدولة" : "صار تجريبياً",
              )
            }
          >
            <Link2 aria-hidden="true" />
            {next === "active" ? "فعّل المصدر" : "ابدأ التجربة"}
          </Button>
        )}
        {s.country_status === "active" || inEmergency ? (
          inEmergency ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(
                  () => emergency({ data: { code: s.country, on: false, note: null } }),
                  "رُفع وضع الطوارئ",
                )
              }
            >
              رفع وضع الطوارئ
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => setNoteOpen((v) => !v)}
              aria-expanded={noteOpen}
            >
              <Siren aria-hidden="true" />
              وضع الطوارئ
            </Button>
          )
        ) : null}
      </footer>
      {noteOpen && !inEmergency && (
        <form
          className="map-rise mt-3 space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await run(
                () => emergency({ data: { code: s.country, on: true, note } }),
                "الكفالة الجديدة موقوفة",
              )
            ) {
              setNoteOpen(false);
              setNote("");
            }
          }}
        >
          <Textarea
            required
            minLength={5}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="السبب — يظهر للإدارة ويُحفظ في السجلّ"
            aria-label="سبب وضع الطوارئ"
          />
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={busy || note.trim().length < 5}
          >
            أوقف الكفالة الجديدة في {s.country_name}
          </Button>
        </form>
      )}
    </article>
  );
}
