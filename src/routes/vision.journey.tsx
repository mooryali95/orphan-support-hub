import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpen,
  Check,
  GraduationCap,
  HeartHandshake,
  Package,
  Pause,
  Play,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Bar, Eyebrow, Tally, useT, VisionShell } from "@/components/vision/VisionKit";
import { useMoney, usePlace, useVision } from "@/components/vision/VisionStore";
import { pageTitle } from "@/config/brand";
import { TRAITS } from "@/data/vision-demo";
import { copyOf, defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { childrenOf, nowTraits, traitsOf } from "@/lib/vision-children";
import {
  groupCostOf,
  isFunded,
  KIT_PRICE,
  SESSIONS_PER_CYCLE,
  totals,
  type VisionState,
} from "@/lib/vision-engine";

export const Route = createFileRoute("/vision/journey")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const c = copyOf(COPY, l);
    return {
      meta: [{ title: pageTitle(c.title, false, l) }, { name: "description", content: c.lead }],
    };
  },
  component: () => (
    <VisionShell>
      <JourneyPage />
    </VisionShell>
  ),
});

type Track = "qualify" | "sponsor" | "inkind";
const TRACKS: Array<{ key: Track; Icon: LucideIcon }> = [
  { key: "qualify", Icon: GraduationCap },
  { key: "sponsor", Icon: HeartHandshake },
  { key: "inkind", Icon: Package },
];
const STAGES = 5;
const DONOR = "داعم الجولة";
const MONTHLY = 300;
const KITS = 12;

