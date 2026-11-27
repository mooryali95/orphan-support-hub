import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";

import { TryRoleHeader } from "@/components/try/TryRoleHeader";
import { sampleRows } from "@/lib/admin-console-sample";
import type { OrphanRecord } from "@/lib/admin-console.functions";
import { countryName } from "@/lib/countries";
import { loadCycle, trialChild } from "@/lib/try-cycle";
import { defineCopy, useCopy, useLocale, type Locale } from "@/lib/locale";
import {
  loadGifts,
  localTryChild,
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

const COPY = defineCopy("routes/try.decider", {
  ar: {
    who: { supporter: "الكافل", donor: "الداعم", supervisor: "المشرف" },
    sponsoredMonthly: (name: string, amount: number) => `كفل ${name} بـ ${amount} شهرياً`,
    sponsoredOnce: (name: string, amount: number) => `كفل ${name} بـ ${amount} مرّة واحدة`,
    pledgedInKind: (amount: number, cur: string) => `تعهّد بدعمٍ عيني ${amount} ${cur} شهرياً`,
    pledgedTraining: (amount: number, cur: string) => `تعهّد بتأهيل ${amount} ${cur} شهرياً`,
    visitedGood: (name: string) => `زار ${name}: بخير`,
    visitedFollow: (name: string) => `زار ${name}: يحتاج متابعة`,
    aChild: "طفلاً",
    kids: "طفلاً في الشبكة",
    inCountries: (n: string) => `في ${n} دولة`,
    coverage: "تغطية الحاجة الشهرية",
    gap: (n: string) => `الفجوة ${n} يورو شهرياً`,
    waiting: "طفلاً ينتظر كافلاً",
    waitingHint: "أطولهم انتظاراً أوّلاً في الدليل",
    verified: "ملفّات موثّقة كاملاً",
    verifiedHint: "خمس فحوص لكلّ ملفّ",
    role: "صاحب القرار",
    title: "صورة الشبكة",
    lead: "أرقامٌ قليلة تقول أين الشبكة اليوم وأين الفجوة. وكلّ ما فعلته بالأدوار الأخرى في هذه الجلسة، كفالةٌ أو تعهّدٌ أو اعتمادٌ أو زيارة، يحرّك الأرقام ويظهر في سجلّ النشاط.",
    real: "الأرقام من قاعدة البيانات نفسها، بلا إدخالٍ يدوي",
    countries: "التغطية في أكبر الدول",
    bar: (p: number, n: string) => `${p}% من ${n} طفلاً`,
    scenarios: "السيناريوهات والقرارات كاملةً",
    activity: "نشاط هذه الجلسة",
    empty: "لا نشاط بعد. ادخل بدور الجهة أو الكافل، ثم عد هنا لترى أثره.",
  },
  en: {
    who: { supporter: "Supporter", donor: "Supporter", supervisor: "Supervisor" },
    sponsoredMonthly: (name: string, amount: number) => `sponsored ${name} with ${amount} a month`,
    sponsoredOnce: (name: string, amount: number) => `sponsored ${name} with ${amount} once`,
    pledgedInKind: (amount: number, cur: string) =>
      `pledged ${amount} ${cur} a month for in-kind support`,
    pledgedTraining: (amount: number, cur: string) =>
      `pledged ${amount} ${cur} a month for training`,
    visitedGood: (name: string) => `visited ${name}: doing well`,
    visitedFollow: (name: string) => `visited ${name}: needs follow-up`,
    aChild: "a child",
    kids: "children in the network",
    inCountries: (n: string) => `in ${n} countries`,
    coverage: "of monthly need covered",
    gap: (n: string) => `a gap of €${n} a month`,
    waiting: "children waiting for a sponsor",
    waitingHint: "the longest-waiting first in the directory",
    verified: "of files fully verified",
    verifiedHint: "five checks per file",
    role: "Decision-maker",
    title: "The network at a glance",
    lead: "A few figures that say where the network stands and where the gap is. Everything you did in the other roles this session (a sponsorship, a pledge, an approval or a visit) moves the figures and shows in the activity log.",
    real: "the figures come from the same database, with no manual entry",
    countries: "Coverage in the largest countries",
    bar: (p: number, n: string) => `${p}% of ${n} children`,
    scenarios: "Full scenarios and decisions",
    activity: "This session's activity",
    empty:
      "No activity yet. Enter as the organization or the supporter, then come back to see the effect.",
  },
});
type Copy = (typeof COPY)["ar"];

const numIn = (locale: string) => (v: number) =>
  Math.round(v).toLocaleString(locale, { numberingSystem: "latn" });
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const timeIn = (locale: string) => (iso: string) =>
  new Date(iso).toLocaleTimeString(locale, { numberingSystem: "latn", timeStyle: "short" });

type Activity = { at: string; who: string; what: string };

/** كلّ ما حدث في جلسة العرض، من كلّ الأدوار، في خطٍّ زمنيٍّ واحد */
function loadActivity(t: Copy, locale: Locale): Activity[] {
  const name = (id: string) => {
    const k = trialChild(id);
    return k ? localTryChild(k, locale).name : t.aChild;
  };
  const out: Activity[] = loadCycle().log.map((l) => ({ ...l }));
  for (const g of loadGifts())
    out.push({
      at: g.at,
      who: t.who.supporter,
      what: (g.cadence === "monthly" ? t.sponsoredMonthly : t.sponsoredOnce)(
        name(g.childId),
        g.amount,
      ),
    });
  for (const p of loadPledges())
    out.push({
      at: p.at,
      who: t.who.donor,
      what: (p.kind === "in_kind" ? t.pledgedInKind : t.pledgedTraining)(p.amount, p.currency),
    });
  for (const v of loadVisits())
    out.push({
      at: v.at,
      who: t.who.supervisor,
      what: (v.state === "good" ? t.visitedGood : t.visitedFollow)(name(v.childId)),
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
  const t = useCopy(COPY);
  const locale = useLocale();
  const n = numIn(locale);
  const time = timeIn(locale);
  const activity = useTrialValue<Activity[]>(
    () => loadActivity(t, locale),
    [],
    ["try-access-change"],
  );

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
    [n(m.kids), t.kids, t.inCountries(n(m.countries))],
    [`${m.coverage}%`, t.coverage, t.gap(n(m.gap))],
    [n(m.waiting), t.waiting, t.waitingHint],
    [`${m.verified}%`, t.verified, t.verifiedHint],
  ];

  return (
    <div>
      <TryRoleHeader role={t.role} title={t.title} lead={t.lead} real={t.real} />

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
            {t.countries}
          </h2>
          <ul className="mt-4 space-y-3">
            {m.top.map(([co, r]) => {
              const p = pct(r.got, r.need);
              return (
                <li key={co} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 truncate font-bold">
                    {countryName(co, locale)}
                  </span>
                  <span
                    className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary"
                    role="img"
                    aria-label={t.bar(p, n(r.kids))}
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
            {t.scenarios}
            <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
          </Link>
        </section>

        <section
          aria-labelledby="dec-activity"
          className="self-start rounded-2xl border border-border bg-card p-5 shadow-soft"
        >
          <h2 id="dec-activity" className="text-lg font-bold">
            {t.activity}
          </h2>
          {activity.length === 0 ? (
            <p className="mt-2 text-sm leading-7 text-muted-foreground">{t.empty}</p>
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
