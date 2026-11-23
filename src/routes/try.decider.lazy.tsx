import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";

import { TryRoleHeader } from "@/components/try/TryRoleHeader";
import { sampleRows } from "@/lib/admin-console-sample";
import type { OrphanRecord } from "@/lib/admin-console.functions";
import { countryName } from "@/lib/countries";
import { loadCycle } from "@/lib/try-cycle";
import {
  loadGifts,
  TRY_CHILDREN,
  TRY_CYCLE,
  TRY_WORLD_CHILDREN,
  TRY_WORLD_EXTRA,
  tryChild,
} from "@/lib/try-demo";
import { loadVisits, useTrialValue } from "@/lib/try-role-state";
import { loadPledges } from "@/lib/try-support";
import { verificationLevel } from "@/lib/verification";

export const Route = createLazyFileRoute("/try/decider")({ component: TryDecider });

const n = (v: number) => Math.round(v).toLocaleString("ar", { numberingSystem: "latn" });
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("ar", { numberingSystem: "latn", timeStyle: "short" });

type Activity = { at: string; who: string; what: string };

/** كلّ ما حدث في جلسة العرض، من كلّ الأدوار، في خطٍّ زمنيٍّ واحد */
function loadActivity(): Activity[] {
  const out: Activity[] = loadCycle().log.map((l) => ({ ...l }));
  for (const g of loadGifts())
    out.push({
      at: g.at,
      who: "الكافل",
      what: `كفل ${tryChild(g.childId)?.name ?? "طفلاً"} بـ ${g.amount} ${g.cadence === "monthly" ? "شهرياً" : "مرّة واحدة"}`,
    });
  for (const p of loadPledges())
    out.push({
      at: p.at,
      who: "الداعم",
      what: `تعهّد ${p.kind === "in_kind" ? "بدعمٍ عيني" : "بتأهيل"} ${p.amount} ${p.currency} شهرياً`,
    });
  for (const v of loadVisits())
    out.push({
      at: v.at,
      who: "المشرف",
      what: `زار ${tryChild(v.childId)?.name ?? "طفلاً"}: ${v.state === "good" ? "بخير" : "يحتاج متابعة"}`,
    });
  // سجلّ الدورة يكرّر الكفالة: يكفي سطر الكافل
  return out
    .filter((a, i, all) => all.findIndex((b) => b.at === a.at && b.what === a.what) === i)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);
}

/**
 * واجهة صاحب القرار في العرض: صورة الشبكة في أرقامٍ قليلة — الأطفال والتغطية والتوثيق
 * والدول — وما فعلته الأدوار الأخرى في هذه الجلسة يحرّك الأرقام أمامه.
 */