const COPY = defineCopy("routes/vision.journey", {
  ar: {
    label: "الرحلة الكاملة",
    title: "من دعمك إلى الصورة الكلية",
    lead: "اختر اتجاه الدعم وشاهد رحلته كاملة: الدفع والقيد، ثم التشغيل في الميدان، ثم أثره في السمات الستّ، ثم موقعه في الصورة الكلية لصاحب القرار، على بيانات متصفّحك نفسها.",
    pick: "اختر اتجاه الدعم",
    track: {
      qualify: "التأهيل",
      sponsor: "الكفالة",
      inkind: "الدعم العيني",
    } as Record<Track, string>,
    trackLead: {
      qualify: "تموّل رحلة تأهيلٍ كاملة لمجموعةٍ تنتظر: ستّ جلسات ثم قياسٌ بعدي.",
      sponsor: "تكفل طفلاً بمبلغٍ شهري يصله بإثبات، فيرتفع صموده ودرايته.",
      inkind: "تقدّم حقائب تعليمية تُسلَّم للمجموعة بإثبات، فترتفع كفاياتها وهمّتها.",
    } as Record<Track, string>,
    stages: ["الدعم", "الدفع والقيد", "التشغيل", "الأثر في السمات", "الصورة الكلية"],
    play: "شغّل الرحلة",
    pause: "إيقاف",
    next: "الخطوة التالية",
    again: "رحلةٌ جديدة",
    stageOf: (i: number, n: number) => `المرحلة ${i} من ${n}`,
    supportH: "نيّة الدعم",
    donor: "الداعم",
    amount: "المبلغ",
    to: "الوجهة",
    perMonth: "شهرياً",
    kitsOf: (n: number, price: string) => `${n} حقيبة × ${price}`,
    payH: "الدفع والقيد المالي",
    invoice: "الفاتورة",
    fee: "رسوم البوابة",
    net: "الصافي إلى حساب الندوة",
    status: "الحالة",
    settled: "مُسوّى",
    receipt: "افتح الإيصال",
    opsH: "التشغيل في الميدان",
    opsQualify: "يسجّل المشرف الجلسات الستّ، ثم القياس البعدي.",
    opsSponsor: "يُسلَّم مبلغ الشهر الأوّل للطفل ويُرفق إثبات التسليم.",
    opsInkind: "تُسلَّم الحقائب للمجموعة ويُرفق إثبات التسليم.",
    session: (n: number) => `جلسة ${n}`,
    measure: "القياس البعدي",
    proof: "إثبات التسليم",
    month1: "الشهر الأوّل",
    kitsN: (n: number) => `${n} حقيبة`,
    traitsH: "الأثر في السمات الستّ",
    traitsLead: (who: string) => `ملفّ ${who} (اسمٌ مستعار). الذهبيّ ما تغيّر في هذه الرحلة.`,
    before: "قبل",
    now: "الآن",
    avg: "المتوسّط",
    bigH: "الصورة الكلية في منصّة القرار",
    bigLead: "ما تحرّك في مؤشّرات صاحب القرار بعد هذه الرحلة.",
    kFunding: "نسبة التمويل",
    kGap: "أيتامٌ ينتظرون تأهيلاً",
    kSessions: "جلساتٌ منفّذة",
    kMeasured: "أطفالٌ مقيسون",
    kSponsored: "أطفالٌ مكفولون",
    kMonthly: "كفالات شهرية",
    kKits: "حقائب مسلَّمة",
    kRaised: "إجمالي الدعم",
    toDecision: "افتح لوحة القرار",
    toImpact: "افتح صفحة الأثر",
    unavailable: "لا توجد وجهةٌ متاحة لهذا الاتجاه في بيئتك الآن، ابدأ بيئةً جديدة من أسفل الصفحة.",
    arrow: "←",
  },
  en: {
    label: "The full journey",
    title: "From your support to the big picture",
    lead: "Pick a support track and watch its whole journey: payment and ledger, field operations, its effect on the six traits, then its place in the decision-maker's big picture; on your browser's own data.",
    pick: "Pick a support track",
    track: {
      qualify: "Qualification",
      sponsor: "Sponsorship",
      inkind: "In-kind",
    } as Record<Track, string>,
    trackLead: {
      qualify:
        "Fund a full qualification journey for a waiting group: six sessions, then follow-up measurement.",
      sponsor: "Sponsor a child monthly, delivered with proof; resilience and awareness rise.",
      inkind: "Give learning kits delivered to a group with proof; competencies and drive rise.",
    } as Record<Track, string>,
    stages: ["Support", "Payment & ledger", "Operations", "Effect on traits", "Big picture"],
    play: "Play the journey",
    pause: "Pause",
    next: "Next step",
    again: "New journey",
    stageOf: (i: number, n: number) => `Stage ${i} of ${n}`,
    supportH: "The pledge",
    donor: "Supporter",
    amount: "Amount",
    to: "Destination",
    perMonth: "monthly",
    kitsOf: (n: number, price: string) => `${n} kits × ${price}`,
    payH: "Payment and ledger",
    invoice: "Invoice",
    fee: "Gateway fee",
    net: "Net to WAMY's account",
    status: "Status",
    settled: "Settled",
    receipt: "Open receipt",
    opsH: "Field operations",
    opsQualify: "The supervisor records six sessions, then follow-up measurement.",
    opsSponsor: "The first month is delivered to the child with proof attached.",
    opsInkind: "The kits are delivered to the group with proof attached.",
    session: (n: number) => `Session ${n}`,
    measure: "Follow-up measurement",
    proof: "Proof of delivery",
    month1: "Month one",
    kitsN: (n: number) => `${n} kits`,
    traitsH: "Effect on the six traits",
    traitsLead: (who: string) =>
      `${who}'s file (a pseudonym). Gold marks what this journey changed.`,
    before: "Before",
    now: "Now",
    avg: "Average",
    bigH: "The big picture on the decision platform",
    bigLead: "What moved in the decision-maker's indicators after this journey.",
    kFunding: "Funding",
    kGap: "Orphans awaiting qualification",
    kSessions: "Sessions run",
    kMeasured: "Children measured",
    kSponsored: "Children sponsored",
    kMonthly: "Monthly sponsorships",
    kKits: "Kits delivered",
    kRaised: "Total support",
    toDecision: "Open the decision board",
    toImpact: "Open the impact page",
    unavailable:
      "No destination is available for this track in your sandbox now; start a fresh sandbox below.",
    arrow: "→",
  },
});

/** المبلغ الذي يكفي صافيه (بعد رسوم البطاقة) لتمويل المجموعة كاملة. */
function grossFor(s: VisionState, g: VisionState["groups"][number]) {
  return Math.ceil((groupCostOf(g) - g.funded) / (1 - s.feePercent / 100));
}

