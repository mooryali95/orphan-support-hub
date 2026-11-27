import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Flag, HandCoins, Megaphone, Users } from "lucide-react";

import {
  Bar,
  Eyebrow,
  PlatformFrame,
  Tally,
  useNum,
  useT,
  VisionShell,
} from "@/components/vision/VisionKit";
import { pageTitle } from "@/config/brand";
import { Trend } from "@/components/vision/Trend";
import { WhatIf } from "@/components/vision/WhatIf";
import { Feed, useMoney, usePlace, useVision } from "@/components/vision/VisionStore";
import { ALBANIA, REGIONS, SYSTEM } from "@/data/vision-demo";
import { fundingPct, ranked as rankCities, recommend, totals } from "@/lib/vision-engine";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/vision/decision")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const c = copyOf(COPY, l);
    return {
      meta: [{ title: pageTitle(c.title, false, l) }, { name: "description", content: c.lead }],
    };
  },
  component: DecisionPage,
});

const COPY = defineCopy("routes/vision.decision", {
  ar: {
    label: "الطبقة الثالثة · القرار",
    title: "الرؤية والتوجهات",
    lead: "لوحة الندوة: أين نحن، وإلى أين يذهب الدعم القادم. ترى الأرقام المجمّعة وحدها، لا اسم ولا ملفّ.",
    brand: "الأهلية للأيتام",
    chip: "الرؤية والتوجهات",
    tabShift: "المؤشّر",
    tabRegions: "المناطق",
    tabCountry: "قراءة دولة",
    tabInvest: "أين نستثمر",
    tabWhatIf: "ماذا لو",
    tabDecide: "القرار",
    shiftH: "رعايةٌ تبني الأهليّة، في رقمٍ واحد",
    shiftLead: "المؤشّر الأوّل للمنظومة: كم من الأيتام المكفولين انتقل إلى رحلة تأهيلٍ مقيسة.",
    moreThan: "أكثر من",
    sponsored: "يتيمٍ في كفالة الندوة",
    measured: (n: string) => `في رحلة تأهيلٍ مقيسة: ${n} (ألبانيا)`,
    offices: "مكاتب الندوة وشركاؤها",
    officesData: "مكاتب تعمل مع الأيتام في بياناتها المنشورة",
    supervisors: "مشرفون مؤهّلون في النموذج الأوّل",
    trustees: (n: number) => `أعضاء مجلس الأمناء، من ${n} منطقة`,
    regionsH: "المناطق: الكفالة والتأهيل",
    region: "المنطقة",
    regionOffices: "مكاتب",
    regionSponsored: "مكفولون",
    regionMeasured: "في التأهيل",
    notYet: "لم تبدأ",
    countryH: "قراءة دولة: ألبانيا",
    countryLead: "الحاجة من منصّة التشغيل، والعطاء من منصّة الدعم، على خريطةٍ واحدة.",
    needFunding: "الاحتياج والتمويل حسب المدينة",
    need: "الحاجة",
    funded: "التمويل",
    over: "تجاوز الحاجة",
    groupsLine: (a: number, b: number) => `${a} مجموعة مموّلة من ${b} مجموعة إشرافية`,
    pick: "اختر مدينةً على الخريطة أو في القائمة",
    childrenNeed: (n: number) => `${n} طفلاً بحاجة إلى رحلة تأهيل`,
    groupsIn: (n: number) => `${n} مجموعات`,
    investH: "أين نستثمر",
    investLead:
      "الفجوة = من يحتاجون × ما لم يُموَّل بعد. الأولى أوّلاً؛ وما تجاوز تمويلُه حاجتَه يُوجَّه فائضه.",
    gap: (n: number) => `فجوة ${n} طفلاً`,
    surplus: "فائض يُعاد توجيهه",
    decideH: "القرار",
    decideLead: "صاحب القرار يرى المجموع، ويقرّر، والقرار يعود إلى الطبقتين:",
    proposal: "قرارٌ مقترح",
    campaign: "حملةٌ لتيرانا",
    campaignText: "تظهر في منصّة الدعم بابًا مستقلاً «أكمل مجموعات تيرانا»، بهدفٍ يضيّق الفجوة.",
    newGroup: "مجموعةٌ جديدة",
    newGroupText: "تُفتح في منصّة التشغيل مجموعةٌ إشرافية خامسة في تيرانا بمشرفٍ من المؤهَّلين.",
    goesTo: "يعود إلى",
    toSupport: "الدعم",
    toOps: "التشغيل",
    seeCycle: "شاهد الدورة كاملة",
    approve: "اعتمد القرار",
    liveH: "ألبانيا الآن: يتحرّك مع كلّ تبرّعٍ وقياس",
    trendsH: "الاتجاه شهراً بشهر: «تقدّم شهراً» من الشريط أعلاه",
    trendGap: "أطفالٌ في الفجوة",
    trendMeasured: "في رحلةٍ مقيسة",
    liveRaised: "تبرّعاتٌ قُيّدت في حساب الندوة",
    liveDonors: "داعمون",
    liveFunding: "تمويل التأهيل في ألبانيا",
    liveGap: "طفلاً في الفجوة",
    noRecs: "لا توصيات مفتوحة الآن: كلّ ما اقترحته الأرقام اعتُمد. تبرّعٌ جديد أو قياسٌ يغيّرها.",
    rec: {
      campaign: {
        h: (p: string) => `حملةٌ لـ${p}`,
        why: (gap: number, pct: number, amt: string) =>
          `أكبر فجوة: ${gap} طفلاً، والتمويل ${pct}%. هدف الحملة ${amt}، وتظهر في منصّة الدعم باباً مستقلاً.`,
      },
      newGroup: {
        h: (p: string) => `مجموعةٌ جديدة في ${p}`,
        why: (gap: number, _p: number, amt: string) =>
          `الرصيد الحرّ يكفي مجموعةً كاملة (${amt}) وما زال ${gap} طفلاً بلا مجموعة، تُفتح في التشغيل بمشرفٍ مؤهَّل.`,
      },
      redirect: {
        h: (p: string, to: string) => `أعد توجيه فائض ${p} إلى ${to}`,
        why: (_g: number, _p: number, amt: string, to: string) =>
          `التمويل تجاوز الحاجة بـ ${amt}؛ يُوجَّه إلى ${to} حيث الفجوة.`,
      },
      fundGroup: {
        h: (_p: string, g: string) => `أولويةٌ لتمويل ${g}`,
        why: (_g: number, _p: number, amt: string) =>
          `مجموعةٌ قائمة تنتظر ${amt} لتبدأ جلساتها، تُعرض أوّلاً للداعمين.`,
      },
    },
  },
  en: {
    label: "Layer three · Decision",
    title: "Vision and directions",
    lead: "WAMY's board: where we stand and where the next support should go. Aggregates only; no names, no files.",
    brand: "Orphan capability",
    chip: "Vision and directions",
    tabShift: "Indicator",
    tabRegions: "Regions",
    tabCountry: "Country reading",
    tabInvest: "Where to invest",
    tabWhatIf: "What if",
    tabDecide: "Decision",
    shiftH: "Care that builds capability, in one number",
    shiftLead:
      "The system's first indicator: how many sponsored orphans moved into a measured qualification journey.",
    moreThan: "More than",
    sponsored: "orphans sponsored by WAMY",
    measured: (n: string) => `In a measured journey: ${n} (Albania)`,
    offices: "WAMY offices and partners",
    officesData: "Offices working with orphans in their published data",
    supervisors: "Qualified supervisors in the first model",
    trustees: (n: number) => `Board of trustees members, from ${n} regions`,
    regionsH: "Regions: sponsorship and qualification",
    region: "Region",
    regionOffices: "Offices",
    regionSponsored: "Sponsored",
    regionMeasured: "In qualification",
    notYet: "Not started",
    countryH: "Country reading: Albania",
    countryLead:
      "Need from the operations platform, donations from the support platform, on one map.",
    needFunding: "Need and funding by city",
    need: "Need",
    funded: "Funding",
    over: "Above need",
    groupsLine: (a: number, b: number) => `${a} funded groups of ${b} supervised groups`,
    pick: "Pick a city on the map or in the list",
    childrenNeed: (n: number) => `${n} children need a qualification journey`,
    groupsIn: (n: number) => `${n} groups`,
    investH: "Where to invest",
    investLead:
      "Gap = children in need × the share not yet funded. Largest first; surplus where funding exceeds need is redirected.",
    gap: (n: number) => `Gap of ${n} children`,
    surplus: "Surplus to redirect",
    decideH: "Decision",
    decideLead:
      "The decision-maker sees the aggregate and decides, and the decision returns to both layers:",
    proposal: "Proposed decision",
    campaign: "A Tirana campaign",
    campaignText:
      "Appears in the support platform as a separate entry point, “Complete the Tirana groups”, with a target that closes the gap.",
    newGroup: "A new group",
    newGroupText:
      "A fifth supervised group opens in Tirana in the operations platform, led by a qualified supervisor.",
    goesTo: "Returns to",
    toSupport: "Support",
    toOps: "Operations",
    seeCycle: "Watch the whole cycle",
    approve: "Approve decision",
    liveH: "Albania now: moves with every donation and measurement",
    trendsH: "Month by month: use “Advance a month” in the bar above",
    trendGap: "Children in the gap",
    trendMeasured: "In a measured journey",
    liveRaised: "Donations recorded in WAMY's account",
    liveDonors: "Supporters",
    liveFunding: "Qualification funding in Albania",
    liveGap: "children in the gap",
    noRecs:
      "No open recommendations: everything the numbers proposed was approved. A new donation or measurement will change that.",
    rec: {
      campaign: {
        h: (p: string) => `A campaign for ${p}`,
        why: (gap: number, pct: number, amt: string) =>
          `Largest gap: ${gap} children, funding at ${pct}%. Campaign target ${amt}; it appears in the support platform as a separate entry point.`,
      },
      newGroup: {
        h: (p: string) => `A new group in ${p}`,
        why: (gap: number, _p: number, amt: string) =>
          `The free balance covers a full group (${amt}) and ${gap} children still have none; it opens in operations with a qualified supervisor.`,
      },
      redirect: {
        h: (p: string, to: string) => `Redirect ${p}'s surplus to ${to}`,
        why: (_g: number, _p: number, amt: string, to: string) =>
          `Funding exceeded need by ${amt}; it goes to ${to}, where the gap is.`,
      },
      fundGroup: {
        h: (_p: string, g: string) => `Priority funding for ${g}`,
        why: (_g: number, _p: number, amt: string) =>
          `An existing group needs ${amt} to start its sessions; shown first to supporters.`,
      },
    },
  },
});