function TryDecider() {
  const gifts = useTrialValue(loadGifts, []);
  // طفل الدورة يُقرأ من الجلسة بعد التحميل، فيطابق رسمُ الخادم رسمَ المتصفّح
  const cycle = useTrialValue(() => [...TRY_CYCLE], [] as typeof TRY_CYCLE);
  const activity = useTrialValue<Activity[]>(loadActivity, [], ["try-access-change"]);

  const m = useMemo(() => {
    const kids = [...cycle, ...TRY_CHILDREN, ...TRY_WORLD_CHILDREN, ...TRY_WORLD_EXTRA];
    const extra = new Map<string, number>();
    for (const g of gifts)
      if (g.cadence === "monthly") extra.set(g.childId, (extra.get(g.childId) ?? 0) + g.amount);
    const funded = (k: (typeof kids)[number]) =>
      Math.min(k.need, k.funded + (extra.get(k.id) ?? 0));
    const need = kids.reduce((a, k) => a + k.need, 0);
    const got = kids.reduce((a, k) => a + funded(k), 0);
    const byCo = new Map<string, { kids: number; need: number; got: number }>();
    for (const k of kids) {
      const r = byCo.get(k.co) ?? { kids: 0, need: 0, got: 0 };
      r.kids += 1;
      r.need += k.need;
      r.got += funded(k);
      byCo.set(k.co, r);
    }
    const orphans = sampleRows("orphans") as OrphanRecord[];
    return {
      kids: kids.length,
      waiting: kids.filter((k) => funded(k) === 0).length,
      coverage: pct(got, need),
      gap: need - got,
      countries: byCo.size,
      verified: pct(
        orphans.filter((o) => verificationLevel(o.verification) === "full").length,
        orphans.length,
      ),
      top: [...byCo.entries()].sort((a, b) => b[1].kids - a[1].kids).slice(0, 8),
    };
  }, [gifts, cycle]);

  const kpis: Array<[string, string, string]> = [
    [n(m.kids), "طفلاً في الشبكة", `في ${n(m.countries)} دولة`],
    [`${m.coverage}%`, "تغطية الحاجة الشهرية", `الفجوة ${n(m.gap)} يورو شهرياً`],
    [n(m.waiting), "طفلاً ينتظر كافلاً", "أطولهم انتظاراً أوّلاً في الدليل"],
    [`${m.verified}%`, "ملفّات موثّقة كاملاً", "خمس فحوص لكلّ ملفّ"],
  ];

  return (
    <div>
      <TryRoleHeader
        role="صاحب القرار"
        title="صورة الشبكة"
        lead="أرقامٌ قليلة تقول أين الشبكة اليوم وأين الفجوة. وكلّ ما فعلته بالأدوار الأخرى في هذه الجلسة — كفالةٌ أو تعهّدٌ أو اعتمادٌ أو زيارة — يحرّك الأرقام ويظهر في سجلّ النشاط."
        real="الأرقام من قاعدة البيانات نفسها، بلا إدخالٍ يدوي"
      />

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(([v, label, hint], i) => (
          <li
            key={label}
            className="try-rise rounded-2xl border border-border bg-card p-5 shadow-soft"
            style={{ animationDelay: `${0.05 + i * 0.06}s` }}
          >
            <span className="numeral block text-4xl text-primary tabular-nums">{v}</span>
            <span className="mt-2 block font-bold">{label}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="dec-countries"
          className="rounded-2xl border border-border bg-card p-5 shadow-soft"
        >
          <h2 id="dec-countries" className="text-lg font-bold">
            التغطية في أكبر الدول
          </h2>
          <ul className="mt-4 space-y-3">
            {m.top.map(([co, r]) => {
              const p = pct(r.got, r.need);
              return (
                <li key={co} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 truncate font-bold">{countryName(co, "ar")}</span>
                  <span
                    className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary"
                    role="img"
                    aria-label={`${p}% من ${n(r.kids)} طفلاً`}
                  >
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${p}%` }}
                    />
                  </span>
                  <span className="w-10 text-end text-xs text-muted-foreground tabular-nums">
                    {p}%
                  </span>
                </li>
              );
            })}
          </ul>
          <Link
            to="/vision/decision"
            className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-primary underline-offset-4 hover:underline"
          >
            السيناريوهات والقرارات كاملةً
            <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
          </Link>
        </section>

        <section
          aria-labelledby="dec-activity"
          className="self-start rounded-2xl border border-border bg-card p-5 shadow-soft"
        >
          <h2 id="dec-activity" className="text-lg font-bold">
            نشاط هذه الجلسة
          </h2>
          {activity.length === 0 ? (
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              لا نشاط بعد. ادخل بدور الجهة أو الكافل، ثم عد هنا لترى أثره.
            </p>
          ) : (
            <ol className="mt-3 space-y-2.5">
              {activity.map((a) => (
                <li key={a.at + a.what} className="flex gap-3 text-sm">
                  <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {time(a.at)}
                  </span>
                  <span className="min-w-0">
                    <span className="font-bold">{a.who}</span> {a.what}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