/** وجهة كلّ اتجاه من الحال الحاضرة. */
function targetOf(s: VisionState, track: Track) {
  if (track === "qualify") {
    const g = s.groups.find((x) => !isFunded(x));
    return g ? { group: g, child: `${g.id}-c1` } : null;
  }
  if (track === "sponsor") {
    const taken = new Set(s.sponsorships.map((x) => x.child));
    for (const g of s.groups.filter(isFunded))
      for (let i = 1; i <= g.members; i++)
        if (!taken.has(`${g.id}-c${i}`)) return { group: g, child: `${g.id}-c${i}` };
    return null;
  }
  const pending = new Set(s.kits.filter((k) => !k.delivered).map((k) => k.group));
  const g = s.groups.find((x) => isFunded(x) && !pending.has(x.id));
  return g ? { group: g, child: `${g.id}-c1` } : null;
}

function JourneyPage() {
  const c = useCopy(COPY);
  const { state, dispatch } = useVision();
  const [track, setTrack] = useState<Track>("qualify");
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(false);
  // لقطة «قبل» ووجهة الرحلة تُثبَّتان عند بدئها.
  const [run, setRun] = useState<{
    before: VisionState;
    group: string;
    child: string;
    invoice?: string;
    donation?: string;
  } | null>(null);
  const done = useRef(new Set<number>());
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const target = useMemo(() => targetOf(state, track), [state, track]);

  const reset = (t: Track) => {
    setTrack(t);
    setStage(0);
    setPlaying(false);
    setRun(null);
    done.current = new Set();
  };

  // تنفيذ أفعال كلّ مرحلة مرّةً واحدة على المحرّك الحقيقي.
  useEffect(() => {
    if (done.current.has(stage)) return;
    if (stage === 1 && !run) {
      if (!target) return;
      done.current.add(1);
      const g = target.group;
      const r = { before: state, group: g.id, child: target.child };
      setRun(r);
      if (track === "qualify")
        dispatch({
          type: "donate",
          donor: DONOR,
          amount: grossFor(state, g),
          method: "card",
          target: { kind: "group", id: g.id },
        });
      else if (track === "sponsor")
        dispatch({
          type: "sponsor",
          donor: DONOR,
          child: target.child,
          group: g.id,
          monthly: MONTHLY,
        });
      else dispatch({ type: "inkind", donor: DONOR, group: g.id, count: KITS });
      return;
    }
    if (stage === 2 && run) {
      done.current.add(2);
      if (track === "qualify") {
        const g = state.groups.find((x) => x.id === run.group)!;
        let n = g.sessionsDone;
        // سلسلة مؤقّتات مستقلّة عن إعادة التصيير: تتغيّر الحال بعد كلّ جلسة.
        const tick = () => {
          if (n < SESSIONS_PER_CYCLE) {
            dispatch({ type: "session", group: run.group });
            n += 1;
            timers.current.push(window.setTimeout(tick, 380));
          } else dispatch({ type: "measure", group: run.group });
        };
        timers.current.push(window.setTimeout(tick, 300));
        return;
      }
      if (track === "sponsor") dispatch({ type: "deliverSponsorship", child: run.child });
      else dispatch({ type: "deliverKits", group: run.group });
    }
    return undefined;
  }, [stage, run, target, track, state, dispatch]);

  // التشغيل الآلي: مرحلةٌ كلّ بضع ثوانٍ.
  useEffect(() => {
    if (!playing) return;
    if (stage >= STAGES - 1) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setStage((s) => s + 1), stage === 2 ? 4200 : 3200);
    return () => window.clearTimeout(t);
  }, [playing, stage]);

  const donation = run
    ? state.donations.find(
        (d) => d.donor === DONOR && !run.before.donations.some((b) => b.id === d.id),
      )
    : undefined;
  const blocked = !run && !target;

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
      <Eyebrow label={c.label} title={c.title} lead={c.lead} />

      <h2 className="mt-10 text-center text-sm font-semibold text-gold-ink">{c.pick}</h2>
      <div role="radiogroup" aria-label={c.pick} className="mt-3 grid gap-3 md:grid-cols-3">
        {TRACKS.map(({ key, Icon }) => {
          const on = key === track;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => reset(key)}
              className={cn(
                "rounded-3xl border p-5 text-start transition-[background-color,border-color,box-shadow] duration-200 ease-out",
                on
                  ? "border-gold bg-wine-deep text-ivory shadow-lg shadow-wine/20"
                  : "border-wine/15 bg-white/70 text-wine-ink hover:border-wine/30",
              )}
            >
              <Icon className={cn("size-6", on ? "text-gold" : "text-wine")} aria-hidden="true" />
              <p className="mt-3 text-lg font-bold">{c.track[key]}</p>
              <p
                className={cn(
                  "mt-1 text-sm leading-6",
                  on ? "text-ivory/80" : "text-muted-foreground",
                )}
              >
                {c.trackLead[key]}
              </p>
            </button>
          );
        })}
      </div>

      {/* المراحل الخمس */}
      <ol className="mt-8 grid grid-cols-5 gap-2" aria-label={c.label}>
        {c.stages.map((name, i) => (
          <li key={name} aria-current={i === stage ? "step" : undefined}>
            <button
              type="button"
              onClick={() => run && setStage(i)}
              disabled={!run && i > 0}
              className="block min-h-11 w-full pt-2 text-start disabled:cursor-not-allowed"
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-colors duration-300",
                  i < stage ? "bg-gold" : i === stage ? "bg-wine" : "bg-wine/10",
                )}
              />
              <span
                className={cn(
                  "sr-only text-xs font-semibold sm:not-sr-only sm:mt-2 sm:block",
                  i === stage ? "text-wine" : "text-muted-foreground",
                )}
              >
                {name}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-muted-foreground sm:hidden">
        {c.stageOf(stage + 1, STAGES)} · {c.stages[stage]}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        {stage < STAGES - 1 ? (
          <>
            <button
              type="button"
              disabled={blocked}
              onClick={() => setPlaying((p) => !p)}
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-wine px-6 font-semibold text-ivory disabled:opacity-50"
            >
              {playing ? (
                <Pause className="size-4" aria-hidden="true" />
              ) : (
                <Play className="size-4" aria-hidden="true" />
              )}
              {playing ? c.pause : c.play}
            </button>
            <button
              type="button"
              disabled={blocked}
              onClick={() => {
                setPlaying(false);
                setStage((s) => Math.min(STAGES - 1, s + 1));
              }}
              className="inline-flex min-h-12 items-center rounded-full border border-wine/20 px-6 font-semibold text-wine disabled:opacity-50"
            >
              {c.next}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => reset(track)}
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-wine px-6 font-semibold text-ivory"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            {c.again}
          </button>
        )}
      </div>

      {blocked ? (
        <p className="mt-6 rounded-3xl border border-dashed border-wine/20 bg-white/60 p-8 text-center text-sm text-muted-foreground">
          {c.unavailable}
        </p>
      ) : (
        <div key={`${track}-${stage}`} className="vision-rise mt-6" aria-live="polite">
          {stage === 0 && (
            <SupportStage
              track={track}
              group={run ? run.group : target!.group.id}
              child={run?.child ?? target!.child}
            />
          )}
          {stage === 1 && <PayStage donation={donation} />}
          {stage === 2 && run && <OpsStage track={track} group={run.group} child={run.child} />}
          {stage === 3 && run && (
            <TraitsStage track={track} group={run.group} child={run.child} before={run.before} />
          )}
          {stage === 4 && run && <BigStage track={track} before={run.before} />}
        </div>
      )}
    </section>
  );
}

