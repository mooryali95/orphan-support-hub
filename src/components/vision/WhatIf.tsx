/**
 * «ماذا لو» لصاحب القرار: ميزانيةٌ افتراضية وطريقة توزيع، فيرى أثرها على
 * التمويل والفجوة والمجموعات وزمن إغلاق الفجوة — قبل أن يعتمد. المحاكاة على
 * نسخةٍ من الحال؛ الاعتماد وحده يكتب.
 */
import { useDeferredValue, useMemo, useState } from "react";

import { Bar, useNum, useT } from "@/components/vision/VisionKit";
import { useCurrencyName, useMoney, useVision } from "@/components/vision/VisionStore";
import { defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { type Strategy, whatIf } from "@/lib/vision-engine";

const COPY = defineCopy("components/vision/WhatIf", {
  ar: {
    h: "ماذا لو",
    lead: "جرّب ميزانيةً وطريقة توزيع، وانظر أثرها قبل أن تعتمد. لا يتغيّر شيءٌ حتى تضغط «اعتمد».",
    budget: "الميزانية",
    how: "طريقة التوزيع",
    gap: "كلّها لأكبر فجوة",
    even: "بنسبة الفجوات",
    city: "لمدينةٍ بعينها",
    which: "المدينة",
    funding: "تمويل التأهيل",
    gapK: "أطفالٌ في الفجوة",
    groups: "مجموعات مموّلة",
    close: "حتى تُغلق الفجوة",
    months: (n: number) => `${n} شهراً`,
    never: "أكثر من سنتين",
    now: "الآن",
    after: "بعد السيناريو",
    byCity: "التمويل حسب المدينة: الآن ← بعد",
    apply: "اعتمد السيناريو",
    applied: "اعتُمد — يظهر في السجلّ ولوحات الأدوار",
    unused: (m: string) => `تكفي الحاجةَ كلّها؛ يبقى ${m} غير مخصّص في الصندوق.`,
  },
  en: {
    h: "What if",
    lead: "Try a budget and a split, and see its effect before approving. Nothing changes until you press “Approve”.",
    budget: "Budget",
    how: "Split",
    gap: "All to the largest gap",
    even: "In proportion to gaps",
    city: "To one city",
    which: "City",
    funding: "Qualification funding",
    gapK: "Children in the gap",
    groups: "Funded groups",
    close: "Until the gap closes",
    months: (n: number) => `${n} months`,
    never: "Over two years",
    now: "Now",
    after: "After the scenario",
    byCity: "Funding by city: now → after",
    apply: "Approve scenario",
    applied: "Approved — it shows in the log and role boards",
    unused: (m: string) => `It covers all the need; ${m} stays unallocated in the fund.`,
  },
});

export function WhatIf() {
  const c = useCopy(COPY);
  const tr = useT();
  const num = useNum();
  const money = useMoney();
  const currency = useCurrencyName();
  const { state, dispatch } = useVision();
  const [amount, setAmount] = useState(30_000);
  const [strategy, setStrategy] = useState<Strategy>("even");
  const [city, setCity] = useState("tirana");
  const [done, setDone] = useState(false);
  const deferred = useDeferredValue(amount);
  const w = useMemo(
    () => whatIf(state, { amount: deferred, strategy, city }),
    [state, deferred, strategy, city],
  );
  const kpis = [
    [c.funding, `${num(w.now.pct)}%`, `${num(w.next.pct)}%`, w.next.pct - w.now.pct],
    [c.gapK, num(w.now.gap), num(w.next.gap), w.now.gap - w.next.gap],
    [
      c.groups,
      num(w.now.fundedGroups),
      num(w.next.fundedGroups),
      w.next.fundedGroups - w.now.fundedGroups,
    ],
    [
      c.close,
      w.monthsNow === null ? c.never : c.months(w.monthsNow),
      w.monthsNext === null ? c.never : c.months(w.monthsNext),
      (w.monthsNow ?? 99) - (w.monthsNext ?? 99),
    ],
  ] as const;

  return (
    <div>
      <h2 className="text-2xl font-extrabold">{c.h}</h2>
      <p className="mt-1 max-w-2xl text-sm text-ivory/70">{c.lead}</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[20rem_1fr]">
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <label className="block text-sm">
            <span className="flex justify-between">
              {c.budget} ({currency})
              <b className="font-serif text-gold tabular-nums">{money(amount)}</b>
            </span>
            <input
              type="range"
              min={5000}
              max={300000}
              step={5000}
              value={amount}
              onChange={(e) => {
                setAmount(Number(e.target.value));
                setDone(false);
              }}
              className="mt-2 w-full accent-[var(--color-gold)]"
            />
          </label>
          <fieldset className="text-sm">
            <legend>{c.how}</legend>
            <div className="mt-2 grid gap-1.5">
              {(["gap", "even", "city"] as const).map((k) => (
                <label
                  key={k}
                  className={cn(
                    "flex min-h-10 cursor-pointer items-center rounded-xl px-3 transition-colors",
                    strategy === k
                      ? "bg-gold text-wine-deep font-semibold"
                      : "bg-white/5 hover:bg-white/10",
                  )}
                >
                  <input
                    type="radio"
                    name="whatif-strategy"
                    className="sr-only"
                    checked={strategy === k}
                    onChange={() => {
                      setStrategy(k);
                      setDone(false);
                    }}
                  />
                  {c[k]}
                </label>
              ))}
            </div>
          </fieldset>
          {strategy === "city" && (
            <label className="block text-sm">
              {c.which}
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-wine-deep px-3 text-ivory"
              >
                {state.cities.map((x) => (
                  <option key={x.id} value={x.id}>
                    {tr(x.name)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            disabled={done}
            onClick={() => {
              dispatch({ type: "scenario", scenario: { amount, strategy, city } });
              setDone(true);
            }}
            className="min-h-11 w-full rounded-full bg-gold font-bold text-wine-deep transition-transform active:scale-[0.97] disabled:opacity-70"
          >
            {done ? c.applied : c.apply}
          </button>
        </div>

        <div>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {kpis.map(([k, a, b, delta]) => (
              <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <dt className="text-xs text-ivory/70">{k}</dt>
                <dd className="mt-2 text-xs text-ivory/55">
                  {c.now}: <bdi className="tabular-nums">{a}</bdi>
                </dd>
                <dd
                  className={cn(
                    "mt-1 font-serif text-2xl tabular-nums",
                    delta > 0 ? "text-gold" : "text-ivory",
                  )}
                >
                  <bdi>{b}</bdi>
                </dd>
              </div>
            ))}
          </dl>
          {w.unused > 0 && (
            <p className="mt-4 rounded-xl bg-white/5 px-4 py-2 text-xs text-ivory/80">
              {c.unused(money(w.unused))}
            </p>
          )}
          <p className="mt-6 text-xs font-semibold text-gold-soft">{c.byCity}</p>
          <ul className="mt-3 space-y-2">
            {w.cities.map((x) => {
              const name = state.cities.find((y) => y.id === x.id)!;
              const moved = x.after !== x.before;
              return (
                <li
                  key={x.id}
                  className="grid grid-cols-[5.5rem_1fr_5.5rem] items-center gap-3 text-sm"
                >
                  <span className={moved ? "font-semibold" : "text-ivory/70"}>{tr(name.name)}</span>
                  <span className="relative">
                    <Bar pct={x.after} className="text-ivory" />
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 w-0.5 rounded bg-ivory/80"
                      style={{ insetInlineStart: `${Math.min(100, x.before)}%` }}
                    />
                  </span>
                  <span
                    dir="ltr"
                    className={cn(
                      "text-end text-xs tabular-nums",
                      moved ? "text-gold" : "text-ivory/60",
                    )}
                  >
                    {x.before}% → {x.after}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