function DecisionPage() {
  const c = useCopy(COPY);
  const [tab, setTab] = useState("shift");
  const tabs = [
    { key: "shift", label: c.tabShift },
    { key: "regions", label: c.tabRegions },
    { key: "country", label: c.tabCountry },
    { key: "invest", label: c.tabInvest },
    { key: "whatif", label: c.tabWhatIf },
    { key: "decide", label: c.tabDecide },
  ] as const;
  return (
    <VisionShell>
      <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <Eyebrow n="03" label={c.label} title={c.title} lead={c.lead} />
        <div className="mt-10">
          <PlatformFrame
            host="wamy.manzoma.sa/vision"
            brand={c.brand}
            chip={c.chip}
            tone="dark"
            tabs={tabs}
            active={tab}
            onTab={setTab}
          >
            {tab === "shift" && <Shift />}
            {tab === "regions" && <Regions />}
            {tab === "country" && <Country />}
            {tab === "invest" && <Invest />}
            {tab === "whatif" && <WhatIf />}
            {tab === "decide" && <Decide />}
          </PlatformFrame>
        </div>
      </section>
    </VisionShell>
  );
}

function Shift() {
  const c = useCopy(COPY);
  const num = useNum();
  const money = useMoney();
  const { state } = useVision();
  const t = totals(state);
  const pct = +((t.measured / SYSTEM.sponsored) * 100).toFixed(1);
  return (
    <div>
      <h2 className="text-2xl font-extrabold md:text-3xl">{c.shiftH}</h2>
      <p className="mt-1 text-sm text-ivory/70">{c.shiftLead}</p>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
          <p className="text-lg text-gold-soft">{c.moreThan}</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-4">
            <Tally to={SYSTEM.sponsored} className="text-6xl leading-none text-ivory md:text-8xl" />
            <span className="text-gold-soft">{c.sponsored}</span>
          </p>
          <p className="mt-2 text-xs text-ivory/40" dir="ltr">
            {SYSTEM.sponsoredSource}
          </p>
          <div
            className="mt-6 h-3 overflow-hidden rounded-full bg-white/10"
            role="img"
            aria-label={`${pct}%`}
          >
            <div
              className="vision-bar h-full rounded-full bg-gold"
              style={{ width: `${Math.max(1.5, pct)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-ivory/70">
            <span>{c.measured(num(t.measured))}</span>
            <span className="tabular-nums">{num(pct, { maximumFractionDigits: 1 })}%</span>
          </div>
        </div>
        <dl className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.03] px-6">
          {(
            [
              [SYSTEM.offices, c.offices],
              [SYSTEM.officesWithData, c.officesData],
              [SYSTEM.supervisors, c.supervisors],
              [SYSTEM.trustees, c.trustees(SYSTEM.trusteeRegions)],
            ] as const
          ).map(([n, label]) => (
            <div key={label} className="flex items-center justify-between gap-4 py-4">
              <dt className="text-sm text-ivory/75">{label}</dt>
              <dd className="text-3xl text-gold">
                <Tally to={n} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <h3 className="mt-8 text-sm font-bold text-gold-soft">{c.liveH}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(
          [
            [money(t.raised), c.liveRaised],
            [num(t.donors), c.liveDonors],
            [`${num(t.pct)}%`, c.liveFunding],
            [num(t.gap), c.liveGap],
          ] as const
        ).map(([v, label]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <dd className="font-serif text-2xl text-ivory tabular-nums">{v}</dd>
            <dt className="mt-1 text-xs text-ivory/70">{label}</dt>
          </div>
        ))}
      </dl>
      <h3 className="mt-8 text-sm font-bold text-gold-soft">{c.trendsH}</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Trend
          dark
          title={c.liveFunding}
          points={state.history.map((h) => ({ month: h.month, v: h.pct }))}
          format={(v) => `${num(v)}%`}
        />
        <Trend
          dark
          title={c.trendGap}
          points={state.history.map((h) => ({ month: h.month, v: h.gap }))}
          format={(v) => num(v)}
        />
        <Trend
          dark
          title={c.trendMeasured}
          points={state.history.map((h) => ({ month: h.month, v: h.measured }))}
          format={(v) => num(v)}
        />
      </div>
      <Feed limit={6} dark className="mt-4" />
    </div>
  );
}

function Regions() {
  const c = useCopy(COPY);
  const tr = useT();
  const num = useNum();
  const max = Math.max(...REGIONS.map((r) => r.sponsored));
  return (
    <div>
      <h2 className="text-2xl font-extrabold">{c.regionsH}</h2>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="text-start text-xs text-ivory/60">
            <tr>
              <th className="py-2 text-start font-medium">{c.region}</th>
              <th className="py-2 text-start font-medium">{c.regionOffices}</th>
              <th className="w-2/5 py-2 text-start font-medium">{c.regionSponsored}</th>
              <th className="py-2 text-start font-medium">{c.regionMeasured}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {REGIONS.map((r) => (
              <tr key={r.name.en}>
                <td className="py-3 font-semibold">{tr(r.name)}</td>
                <td className="py-3 font-serif text-lg text-gold tabular-nums">{r.offices}</td>
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <Bar pct={(r.sponsored / max) * 100} className="flex-1 text-ivory" />
                    <span className="w-14 text-end tabular-nums">{num(r.sponsored)}</span>
                  </div>
                </td>
                <td className="py-3 tabular-nums">
                  {r.measured ? (
                    <span className="font-semibold text-gold">{num(r.measured)}</span>
                  ) : (
                    <span className="text-ivory/40">{c.notYet}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Shape = { en: string; d: string; b: [number, number, number, number] };

function useAlbania() {
  return useQuery({
    queryKey: ["geo", "admin1", "AL"],
    queryFn: async () =>
      ((await (await fetch("/geo/admin1/AL.json")).json()) as { regions: Shape[] }).regions,
    staleTime: Infinity,
  });
}

/** خريطة ألبانيا من حدود مقاطعاتها: لون كلّ مقاطعة بنسبة تمويلها، والمختارة مضيئة. */
function AlbaniaMap({
  selected,
  onPick,
  pct,
}: {
  selected: string | null;
  onPick: (id: string) => void;
  pct: Map<string, number>;
}) {
  const tr = useT();
  const { data } = useAlbania();
  const box = useMemo(() => {
    if (!data?.length) return null;
    const x0 = Math.min(...data.map((r) => r.b[0]));
    const y0 = Math.min(...data.map((r) => r.b[1]));
    const x1 = Math.max(...data.map((r) => r.b[0] + r.b[2]));
    const y1 = Math.max(...data.map((r) => r.b[1] + r.b[3]));
    const p = 0.25;
    return `${x0 - p} ${y0 - p} ${x1 - x0 + 2 * p} ${y1 - y0 + 2 * p}`;
  }, [data]);
  const byName = new Map(ALBANIA.map((city) => [city.name.en, city]));
  if (!data || !box) return <div className="aspect-[3/5] animate-pulse rounded-2xl bg-white/5" />;
  return (
    <svg
      viewBox={box}
      className="mx-auto h-full max-h-[30rem] w-full"
      role="group"
      aria-label="Albania"
    >
      {data.map((r) => {
        const city = byName.get(r.en);
        const on = city && city.id === selected;
        return (
          <path
            key={r.en}
            d={r.d}
            vectorEffect="non-scaling-stroke"
            strokeWidth={on ? 2 : 1}
            role={city ? "button" : undefined}
            tabIndex={city ? 0 : -1}
            aria-label={city ? tr(city.name) : undefined}
            onClick={city ? () => onPick(city.id) : undefined}
            onKeyDown={
              city ? (e) => (e.key === "Enter" || e.key === " ") && onPick(city.id) : undefined
            }
            style={
              city
                ? { fillOpacity: 0.25 + Math.min(1, (pct.get(city.id) ?? 0) / 100) * 0.6 }
                : undefined
            }
            className={cn(
              "transition-[fill,fill-opacity,stroke] duration-500 outline-none",
              city
                ? "cursor-pointer fill-gold hover:fill-gold-soft focus-visible:stroke-ivory"
                : "fill-white/8",
              on ? "stroke-ivory" : "stroke-wine-deep",
            )}
          />
        );
      })}
    </svg>
  );
}

function Country() {
  const c = useCopy(COPY);
  const tr = useT();
  const { state } = useVision();
  const t = totals(state);
  const [sel, setSel] = useState<string | null>("tirana");
  const cities = state.cities.map((x) => ({
    ...x,
    pct: fundingPct(x),
    groups: state.groups.filter((g) => g.city === x.id).length,
  }));
  const city = cities.find((x) => x.id === sel) ?? null;
  return (
    <div>
      <h2 className="text-2xl font-extrabold">{c.countryH}</h2>
      <p className="mt-1 text-sm text-ivory/70">{c.countryLead}</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold">{c.needFunding}</h3>
            <span className="text-xs text-gold-soft">{c.groupsLine(t.fundedGroups, t.groups)}</span>
          </div>
          <ul className="mt-4 space-y-1">
            {cities.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  aria-pressed={sel === x.id}
                  onClick={() => setSel(x.id)}
                  className={cn(
                    "grid w-full grid-cols-[3.5rem_5rem_1fr] items-center gap-3 rounded-xl px-2 py-2 text-start text-sm transition-colors",
                    sel === x.id ? "bg-white/10" : "hover:bg-white/5",
                  )}
                >
                  <span className={cn("tabular-nums", x.pct > 100 ? "text-gold" : "text-ivory/70")}>
                    {x.pct}%
                  </span>
                  <span className="font-medium">{tr(x.name)}</span>
                  <FundBar city={x} max={Math.max(...cities.map((y) => y.need), 1)} />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex gap-4 text-xs text-ivory/60">
            <span className="flex items-center gap-1.5">
              <i className="h-1.5 w-4 rounded-full bg-white/25" aria-hidden="true" />
              {c.need}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-1.5 w-4 rounded-full bg-gold" aria-hidden="true" />
              {c.funded}
            </span>
          </p>
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <AlbaniaMap
            selected={sel}
            onPick={setSel}
            pct={new Map(cities.map((x) => [x.id, x.pct]))}
          />
          <div aria-live="polite" className="mt-3 min-h-14 text-center">
            {city ? (
              <>
                <p className="font-bold">{tr(city.name)}</p>
                <p className="text-sm text-ivory/70">
                  {c.childrenNeed(city.need)} · {c.groupsIn(city.groups)}
                </p>
              </>
            ) : (
              <p className="text-sm text-ivory/60">{c.pick}</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/** الحاجة شريطٌ خافت بطولها النسبي، والتمويل يملؤه بنسبته. */
function FundBar({ city, max }: { city: { need: number; pct: number }; max: number }) {
  const w = (city.need / max) * 100;
  return (
    <span className="relative block h-2 rounded-full" aria-hidden="true">
      <span
        className="absolute inset-y-0 start-0 rounded-full bg-white/20"
        style={{ width: `${w}%` }}
      />
      <span
        className="vision-bar absolute inset-y-0 start-0 rounded-full bg-gold"
        style={{ width: `${w * Math.min(1, city.pct / 100)}%` }}
      />
    </span>
  );
}

function Invest() {
  const c = useCopy(COPY);
  const tr = useT();
  const { state } = useVision();
  const ranked = rankCities(state);
  const max = Math.max(1, ...ranked.map((x) => x.gap));
  return (
    <div>
      <h2 className="text-2xl font-extrabold">{c.investH}</h2>
      <p className="mt-1 max-w-2xl text-sm text-ivory/70">{c.investLead}</p>
      <ol className="mt-6 space-y-2">
        {ranked.map((x, i) => (
          <li
            key={x.id}
            style={{ ["--i" as string]: i }}
            className={cn(
              "stagger-in grid grid-cols-[2rem_6rem_1fr_auto] items-center gap-3 rounded-xl px-3 py-3",
              i === 0 ? "bg-gold/15 ring-1 ring-gold/40" : "bg-white/[0.03]",
            )}
          >
            <span className="font-serif text-xl text-gold">{i + 1}</span>
            <span className="font-semibold">{tr(x.name)}</span>
            <Bar pct={(x.gap / max) * 100} className="text-ivory" />
            <span className="text-end text-sm tabular-nums text-ivory/80">
              {x.gap > 0 ? c.gap(x.gap) : <span className="text-gold">{c.surplus}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Decide() {
  const c = useCopy(COPY);
  const place = usePlace();
  const money = useMoney();
  const { state, dispatch } = useVision();
  const recs = recommend(state);
  const META = {
    campaign: [Megaphone, c.toSupport],
    newGroup: [Users, c.toOps],
    redirect: [Flag, c.toSupport],
    fundGroup: [HandCoins, c.toSupport],
  } as const;
  return (
    <div>
      <h2 className="text-2xl font-extrabold">{c.decideH}</h2>
      <p className="mt-1 text-sm text-ivory/70">{c.decideLead}</p>
      {recs.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-white/[0.04] p-6 text-sm text-ivory/75">{c.noRecs}</p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {recs.slice(0, 4).map((r) => {
            const [Icon, to] = META[r.kind];
            return (
              <article
                key={r.key}
                className="vision-rise flex flex-col rounded-2xl border border-gold/30 bg-white/[0.04] p-6"
              >
                <p className="flex items-center gap-1.5 text-xs text-gold">
                  <Flag className="size-3.5" aria-hidden="true" />
                  {c.proposal}
                </p>
                <h3 className="mt-2 flex items-center gap-2 text-xl font-bold">
                  <Icon className="size-5 text-gold" aria-hidden="true" />
                  {c.rec[r.kind].h(place(r.city), place(r.group ?? ""))}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-7 text-ivory/75">
                  {c.rec[r.kind].why(
                    r.gap ?? 0,
                    r.pct ?? 0,
                    money(r.amount ?? 0),
                    place(r.group ?? ""),
                  )}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-gold-soft">
                    {c.goesTo}: {to}
                  </span>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "apply", key: r.key })}
                    className="transition-transform active:scale-[0.97] ms-auto min-h-10 rounded-full bg-gold px-5 text-sm font-semibold text-wine-deep"
                  >
                    {c.approve}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <Feed layer="decision" limit={5} dark className="mt-6" />
      <Link
        to="/vision/cycle"
        className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-full bg-ivory px-5 font-semibold text-wine transition-transform active:scale-[0.97]"
      >
        {c.seeCycle}
        <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
      </Link>
    </div>
  );
}