function Panel({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-wine/10 bg-white/80 p-6 shadow-sm md:p-8">
      <h3 className="flex items-center gap-2 text-xl font-bold text-wine">
        <Icon className="size-5 text-gold-ink" aria-hidden="true" />
        {title}
      </h3>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-wine/10 py-3 last:border-0">
      <dt className="text-sm text-muted-foreground">{k}</dt>
      <dd
        className={cn(
          "text-end",
          strong ? "text-lg font-bold text-wine" : "font-semibold text-wine-ink",
        )}
      >
        {v}
      </dd>
    </div>
  );
}

function SupportStage({ track, group, child }: { track: Track; group: string; child: string }) {
  const c = useCopy(COPY);
  const money = useMoney();
  const place = usePlace();
  const { state } = useVision();
  const g = state.groups.find((x) => x.id === group);
  const amount =
    track === "qualify"
      ? g
        ? groupCostOf(g) - g.funded
        : 0
      : track === "sponsor"
        ? MONTHLY
        : KITS * KIT_PRICE;
  return (
    <Panel title={c.supportH} Icon={HeartHandshake}>
      <dl>
        <Row k={c.donor} v={DONOR} />
        <Row
          k={c.to}
          v={track === "sponsor" ? `${place(child)} · ${place(group)}` : place(group)}
        />
        {track === "inkind" && <Row k={c.kitsN(KITS)} v={c.kitsOf(KITS, money(KIT_PRICE))} />}
        <Row
          k={c.amount}
          v={track === "sponsor" ? `${money(amount)} ${c.perMonth}` : money(amount)}
          strong
        />
      </dl>
    </Panel>
  );
}

function PayStage({ donation }: { donation: VisionState["donations"][number] | undefined }) {
  const c = useCopy(COPY);
  const money = useMoney();
  if (!donation) return null;
  return (
    <Panel title={c.payH} Icon={BookOpen}>
      <dl>
        <Row k={c.invoice} v={<span dir="ltr">{donation.invoice}</span>} />
        <Row k={c.amount} v={money(donation.amount)} />
        <Row k={c.fee} v={money(donation.fee)} />
        <Row k={c.net} v={money(donation.net)} strong />
        <Row
          k={c.status}
          v={
            <span className="inline-flex items-center gap-1 text-wine">
              <Check className="size-4 text-gold-ink" aria-hidden="true" />
              {c.settled}
            </span>
          }
        />
      </dl>
      <Link
        to="/vision/receipt/$id"
        params={{ id: donation.id }}
        className="mt-5 inline-flex min-h-11 items-center rounded-full border border-wine/20 px-5 text-sm font-semibold text-wine"
      >
        {c.receipt}
      </Link>
    </Panel>
  );
}

function OpsStage({ track, group, child }: { track: Track; group: string; child: string }) {
  const c = useCopy(COPY);
  const place = usePlace();
  const { state } = useVision();
  const g = state.groups.find((x) => x.id === group);
  if (!g) return null;
  if (track === "qualify")
    return (
      <Panel title={c.opsH} Icon={GraduationCap}>
        <p className="text-sm leading-7 text-muted-foreground">
          {c.opsQualify} — {place(group)}
        </p>
        <ol className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-7">
          {Array.from({ length: SESSIONS_PER_CYCLE }, (_, i) => (
            <li
              key={i}
              className={cn(
                "rounded-2xl border p-3 text-center text-xs font-semibold transition-colors duration-300",
                i < g.sessionsDone
                  ? "border-gold bg-gold/15 text-wine"
                  : "border-wine/10 text-muted-foreground",
              )}
            >
              {c.session(i + 1)}
            </li>
          ))}
          <li
            className={cn(
              "col-span-3 rounded-2xl border p-3 text-center text-xs font-semibold transition-colors duration-300 sm:col-span-1",
              g.after !== null
                ? "border-wine bg-wine text-ivory"
                : "border-wine/10 text-muted-foreground",
            )}
          >
            {c.measure}
          </li>
        </ol>
      </Panel>
    );
  const sp = state.sponsorships.find((x) => x.child === child);
  const kit = state.kits.find((k) => k.group === group);
  const delivered = track === "sponsor" ? (sp?.months ?? 0) > 0 : !!kit?.delivered;
  return (
    <Panel title={c.opsH} Icon={track === "sponsor" ? HeartHandshake : Package}>
      <p className="text-sm leading-7 text-muted-foreground">
        {track === "sponsor" ? c.opsSponsor : c.opsInkind}
      </p>
      <div
        className={cn(
          "mt-5 flex items-center gap-4 rounded-2xl border p-5 transition-colors duration-300",
          delivered ? "border-gold bg-gold/10" : "border-wine/10",
        )}
      >
        <span
          className={cn(
            "grid size-11 place-items-center rounded-full",
            delivered ? "bg-wine text-gold" : "bg-wine/10 text-wine",
          )}
        >
          <Check className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-bold text-wine">{c.proof}</p>
          <p className="text-sm text-muted-foreground">
            {track === "sponsor"
              ? `${place(child)} · ${c.month1}`
              : `${place(group)} · ${c.kitsN(KITS)}`}
          </p>
        </div>
      </div>
    </Panel>
  );
}

function TraitsStage({
  track,
  group,
  child,
  before,
}: {
  track: Track;
  group: string;
  child: string;
  before: VisionState;
}) {
  const c = useCopy(COPY);
  const tr = useT();
  const place = usePlace();
  const { state } = useVision();
  const g = state.groups.find((x) => x.id === group);
  const g0 = before.groups.find((x) => x.id === group);
  if (!g || !g0) return null;
  const idx = Number(child.split("-c").pop()) - 1;
  const kidNow = childrenOf(g)[idx]!;
  const kidThen = childrenOf(g0)[idx]!;
  const then = nowTraits(traitsOf(kidThen, TRAITS), before.boosts[child]);
  const now = nowTraits(traitsOf(kidNow, TRAITS), state.boosts[child]);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const a0 = avg(then.map((x) => x.now));
  const a1 = avg(now.map((x) => x.now));
  return (
    <Panel title={c.traitsH} Icon={GraduationCap}>
      <p className="text-sm text-muted-foreground">{c.traitsLead(place(child))}</p>
      <ul className="mt-5 space-y-4">
        {TRAITS.map((t, i) => {
          const b = then[i]!.now;
          const n = now[i]!.now;
          const up = n - b > 0.05;
          return (
            <li key={t.key}>
              <div className="flex items-baseline justify-between text-sm">
                <span className={cn("font-semibold", up ? "text-wine" : "text-wine-ink")}>
                  {tr(t.name)}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {b.toFixed(1)} {c.arrow}{" "}
                  <span className={cn(up && "font-bold text-gold-ink")}>{n.toFixed(1)}</span>
                </span>
              </div>
              <div className="relative mt-1.5">
                <Bar pct={(n / 24) * 100} tone={up ? "gold" : "wine"} className="text-wine" />
              </div>
            </li>
          );
        })}
      </ul>
      <dl className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-wine/5 p-4">
          <dt className="text-xs text-muted-foreground">
            {c.avg} · {c.before}
          </dt>
          <dd className="mt-1 text-2xl text-wine">
            <Tally to={a0} decimals={1} />
          </dd>
        </div>
        <div className="rounded-2xl bg-wine-deep p-4 text-ivory">
          <dt className="text-xs text-ivory/75">
            {c.avg} · {c.now}
          </dt>
          <dd className="mt-1 text-2xl text-gold">
            <Tally to={a1} decimals={1} />
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

function BigStage({ track, before }: { track: Track; before: VisionState }) {
  const c = useCopy(COPY);
  const { state } = useVision();
  const t0 = totals(before);
  const t1 = totals(state);
  type K = [string, number, number, string];
  const own: K[] =
    track === "qualify"
      ? [
          [c.kSessions, t0.sessions, t1.sessions, ""],
          [c.kMeasured, t0.measured, t1.measured, ""],
        ]
      : track === "sponsor"
        ? [
            [c.kSponsored, t0.sponsored, t1.sponsored, ""],
            [c.kMonthly, t0.sponsorshipMonthly, t1.sponsorshipMonthly, ""],
          ]
        : [[c.kKits, t0.kitsDelivered, t1.kitsDelivered, ""]];
  const rows: K[] = [
    [c.kFunding, t0.pct, t1.pct, "%"],
    [c.kGap, t0.gap, t1.gap, ""],
    ...own,
    [c.kRaised, t0.raised, t1.raised, ""],
  ];
  return (
    <div className="rounded-3xl bg-wine-deep p-6 text-ivory md:p-8">
      <h3 className="text-xl font-bold">{c.bigH}</h3>
      <p className="mt-1 text-sm text-ivory/75">{c.bigLead}</p>
      <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        {rows.map(([k, a, b, suf]) => (
          <div key={k} className="rounded-2xl border border-ivory/10 p-4">
            <dt className="text-xs text-ivory/75">{k}</dt>
            <dd className="mt-2 text-3xl text-gold">
              <Tally to={b} suffix={suf} />
            </dd>
            <p className="mt-1 text-xs text-ivory/60 tabular-nums">
              {c.before}: {Math.round(a).toLocaleString("en")}
              {suf}
            </p>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/vision/decision"
          viewTransition
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-gold px-6 font-semibold text-wine-deep"
        >
          {c.toDecision}
          <ArrowLeft className="size-4 ltr:rotate-180" aria-hidden="true" />
        </Link>
        <Link
          to="/vision/impact"
          viewTransition
          className="inline-flex min-h-12 items-center rounded-full border border-ivory/25 px-6 font-semibold"
        >
          {c.toImpact}
        </Link>
      </div>
    </div>
  );
}
